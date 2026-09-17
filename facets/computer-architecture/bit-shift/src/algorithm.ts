/**
 * 자리 옮기기 — 비트 무리가 통째로 옆으로 밀려간다.
 *
 * 왼쪽으로 한 칸 밀면 자리값이 모두 배가 되어 수가 두 배가 되고, 오른쪽으로 한 칸
 * 밀면 반이 된다. 칸은 유한하므로 끝을 넘어간 비트는 버려지고, 그래서 오른쪽
 * 밀기는 나눗셈이되 내림이다.
 *
 * ── 이벤트 (facet 고유. 표준 어휘에 해당하는 것이 없다 — C2)
 *
 * | type   | payload                                     | silent |
 * |--------|---------------------------------------------|--------|
 * | place  | { dir: 'left' \| 'right', start, bits }      | 아니오 |
 * | shift  | { bits }                                     | 아니오 |
 * | rewind | 없음                                         | 아니오 |
 *
 * `bits` 는 `'0'`/`'1'` 로만 이루어진 `bits` 자리 길이의 문자열이다.
 *
 * `place` 는 시작값을 칸에 놓으며 밀기 하나를 여는 걸음이라 방향과 시작값을 함께
 * 말한다. `shift` 는 거기서 한 칸 민 결과만 말한다 — 방향도 시작값도 몇 칸째인가도
 * 그 밀기를 연 `place` 이후로 정해져 있어 장면이 잇는다. `rewind` 는 칸을 비운다 —
 * 자동 재생을 마친 뒤 `advance` 를 처음 받았을 때만 나간다. payload 가 없다.
 *
 * **비트열 말고는 아무것도 싣지 않는다.** 지금 값은 비트를 세면 나오고, 곱하는 수는
 * 밀린 칸 수에서, 버림 없는 셈은 시작값에 그것을 먹이면 나오며, 끝을 넘어간 비트는
 * 앞 걸음의 비트열 끝자리가 이미 말한다. 실어 보내면 화면의 비트와 글자의 수가
 * 서로 다른 출처를 갖게 된다.
 *
 * 남긴 것이 `bits` 인 까닭은 그것이 **이 조각의 알고리즘 그 자체**이기 때문이다 —
 * 그릇 폭으로 잘리는 밀기를 내주면 여기 남는 말이 없다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BitShiftData = {
  type: string;
  /** 비트 폭. 칸의 개수이자 넘쳐 나가는 지점을 정하는 값. */
  bits: number;
  /** 왼쪽으로 밀어 보일 시작값과 칸 수. */
  leftStart: number;
  leftShifts: number;
  /** 오른쪽으로 밀어 보일 시작값과 칸 수. */
  rightStart: number;
  rightShifts: number;
  /** 걸음 사이의 정지 시간 (S-piece). */
  stepMs: number;
};

const DEFAULT_STEP_MS = 650;

type Dir = 'left' | 'right';

/**
 * i 번째 걸음이 어느 방향의 몇 칸인지.
 *
 * 걸음표를 손으로 적어 두르지 않는다 — 방향 둘과 각 방향의 칸 수가 선언에 있고,
 * 걸음은 거기서 세어 나온다 (S-piece).
 */
function frameAt(d: BitShiftData, i: number): { dir: Dir; start: number; shiftCount: number } {
  const leftFrames = d.leftShifts + 1;
  return i < leftFrames
    ? { dir: 'left', start: d.leftStart, shiftCount: i }
    : { dir: 'right', start: d.rightStart, shiftCount: i - leftFrames };
}

/** 시작값을 shiftCount 칸 민 뒤 그릇에 남는 수. 넘어간 비트는 mask 가 지운다. */
function valueAt(dir: Dir, start: number, shiftCount: number, mask: number): number {
  return dir === 'left' ? (start << shiftCount) & mask : start >>> shiftCount;
}

async function emitFrame(ctx: ReactiveContext<BitShiftData>, i: number): Promise<void> {
  const d = ctx.data;
  const mask = (1 << d.bits) - 1;
  const { dir, start, shiftCount } = frameAt(d, i);
  const bits = valueAt(dir, start, shiftCount, mask).toString(2).padStart(d.bits, '0');

  if (shiftCount === 0) {
    await ctx.emit({ type: 'place', payload: { dir, start, bits } });
    return;
  }
  await ctx.emit({ type: 'shift', payload: { bits } });
}

export async function bitShiftAlgorithm(base: FacetContext<BitShiftData>): Promise<void> {
  const ctx = base as ReactiveContext<BitShiftData>;
  const d = ctx.data;
  const stepMs = Number.isFinite(d.stepMs) ? d.stepMs : DEFAULT_STEP_MS;
  const frames = d.leftShifts + 1 + (d.rightShifts + 1);

  for (let i = 0; i < frames; i += 1) {
    // 문은 걸음 사이의 것이다. 첫 걸음 앞에는 기다릴 앞걸음이 없으므로 지나지
    // 않는다 — 먼저 두면 stepMs 만큼 빈 화면이 보인 뒤에야 그림이 선다 (S-piece).
    if (i > 0 && !(await ctx.sleep(stepMs))) return;
    await emitFrame(ctx, i);
    if (ctx.cancelled) return;
  }

  // 자동 재생이 끝났다. 곱씹으며 한 걸음씩 짚어 보려는 사람을 기다린다.
  let cursor = frames - 1;
  for (;;) {
    if (ctx.cancelled) return;
    // 받은 것의 종류를 본다 — 위젯 입력이 붙는 날 그것까지 걸음으로 세지 않도록.
    if ((await ctx.waitForInput()).type !== 'advance') continue;
    if (cursor >= frames - 1) {
      // 끝에 서 있으면 되감고 첫 걸음까지 간다. 되감기만 하고 멈추면 눌러도
      // 반응이 없는 것으로 읽힌다 (S-piece).
      await ctx.emit({ type: 'rewind' });
      cursor = 0;
    } else {
      cursor += 1;
    }
    if (ctx.cancelled) return;
    await emitFrame(ctx, cursor);
  }
}
