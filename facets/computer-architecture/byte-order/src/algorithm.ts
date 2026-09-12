/**
 * byteOrder — 같은 값을 반대 차례로 늘어놓는다 (조각).
 *
 * 1차 데이터는 **값 하나와 바이트 수 하나**뿐이다. 바이트 쪼개기 · 두 배치 ·
 * 두 읽기 결과는 전부 여기서 셈한다. 화면에 뜨는 수는 지어낸 것이 하나도 없고
 * 이 파일의 셈에서만 나온다 (S-piece 의 실측 조항).
 *
 * ── 이벤트 (전부 facet 고유 확장. silent 인 것은 없다 — 걸음마다 화면이 바뀐다)
 *
 *   value-shown  { bytes: number[] }                 값이 바이트로 갈려 한 줄로 선다
 *   laid-big     { slots: number[] }                 큰 자리가 낮은 주소로 내려앉는다
 *   laid-little  { slots: number[] }                 같은 바이트가 서로 건너가 반대 차례로 앉는다
 *   read-both    { big: number; little: number }     두 배치를 제 규칙으로 읽는다 — 같은 수
 *   misread      { value: number }                   리틀엔디언 바이트열을 빅엔디언으로 읽는다
 *   rewind       (payload 없음)                      처음 상태로 되돌린다
 *
 * `bytes` 와 `slots` 는 0..255 의 바이트 값이고, `slots` 의 첨자가 곧 주소다.
 * `bytes` 만 큰 자리가 앞이라는 사람의 표기 차례이고, 나머지는 주소 차례다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ByteOrderData = {
  type: 'byte-order';
  /** 늘어놓을 값. 여기서 바이트로 갈린다. */
  value: number;
  /** 그 값이 차지하는 바이트 수. 주소 칸의 수이기도 하다. */
  byteCount: number;
  /** 걸음 사이의 정지 시간 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

/** 값을 바이트로 가른다. 앞이 큰 자리 — 사람이 수를 적는 차례다. */
export function splitBytes(value: number, byteCount: number): number[] {
  const out: number[] = [];
  for (let i = byteCount - 1; i >= 0; i -= 1) {
    // 나눗셈으로 가른다. 시프트는 32비트에서 부호가 끼어들어 값이 음수로 돈다.
    out.push(Math.floor(value / 256 ** i) % 256);
  }
  return out;
}

/** 바이트열을 "앞이 큰 자리" 로 이어 붙여 수 하나로 읽는다. */
function readBigFirst(slots: number[]): number {
  let acc = 0;
  for (const b of slots) acc = acc * 256 + b;
  return acc;
}

export async function byteOrderAlgorithm(ctxRaw: FacetContext<ByteOrderData>): Promise<void> {
  const ctx = ctxRaw as ReactiveContext<ByteOrderData>;
  const { value, byteCount, stepMs } = ctx.data;

  const bytes = splitBytes(value, byteCount);
  /** 빅엔디언 — 주소 0 에 큰 자리. 사람이 적는 차례 그대로다. */
  const big = bytes;
  /** 리틀엔디언 — 주소 0 에 작은 자리. 같은 바이트가 정반대 차례로 앉는다. */
  const little = [...bytes].reverse();

  const bigRead = readBigFirst(big);
  // 리틀엔디언은 높은 주소가 큰 자리이므로, 제 규칙으로 읽으면 주소를 거꾸로 훑는다.
  // 그래서 두 수는 같다 — 달라지는 것은 늘어놓는 차례뿐이다.
  const littleRead = readBigFirst([...little].reverse());
  // 차례를 모르는 채 주소 순서대로 이어 붙이면 이 수가 된다. 전혀 다른 수다.
  const misreadValue = readBigFirst(little);

  /**
   * 걸음 사이의 문. 자동 재생일 땐 시간이 열고, 손으로 짚을 땐 `advance` 가 연다.
   * 취소되면 false 로 돌아와 걸음이 거기서 멎는다.
   */
  let manual = false;
  const gate = async (): Promise<boolean> => {
    if (!manual) return ctx.sleep(stepMs);
    for (;;) {
      // 받은 것의 종류를 본다 — 위젯 입력이 붙어도 그것을 걸음으로 세지 않게 (S-piece).
      const input = await ctx.waitForInput();
      if (input.type === 'advance') return true;
    }
  };

  const run = async (): Promise<void> => {
    // 첫 걸음 앞에는 문이 없다. 문은 걸음 *사이*의 것이라 기다릴 앞걸음이 없고,
    // 문을 먼저 두면 마운트 직후 빈 화면이 stepMs 만큼 서 있게 된다 (S-piece).
    await ctx.emit({ type: 'value-shown', payload: { bytes } });
    if (!(await gate())) return;

    await ctx.emit({ type: 'laid-big', payload: { slots: big } });
    if (!(await gate())) return;

    await ctx.emit({ type: 'laid-little', payload: { slots: little } });
    if (!(await gate())) return;

    await ctx.emit({ type: 'read-both', payload: { big: bigRead, little: littleRead } });
    if (!(await gate())) return;

    await ctx.emit({ type: 'misread', payload: { value: misreadValue } });
  };

  await run();
  if (ctx.cancelled) return;

  // 자동 재생이 끝났다. 이제부터는 한 걸음씩 — 처음 누르는 `advance` 는 되감고
  // 첫 걸음까지 보인다. 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다.
  for (;;) {
    const input = await ctx.waitForInput();
    if (input.type !== 'advance') continue;
    manual = true;
    await ctx.emit({ type: 'rewind' });
    // 그 누름이 첫 걸음까지를 낸다. run 의 첫 문에서 다음 누름을 기다린다.
    await run();
    if (ctx.cancelled) return;
  }
}
