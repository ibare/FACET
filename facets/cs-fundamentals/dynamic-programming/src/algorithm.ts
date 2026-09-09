/**
 * 동적 계획법 — 0/1 배낭을 표로 푼다.
 *
 * 두 축을 말한다.
 *   1. **칸 하나는 윗줄 두 칸만 본다** — 이 물건을 안 넣은 값과 넣은 값. 그 둘 중
 *      큰 쪽이 이 칸의 답이고, 그 뒤로 다시 계산하지 않는다.
 *   2. **되돌아가지 않는다** — 재귀도 없고 같은 칸을 두 번 세지도 않는다. 왼쪽 위에서
 *      오른쪽 아래로 한 번 훑으면 끝난다.
 *
 * 식별자 (C1): `cell:<행>-<열>`. 행은 "물건 몇 개까지 썼는가", 열은 "한도가 얼마인가".
 * 정규 경로는 payload 의 `row` / `col` 이며 target 은 어느 칸이 바뀌었는지의 표시다.
 *
 * 이벤트 (C2):
 *   - phase          payload { phase }                                        silent: true
 *   - table-ready    payload { rows, cols, capacity, items: {weight,value}[] }
 *   - cell-pick      target `cell:<i>-<w>`   payload { row, col, item, itemWeight, itemValue }
 *   - weight-checked target `cell:<i>-<w>`   payload { row, col, item, itemWeight, limit, fits }
 *   - carry-down     target `cell:<i>-<w>`   payload { row, col, fromRow, fromCol, value, itemWeight, limit }
 *   - candidates     target [`cell:<i-1>-<w>`, `cell:<i-1>-<w2>`]
 *                    payload { row, col, skipRow, skipCol, skipValue,
 *                              takeRow, takeCol, takeBase, takeGain, takeValue }
 *   - cell-filled    target `cell:<i>-<w>`   payload { row, col, value, origin, skipValue, takeValue }
 *   - done           payload { best, row, col, cells }
 *
 * phase 어휘 (C3) — `irs.ts` 의 phase 필드와 **글자 단위로** 같다:
 *   'build-table' | 'pick-cell' | 'weight-check' | 'skip-item' |
 *   'compare' | 'fill-cell' | 'read-answer'
 *
 * 메트릭 (C5): 'cell-count' · 'compare-count' · 'skip-count'
 *
 * `skip-count` 는 무게가 한도를 넘어 견줄 것도 없이 윗칸을 그대로 물려받은 칸의 수다.
 * 그 칸에서는 `compare-count` 가 오르지 않는다 — 견줌이 실제로 일어나지 않기 때문이다.
 * 둘을 합하면 채운 칸 수와 같다.
 */

import type { FacetContext } from '@ffacet/core/runtime';

export type DynamicProgrammingData = {
  type: 'knapsack';
  /** 물건별 무게. `values` 와 같은 길이. */
  weights: number[];
  /** 물건별 값어치. */
  values: number[];
  /** 배낭이 견디는 무게 한도. 표의 열 수는 이보다 하나 많다 (0 부터라). */
  capacity: number;
};

export async function dynamicProgramming(
  ctx: FacetContext<DynamicProgrammingData>,
): Promise<void> {
  const weights = ctx.data.weights;
  const values = ctx.data.values;
  const capacity = ctx.data.capacity;
  const n = Math.min(weights.length, values.length);

  const phase = async (name: string): Promise<void> => {
    await ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  };

  // ── 표 만들기. 0 행은 "아무 물건도 안 썼을 때" 라 전부 0 이고, 그것이 나머지
  //    모든 칸이 딛고 서는 바닥이다.
  await phase('build-table');
  const table: number[][] = [];
  for (let r = 0; r <= n; r++) table.push(new Array<number>(capacity + 1).fill(0));
  await ctx.emit({
    type: 'table-ready',
    payload: {
      rows: n + 1,
      cols: capacity + 1,
      capacity,
      items: weights.slice(0, n).map((weight, k) => ({ weight, value: values[k] })),
    },
  });

  let cells = 0;

  for (let i = 1; i <= n; i++) {
    for (let w = 0; w <= capacity; w++) {
      if (ctx.cancelled) return;

      const itemWeight = weights[i - 1];
      const itemValue = values[i - 1];

      await phase('pick-cell');
      await ctx.emit({
        type: 'cell-pick',
        target: `cell:${i}-${w}`,
        payload: { row: i, col: w, item: i, itemWeight, itemValue },
      });

      await phase('weight-check');
      const fits = itemWeight <= w;
      await ctx.emit({
        type: 'weight-checked',
        target: `cell:${i}-${w}`,
        payload: { row: i, col: w, item: i, itemWeight, limit: w, fits },
      });

      if (!fits) {
        // 넣을 수조차 없다. 윗줄 같은 자리를 그대로 물려받는다.
        await phase('skip-item');
        const carried = table[i - 1][w];
        table[i][w] = carried;
        cells++;
        ctx.metric('cell-count', 'inc');
        ctx.metric('skip-count', 'inc');
        await ctx.emit({
          type: 'carry-down',
          target: `cell:${i}-${w}`,
          payload: {
            row: i,
            col: w,
            fromRow: i - 1,
            fromCol: w,
            value: carried,
            itemWeight,
            limit: w,
          },
        });
        continue;
      }

      // 들어간다. 안 넣은 값과 넣은 값을 윗줄에서 하나씩 읽어 온다.
      await phase('compare');
      const skipValue = table[i - 1][w];
      const takeBase = table[i - 1][w - itemWeight];
      const takeValue = takeBase + itemValue;
      ctx.metric('compare-count', 'inc');
      await ctx.emit({
        type: 'candidates',
        target: [`cell:${i - 1}-${w}`, `cell:${i - 1}-${w - itemWeight}`],
        payload: {
          row: i,
          col: w,
          skipRow: i - 1,
          skipCol: w,
          skipValue,
          takeRow: i - 1,
          takeCol: w - itemWeight,
          takeBase,
          takeGain: itemValue,
          takeValue,
        },
      });

      await phase('fill-cell');
      const best = takeValue > skipValue ? takeValue : skipValue;
      table[i][w] = best;
      cells++;
      ctx.metric('cell-count', 'inc');
      await ctx.emit({
        type: 'cell-filled',
        target: `cell:${i}-${w}`,
        payload: {
          row: i,
          col: w,
          value: best,
          origin: takeValue > skipValue ? 'take' : 'skip',
          skipValue,
          takeValue,
        },
      });
    }
  }

  if (ctx.cancelled) return;

  await phase('read-answer');
  await ctx.emit({
    type: 'done',
    payload: { best: table[n][capacity], row: n, col: capacity, cells },
  });
}
