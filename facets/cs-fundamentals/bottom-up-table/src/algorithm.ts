/**
 * bottomUpTable — 상향식 표 채우기 조각의 알고리즘.
 *
 * 표를 왼쪽에서 오른쪽으로 한 칸씩 채운다. 칸 하나를 채울 때 필요한 값은
 * **이미 왼쪽에 있으므로** 아무것도 부르지 않는다 — 이 알고리즘에는 재귀가
 * 한 줄도 없고, 그래서 걸음마다 발신하는 것도 "누구를 불렀다" 가 아니라
 * "어느 칸에서 어느 칸으로 값이 건너왔다" 뿐이다.
 *
 * 진행 모델은 reactive (S-piece).
 *   - mount 하면 스스로 재생한다. 걸음 간격은 `data.stepMs`.
 *   - 자동 재생을 마치면 `waitForInput` 으로 `advance` 를 기다린다. 첫 누름은
 *     `rewind` 를 발신해 표를 비우고 **곧바로 첫 걸음까지 보인다** — 되감기만
 *     하고 멈추면 눌러도 반응이 없는 것으로 읽힌다.
 *
 * ── 이벤트 어휘 (C2) ────────────────────────────────────────────────────
 * | type     | target     | payload                                  | silent |
 * |----------|------------|------------------------------------------|--------|
 * | `seed`   | `index:<i>`| `{ value: number }`                      | 아니오 |
 * | `fill`   | `index:<i>`| `{ from: [number, number]; value: number }` | 아니오 |
 * | `rewind` | —          | 없음                                     | 아니오 |
 * | `done`   | —          | 없음                                     | 아니오 |
 *
 *   seed   정의가 주는 바닥 칸. 계산이 아니라 주어진 값이다.
 *   fill   `from` 두 칸에서 화살이 뻗어 다음 칸으로 모이고 합이 앉는다.
 *          `from` 은 늘 `[i-2, i-1]` — 화면에서 왼쪽에 있는 것을 먼저 적는다.
 *   done   끝났다는 신호. 칸 수도 덧셈 수도 재귀 호출 수도 싣지 않는다.
 *
 * ── 싣는 것과 싣지 않는 것
 *
 * **`from` 과 `value` 만 싣는다.** 그 둘이 점화식 그 자체라 장면이 스스로 셈하면
 * 같은 규칙이 두 곳에 적히고 언젠가 갈린다 (프로토콜 4 절의 잣대 표 — 걸음이
 * 내리는 판정은 싣는다).
 *
 * 나머지는 전부 장면이 자취에서 센다.
 *   - 차례(`index`) — 칸은 왼쪽부터 하나씩만 차므로 발신 순서가 이미 말한다.
 *   - 읽은 값(`values`) — 표에 이미 있다. 싣으면 캡션의 수가 두 출처가 된다.
 *   - 칸 수 · 덧셈 수 — 자취를 세면 나온다.
 *   - 재귀 호출 수 — `callsOf` 가 "보아야 할 자리가 그때 차 있었나" 를 세어 낸다.
 *     여기서 `calls: 0` 을 상수로 실어 보내면 이 조각의 결론이 화면의 자취와
 *     무관한 수가 된다.
 *   - 들고 있어야 할 칸 — `keepOf` 가 화살이 실제로 뻗은 거리에서 잰다.
 *
 * 메트릭은 없다 (S-piece — 조각은 `ctx.metric` 을 부르지 않는다).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BottomUpTableData = {
  type: 'bottom-up-table';
  /** 표의 마지막 칸 번호. 칸은 `0..n` 으로 `n + 1` 개다. */
  n: number;
  /** 걸음 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

/**
 * 정의가 그냥 주는 칸의 수. `T[0] = 0`, `T[1] = 1` 두 개이며 피보나치 정의의
 * 바닥 사례 그 자체다 — 걸음표를 손으로 적은 것이 아니다.
 */
const BASE_CASES = 2;

/**
 * 표의 칸 수. 바닥 사례 둘은 언제나 있으므로 그 아래로는 못 내려간다.
 *
 * 장면이 같은 함수를 부르므로 **자르는 잣대가 한 자리에만 있다.** 바탕 자료에
 * 순수 함수를 먹여 나오는 값이라 싣지 않고 내준다 (프로토콜 4 절의 B).
 */
export function bottomUpTableCellCount(n: unknown): number {
  const last = typeof n === 'number' ? Math.max(BASE_CASES, Math.trunc(n)) : 5;
  return last + 1;
}

export const bottomUpTable = async (base: FacetContext<BottomUpTableData>): Promise<void> => {
  const ctx = base as ReactiveContext<BottomUpTableData>;
  const cells = bottomUpTableCellCount(ctx.data.n);
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : 700;

  /** 자동 재생 구간인가. 한 바퀴 돌고 나면 걸음마다 입력을 기다린다. */
  let manual = false;
  /** 되감기 직후의 첫 문은 그냥 통과시킨다 (S-piece). */
  let firstGateFree = false;

  const gate = async (): Promise<void> => {
    if (ctx.cancelled) throw new Error('cancelled');
    if (manual) {
      if (firstGateFree) {
        firstGateFree = false;
        return;
      }
      await ctx.waitForInput();
      return;
    }
    const ok = await ctx.sleep(stepMs);
    if (!ok || ctx.cancelled) throw new Error('cancelled');
  };

  const play = async (): Promise<void> => {
    // 표. 재귀 호출은 여기서 한 번도 일어나지 않는다.
    const table: number[] = [0, 1];

    for (let i = 0; i < BASE_CASES; i++) {
      await gate();
      await ctx.emit({
        type: 'seed',
        target: `index:${i}`,
        payload: { value: table[i] },
      });
    }

    for (let i = BASE_CASES; i < cells; i++) {
      table[i] = table[i - 2] + table[i - 1];
      await gate();
      await ctx.emit({
        type: 'fill',
        target: `index:${i}`,
        payload: { from: [i - 2, i - 1], value: table[i] },
      });
    }

    await gate();
    await ctx.emit({ type: 'done' });
  };

  await play();

  // 자동 재생이 끝났다. 이제 곱씹으며 볼 사람을 기다린다.
  for (;;) {
    await ctx.waitForInput();
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'rewind' });
    manual = true;
    firstGateFree = true;
    await play();
  }
};
