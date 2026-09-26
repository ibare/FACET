/**
 * microtask-starvation — 마이크로태스크가 줄을 비우지 않으면 화면이 멎는다.
 *
 * 이벤트 (전부 silent 아님 — 걸음 경계다):
 * - `click`   payload 없음. 클릭 태스크가 마이크로 줄에 `step` 을 세우고 끝난다.
 * - `step`    payload `{ n: number; queued: boolean; passed: BoundaryMark[]; justPassed: BoundaryMark[] }`.
 *             `step` 함수 하나가 돈다 — DOM 이 `n` 으로 오르고, `n` 이 count 보다 작으면
 *             스스로를 마이크로 줄에 다시 세운다(`queued`). `passed` 는 지금까지 렌더 없이
 *             지난 경계 전부(누적, 아직 화면에 그려지지 않음), `justPassed` 는 이 걸음에서
 *             새로 지난 경계만 (0 또는 1 개 — 한 걸음 폭이 프레임 간격보다 좁다).
 * - `render`  payload `{ screen: number; covered: BoundaryMark[] }`. 마이크로 줄이 비어
 *             차례가 끝나 렌더 기회가 온다 — 지난 경계 `covered` 를 한 장으로 그리고
 *             화면 수가 `screen` 으로 건너뛴다.
 *
 * `BoundaryMark = { index; ms }` — `index` 는 1 부터 센 경계 번호, `ms` 는 그 경계의 시각
 * (예: 1 → 16.666…, 60Hz 가정 — common.md 의 렌더 규약).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BoundaryMark = { readonly index: number; readonly ms: number };

/**
 * 60Hz 프레임 경계 전부 — 바탕(`workMs`·`count`)이 정해지면 한 번에 정해지는 표다.
 * `k` 번째 경계 시각은 `k*1000/60`ms. `elapsedMs` 총량(=`workMs*count`) 안에 드는 것만 담는다.
 *
 * algorithm 의 걸음 루프(어느 경계를 지났는지)와 stage 의 눈금(경계가 몇 개고 어디 있는지)이
 * 이 하나의 함수를 함께 불러써, 공식이 두 자리에 따로 있다가 갈리는 일이 없게 한다.
 */
export function frameBoundaryMarks(workMs: number, count: number): BoundaryMark[] {
  const maxElapsedMs = workMs * count;
  const out: BoundaryMark[] = [];
  let k = 1;
  // 정수로 견준다 (elapsedMs*60 >= k*1000) — 분수를 그대로 쥐지 않아 부동소수 오차가 판정에
  // 끼어들지 않는다.
  while (k * 1000 <= maxElapsedMs * 60) {
    out.push({ index: k, ms: (k * 1000) / 60 });
    k += 1;
  }
  return out;
}

export type MicrotaskStarvationFacetData = {
  type: 'microtask-starvation';
  stepMs: number;
  /** 화면에 그대로 뜨는 자바스크립트 일곱 줄 — 번역하지 않는 자료. */
  code: readonly string[];
  /** `busyFor` 한 번이 스택을 붙잡는 ms. */
  workMs: number;
  /** `step` 이 도는 총 횟수. */
  count: number;
};

async function pause(ctx: ReactiveContext<MicrotaskStarvationFacetData>): Promise<boolean> {
  if (ctx.cancelled) return false;
  return (await ctx.sleep(ctx.data.stepMs)) && !ctx.cancelled;
}

export async function microtaskStarvation(
  rawCtx: FacetContext<MicrotaskStarvationFacetData>,
): Promise<void> {
  const ctx = rawCtx as ReactiveContext<MicrotaskStarvationFacetData>;
  const { workMs, count } = ctx.data;

  if (!Number.isInteger(workMs) || workMs <= 0) {
    throw new RangeError(`microtaskStarvation: workMs 는 양의 정수여야 한다 (받은 값 ${workMs})`);
  }
  if (!Number.isInteger(count) || count <= 0) {
    throw new RangeError(`microtaskStarvation: count 는 양의 정수여야 한다 (받은 값 ${count})`);
  }

  // 걸음 0 은 initial() 이 바탕 구조(코드 · 처음 화면)로 채운다 — 읽을 틈을 먼저 준다.
  if (!(await pause(ctx))) return;

  await ctx.emit({ type: 'click' });
  if (!(await pause(ctx))) return;

  const allBoundaries = frameBoundaryMarks(workMs, count);
  let elapsedMs = 0;
  let boundaryPtr = 0;
  const unrendered: BoundaryMark[] = [];

  for (let n = 1; n <= count; n += 1) {
    if (ctx.cancelled) return;
    elapsedMs += workMs;

    const justPassed: BoundaryMark[] = [];
    while (boundaryPtr < allBoundaries.length && allBoundaries[boundaryPtr].index * 1000 <= elapsedMs * 60) {
      const mark = allBoundaries[boundaryPtr];
      unrendered.push(mark);
      justPassed.push(mark);
      boundaryPtr += 1;
    }

    const queued = n < count;
    await ctx.emit({
      type: 'step',
      payload: { n, queued, passed: unrendered.slice(), justPassed },
    });
    if (!(await pause(ctx))) return;
  }

  await ctx.emit({
    type: 'render',
    payload: { screen: count, covered: unrendered.slice() },
  });
  if (!(await pause(ctx))) return;
}
