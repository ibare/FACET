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
 * | type     | target     | payload                                            | silent |
 * |----------|------------|----------------------------------------------------|--------|
 * | `seed`   | `index:<i>`| `{ index: number; value: number }`                  | 아니오 |
 * | `fill`   | `index:<i>`| `{ index, from: [number, number],                    | 아니오 |
 * |          |            |    values: [number, number], value: number }`       |        |
 * | `rewind` | —          | 없음                                                | 아니오 |
 * | `done`   | —          | `{ cells, fills, calls, keep: [number, number] }`   | 아니오 |
 *
 *   seed   정의가 주는 바닥 칸. 계산이 아니라 주어진 값이다.
 *   fill   `from` 두 칸에서 화살이 뻗어 `index` 로 모이고 합이 앉는다.
 *          `from` 은 늘 `[i-2, i-1]` — 화면에서 왼쪽에 있는 것을 먼저 적는다.
 *   done   `calls` 는 이 알고리즘이 일으킨 재귀 호출 수다. 구조상 언제나 0 이며,
 *          그 0 이 이 조각이 하려는 말이다.
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

export const bottomUpTable = async (base: FacetContext<BottomUpTableData>): Promise<void> => {
  const ctx = base as ReactiveContext<BottomUpTableData>;
  const n = typeof ctx.data.n === 'number' ? Math.max(BASE_CASES, Math.trunc(ctx.data.n)) : 5;
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
        payload: { index: i, value: table[i] },
      });
    }

    for (let i = BASE_CASES; i <= n; i++) {
      table[i] = table[i - 2] + table[i - 1];
      await gate();
      await ctx.emit({
        type: 'fill',
        target: `index:${i}`,
        payload: {
          index: i,
          from: [i - 2, i - 1],
          values: [table[i - 2], table[i - 1]],
          value: table[i],
        },
      });
    }

    await gate();
    await ctx.emit({
      type: 'done',
      payload: {
        cells: n + 1,
        fills: n - BASE_CASES + 1,
        // 재귀 호출 수. 부른 적이 없으므로 0 이다.
        calls: 0,
        keep: [n - 1, n],
      },
    });
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
