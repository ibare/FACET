/**
 * index-and-tag 조각의 알고리즘.
 *
 * 주소 하나가 세 토막으로 끊기고, 토막마다 제 일을 맡는다 — 가운데 토막은
 * 들어갈 줄을 고르고, 윗 토막은 그 줄에 남아 누구의 것인지 증언하고, 아랫
 * 토막은 줄 안에서 몇 번째 바이트인지를 말한다.
 *
 * ── 이벤트 (전부 facet 고유 확장, C2)
 *
 *   address-arrives    { addr: number; tag: number; line: number; offset: number }
 *                      주소 하나가 떠오르고, **어디서 끊을지는 이 층이 정한다** —
 *                      가르는 셈이 곧 이 조각의 주장이라 판정으로 싣는다.
 *   address-splits     {}
 *                      끊긴 자리가 벌어진다. 값은 앞 걸음에서 이미 갔고, 이 걸음이
 *                      보이는 것은 갈라짐 그 자체다.
 *   pieces-dispatched  {}
 *                      셋이 제 자리로 간다. **쫓겨나는 앞 태그는 싣지 않는다** —
 *                      어느 줄이 무엇을 들고 있었나는 장면이 쌓아 온 것이라
 *                      장면이 센다 (프로토콜 4 절).
 *   rewind             {}
 *                      한 걸음씩 다시 짚으려고 처음으로 되감는다.
 *   done               {}
 *                      표준 어휘. 마지막 캡션.
 *
 * silent 이벤트는 없다. 조각이므로 `ctx.metric` 도 부르지 않는다 (S-piece).
 *
 * ── 토막의 폭은 여기서 한 번만 셈한다
 *
 * 몇 비트가 오프셋이고 몇 비트가 인덱스인지는 **바탕(라인 크기 · 줄 수 · 주소
 * 비트 수)에 순수 함수를 먹이면 나오는 값**이다. 화면도 같은 수를 써야 하므로
 * `indexAndTagFields` 하나를 내주고 `scene.ts` 가 그것을 부른다 (프로토콜 4 절의
 * B 갈래). 한때 이 폭을 stage 가 제 나름으로 다시 셈했고, `addrBits` 를 보정하는
 * 방식이 두 곳에서 달랐다.
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

/** 바탕이 정하는 것 — 줄의 수와 세 토막의 폭. 걸음이 고치지 않는다. */
export type IndexAndTagFields = {
  /** 라인 하나의 크기 (바이트). 오프셋이 셀 수 있는 칸 수이기도 하다. */
  lineSize: number;
  /** 줄 수. 인덱스가 고를 수 있는 자리의 수다. */
  lineCount: number;
  offsetWidth: number;
  indexWidth: number;
  tagWidth: number;
};

/** 2 의 거듭제곱 n 이 몇 비트를 먹는가. */
function widthOf(n: number): number {
  return Math.max(1, Math.round(Math.log2(Math.max(1, n))));
}

function posInt(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

/**
 * 바탕에서 줄 수와 세 토막의 폭을 낸다 — **algorithm 과 화면이 같이 부르는 하나**.
 *
 * 좁히개도 여기 하나뿐이다. 받는 자리가 둘(`ctx.data` 와 `initialData`)이라도
 * 좁히는 규칙이 두 벌이 되면 폭이 갈린다 (C9).
 */
export function indexAndTagFields(raw: unknown): IndexAndTagFields {
  const d = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const cacheSize = posInt(d.cacheSize, 64);
  const lineSize = posInt(d.lineSize, 16);
  const lineCount = Math.max(1, Math.floor(cacheSize / lineSize));
  const offsetWidth = widthOf(lineSize);
  const indexWidth = widthOf(lineCount);
  // 태그가 한 자리도 없으면 "누구의 것인가" 를 말할 수 없다 — 주소 폭을 늘려 준다.
  const addrBits = Math.max(offsetWidth + indexWidth + 1, posInt(d.addrBits, 10));
  return {
    lineSize,
    lineCount,
    offsetWidth,
    indexWidth,
    tagWidth: addrBits - offsetWidth - indexWidth,
  };
}

export async function indexAndTagAlgorithm(ctx: FacetContext<IndexAndTagData>): Promise<void> {
  const rx = ctx as ReactiveContext<IndexAndTagData>;
  const { addresses, stepMs } = ctx.data;
  // 폭과 줄 수는 화면과 한 함수를 지난다 (프로토콜 4 절 B 갈래).
  const { lineSize, lineCount } = indexAndTagFields(ctx.data);

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

    for (let i = 0; i < addresses.length; i += 1) {
      const addr = addresses[i] ?? 0;
      const offset = addr % lineSize;
      const line = Math.floor(addr / lineSize) % lineCount;
      const tag = Math.floor(addr / (lineSize * lineCount));

      if (!(await gate())) return;
      await ctx.emit({ type: 'address-arrives', payload: { addr, tag, line, offset } });

      // 끊기는 순간에 걸음 하나를 따로 주는 것은 첫 주소에서만이다. 두 번째부터는
      // 독자가 이미 본 장면이라 도착과 끊김을 한 걸음에 잇는다 — 같은 장면을
      // 다섯 번 따로 보이면 조각이 두 배로 길어진다.
      if (i === 0 && !(await gate())) return;
      await ctx.emit({ type: 'address-splits', payload: {} });

      if (!(await gate())) return;
      await ctx.emit({ type: 'pieces-dispatched', payload: {} });
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
