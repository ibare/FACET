/**
 * row-times-column — 결과 행렬의 한 칸은 어디서 오는가.
 *
 * `C[i][j]` 는 A 의 i 번째 행과 B 의 j 번째 열이 맞물려 만들어진다. 행은 눕고
 * 열은 서 있어 둘은 꼭 한 자리에서 만나며, 그 자리가 곧 결과의 칸이다.
 * 알고리즘은 짝을 하나씩 만나게 하고 곱을 그 칸에 쌓는다.
 *
 * **걸음은 항마다 하나다.** 칸마다 하나로 묶으면 셋이 한꺼번에 날아와 무엇과
 * 무엇이 짝인지가 사라진다 — 이 조각이 답하는 물음이 바로 그 짝이다. 대신
 * 걸음이 늘어나므로 `stepMs` 를 낮춰 잡았다 (선언에 있다).
 *
 * ── 이벤트 (C2)
 *   pair-meet    { row, col, k, a, b, product, sum }
 *       A[row][k] 와 B[k][col] 이 C[row][col] 에서 만난다. `sum` 은 이 곱까지의 누적.
 *   cell-formed  { row, col, k, a, b, product, sum }
 *       같은 만남이되 마지막 짝이다. 이 걸음으로 칸이 굳고 `sum` 이 곧 C[row][col].
 *   rewind       {}
 *       처음으로 되감는다. 자동 재생이 끝난 뒤의 첫 `advance` 가 낸다.
 *   done         {}
 *       모든 칸이 찼다.
 *
 * silent 은 쓰지 않는다 — 넷 다 화면이 바뀌는 걸음 경계다.
 * 조각이므로 `ctx.metric` 을 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type RowTimesColumnData = {
  type: 'row-times-column';
  /** 왼쪽 행렬 — 행이 눕는다. */
  a: number[][];
  /** 오른쪽 행렬 — 열이 선다. */
  b: number[][];
  /** 걸음 사이의 정지 시간. 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

export async function rowTimesColumnAlgorithm(
  base: FacetContext<RowTimesColumnData>,
): Promise<void> {
  // reactive 메커니즘이 주입하는 확장 컨텍스트. 등록 시그니처는 `FacetContext` 그대로라
  // 알고리즘 쪽에서 좁혀 받는다 (`runtime/context.ts` 의 규약).
  const ctx = base as ReactiveContext<RowTimesColumnData>;
  const { a, b, stepMs } = ctx.data;

  const rows = a.length;
  const inner = b.length;
  const cols = b[0]?.length ?? 0;
  if (rows === 0 || inner === 0 || cols === 0) return;

  /** 마운트 직후와 되감은 직후의 첫 걸음은 문을 지나지 않는다 (S-piece). */
  let openFirst = true;
  /** 자동 재생을 마친 뒤로는 걸음마다 `advance` 를 기다린다. */
  let manual = false;

  /** 걸음 사이의 문. 이어도 되면 true, 접혔거나 그만두어야 하면 false. */
  async function gate(): Promise<boolean> {
    if (ctx.cancelled) return false;
    if (openFirst) {
      openFirst = false;
      return true;
    }
    if (!manual) return ctx.sleep(stepMs);
    for (;;) {
      let input: ReactiveInputEvent;
      try {
        input = await ctx.waitForInput();
      } catch (err) {
        // reset/destroy 가 reject 한 것은 정상 종료 경로다 (C6·C8).
        if (!ctx.cancelled) throw err;
        return false;
      }
      // 위젯 입력이 섞여 들어와도 걸음으로 세지 않는다 (S-piece).
      if (input.type === 'advance') return !ctx.cancelled;
    }
  }

  /** 한 판. 칸마다 안쪽 치수만큼 짝을 맞물리고, 마지막 짝에서 칸이 굳는다. */
  async function sweep(): Promise<boolean> {
    for (let row = 0; row < rows; row += 1) {
      // 레벨이 깊은 루프는 바깥에도 둔다 (C8). 안쪽 문이 return false 로 빠져나가므로
      // 실질 누수는 없으나, 그 사실이 안쪽 코드를 읽어야만 보이는 것이 문제다.
      if (ctx.cancelled) return false;
      for (let col = 0; col < cols; col += 1) {
        if (ctx.cancelled) return false;
        let sum = 0;
        for (let k = 0; k < inner; k += 1) {
          // 문이 바디의 첫 줄이라 이것이 진입 검사를 대신한다 (C8).
          if (!(await gate())) return false;
          const left = a[row]?.[k] ?? 0;
          const up = b[k]?.[col] ?? 0;
          const product = left * up;
          sum += product;
          const payload = { row, col, k, a: left, b: up, product, sum };
          if (k === inner - 1) {
            await ctx.emit({ type: 'cell-formed', payload });
          } else {
            await ctx.emit({ type: 'pair-meet', payload });
          }
        }
      }
    }
    if (!(await gate())) return false;
    await ctx.emit({ type: 'done', payload: {} });
    return true;
  }

  if (!(await sweep())) return;

  // 다 보인 뒤 — 곱씹으며 읽고 싶은 사람을 위해 한 걸음씩 짚게 한다 (S-piece).
  for (;;) {
    if (ctx.cancelled) return;
    let input: ReactiveInputEvent;
    try {
      input = await ctx.waitForInput();
    } catch (err) {
      // reset/destroy 가 reject 한 것은 정상 종료 경로다 (C6·C8).
      if (!ctx.cancelled) throw err;
      return;
    }
    if (input.type !== 'advance') continue;
    await ctx.emit({ type: 'rewind', payload: {} });
    // 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다. 첫 문만 그냥
    // 통과시켜 첫 걸음까지 보인다 (S-piece).
    manual = true;
    openFirst = true;
    if (!(await sweep())) return;
  }
}
