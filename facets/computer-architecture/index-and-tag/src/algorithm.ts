/**
 * index-and-tag 조각의 알고리즘.
 *
 * 주소 하나가 세 토막으로 끊기고, 토막마다 제 일을 맡는다 — 가운데 토막은
 * 들어갈 줄을 고르고, 윗 토막은 그 줄에 남아 누구의 것인지 증언하고, 아랫
 * 토막은 줄 안에서 몇 번째 바이트인지를 말한다.
 *
 * ── 이벤트 (전부 facet 고유 확장, C2)
 *
 *   address-arrives    { addr: number; tagBits: string; indexBits: string; offsetBits: string }
 *                      주소 하나가 통째로 떠오른다. **어디서 끊을지는 이 층이 정한다** —
 *                      세 토막의 비트열을 함께 보내므로 stage 는 비트를 자르지 않는다.
 *   address-splits     {}
 *                      끊긴 자리가 벌어진다. 값은 앞 걸음에서 이미 갔고, 이 걸음이
 *                      보이는 것은 갈라짐 그 자체다.
 *   pieces-dispatched  { line: number; tag: number; offset: number; evicted: number | null }
 *                      셋이 제 자리로 간다. evicted 는 그 줄이 들고 있던 앞 태그이며,
 *                      비어 있었거나 같은 태그면 null 이다.
 *   rewind             {}
 *                      한 걸음씩 다시 짚으려고 처음으로 되감는다.
 *   done               {}
 *                      표준 어휘. 마지막 캡션.
 *
 * silent 이벤트는 없다. 조각이므로 `ctx.metric` 도 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type IndexAndTagData = {
  type: string;
  /** 캐시 전체 크기 (바이트). */
  cacheSize: number;
  /** 라인 하나의 크기 (바이트). */
  lineSize: number;
  /**
   * 주소를 몇 비트로 적는가. 세 토막의 폭이 여기서 갈린다 —
   * 오프셋은 라인 크기가, 인덱스는 줄 수가 정하고, 남는 것이 태그다.
   */
  addrBits: number;
  /** 차례로 훑을 주소. */
  addresses: number[];
  /** 걸음 사이에 쉬는 시간 (S-piece). */
  stepMs: number;
};

/** 값을 width 자리 이진수 문자열로. 앞을 0 으로 채운다. */
function toBits(value: number, width: number): string {
  let out = '';
  for (let i = width - 1; i >= 0; i -= 1) out += (value >> i) & 1;
  return out;
}

/** 2 의 거듭제곱 n 이 몇 비트를 먹는가. */
function widthOf(n: number): number {
  return Math.max(1, Math.round(Math.log2(Math.max(1, n))));
}

export async function indexAndTagAlgorithm(ctx: FacetContext<IndexAndTagData>): Promise<void> {
  const rx = ctx as ReactiveContext<IndexAndTagData>;
  const { cacheSize, lineSize, addrBits, addresses, stepMs } = ctx.data;

  const lineCount = Math.max(1, Math.floor(cacheSize / lineSize));
  const offsetWidth = widthOf(lineSize);
  const indexWidth = widthOf(lineCount);
  const tagWidth = Math.max(1, addrBits - offsetWidth - indexWidth);

  /** advance 로 한 걸음씩 짚는 중인가. 자동 재생을 마친 뒤부터 참이 된다. */
  let manual = false;
  /** 이번 회차의 첫 문인가. 첫 걸음 앞에는 기다릴 앞걸음이 없다 (S-piece). */
  let firstGate = true;

  /** 걸음 사이의 문. 자동이면 쉬고, 한 걸음씩이면 advance 를 기다린다. */
  async function gate(): Promise<boolean> {
    if (firstGate) {
      firstGate = false;
      return !ctx.cancelled;
    }
    if (!manual) return rx.sleep(stepMs);
    for (;;) {
      const input = await rx.waitForInput();
      // 위젯 입력이 붙으면 그것까지 걸음으로 세게 된다 — 종류를 본다 (S-piece).
      if (input.type === 'advance') return !ctx.cancelled;
    }
  }

  async function play(): Promise<void> {
    firstGate = true;
    /** 줄 → 그 줄이 지금 들고 있는 태그. 회차마다 새로 시작한다. */
    const held = new Map<number, number>();

    for (let i = 0; i < addresses.length; i += 1) {
      const addr = addresses[i] ?? 0;
      const offset = addr % lineSize;
      const line = Math.floor(addr / lineSize) % lineCount;
      const tag = Math.floor(addr / (lineSize * lineCount));

      if (!(await gate())) return;
      await ctx.emit({
        type: 'address-arrives',
        payload: {
          addr,
          tagBits: toBits(tag, tagWidth),
          indexBits: toBits(line, indexWidth),
          offsetBits: toBits(offset, offsetWidth),
        },
      });

      // 끊기는 순간에 걸음 하나를 따로 주는 것은 첫 주소에서만이다. 두 번째부터는
      // 독자가 이미 본 장면이라 도착과 끊김을 한 걸음에 잇는다 — 같은 장면을
      // 다섯 번 따로 보이면 조각이 두 배로 길어진다.
      if (i === 0 && !(await gate())) return;
      await ctx.emit({ type: 'address-splits', payload: {} });

      const before = held.get(line);
      const evicted = before !== undefined && before !== tag ? before : null;
      held.set(line, tag);

      if (!(await gate())) return;
      await ctx.emit({ type: 'pieces-dispatched', payload: { line, tag, offset, evicted } });
    }

    if (!(await gate())) return;
    await ctx.emit({ type: 'done', payload: {} });
  }

  await play();

  // 자동 재생이 끝났다. 곱씹으며 읽고 싶은 사람을 위해 한 걸음씩 다시 짚는다 —
  // 처음 누르는 advance 는 되감고 첫 걸음까지 간다 (S-piece).
  for (;;) {
    const input = await rx.waitForInput();
    if (input.type !== 'advance') continue;
    manual = true;
    await ctx.emit({ type: 'rewind', payload: {} });
    await play();
    if (ctx.cancelled) return;
  }
}
