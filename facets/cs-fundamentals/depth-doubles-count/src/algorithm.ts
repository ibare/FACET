/**
 * depth-doubles-count — 깊이가 하나 늘면 자리는 두 배.
 *
 * 한 층 내려갈 때마다 자리마다 둘로 갈라진다. 층은 하나씩 늘어나는데 자리는
 * 곱으로 늘어서, 몇 층 안 내려가도 자리가 아주 많아진다. 걸음은 층 하나가
 * 곧 한 걸음이며, 마지막에 모든 층의 자리를 합쳐 뒤집어 읽는다.
 *
 * ── 식별자
 * target 을 쓰지 않는다. 걸음의 대상은 노드 하나가 아니라 **층 전체** 이고,
 * 층 번호는 `payload.depth` 가 정규 경로다.
 *
 * ── 이벤트 (facet 고유 확장, 전부 silent 아님)
 *   root-placed     { depth: 0; count: 1; total: 1 }   0층에 자리 하나를 놓는다
 *   depth-split     { depth; count; total }            한 층 내려가며 자리가 둘로 벌어진다
 *   total-gathered  { depth; count; total }            모든 층의 자리를 하나로 묶는다
 *   rewind          payload 없음                        처음으로 되돌린다
 *
 *   count = 2^depth        그 층의 자리
 *   total = 2^(depth+1)-1  0층부터 그 층까지의 합
 *
 * ── 메트릭
 * 없다. 조각은 셀 것이 없다 (S-piece).
 *
 * ── 진행
 * reactive. mount 즉시 자동 재생하고, 끝난 뒤 `advance` 입력을 받아 처음부터
 * 한 걸음씩 다시 짚는다. 한 바퀴를 다 돌면 `rewind` 를 발신하고 되돌아간다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DepthDoublesCountData = {
  type: 'depth-doubles-count';
  /** 가장 깊은 층. 0층부터 세므로 층의 개수는 maxDepth + 1 이다. */
  maxDepth: number;
  /** 걸음 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다. */
  stepMs: number;
};

const DEFAULT_MAX_DEPTH = 9;
const DEFAULT_STEP_MS = 700;

/** 그 층의 자리 = 2^depth. */
const slotsAt = (depth: number): number => 2 ** depth;

/** 0층부터 그 층까지의 합 = 2^(depth+1) - 1. */
const slotsThrough = (depth: number): number => 2 ** (depth + 1) - 1;

export const depthDoublesCountAlgorithm = async (
  base: FacetContext<DepthDoublesCountData>,
): Promise<void> => {
  const ctx = base as ReactiveContext<DepthDoublesCountData>;

  const maxDepth = Number.isFinite(ctx.data.maxDepth)
    ? Math.max(1, Math.trunc(ctx.data.maxDepth))
    : DEFAULT_MAX_DEPTH;
  const stepMs = Number.isFinite(ctx.data.stepMs)
    ? Math.max(0, ctx.data.stepMs)
    : DEFAULT_STEP_MS;

  /** 취소 검사와 걸음 간격을 묶는다. false 면 더 나아가지 않는다. */
  const pause = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    return ctx.sleep(stepMs);
  };

  /**
   * 걸음 하나를 발신한다. 자동 재생과 `advance` 순회가 같은 걸음을 써야 하므로
   * 한 곳에 둔다. `type` 은 분기마다 리터럴이다 (C2).
   */
  const emitStep = async (step: number): Promise<void> => {
    if (step === 0) {
      await ctx.emit({
        type: 'root-placed',
        payload: { depth: 0, count: slotsAt(0), total: slotsThrough(0) },
      });
      return;
    }
    if (step <= maxDepth) {
      await ctx.emit({
        type: 'depth-split',
        payload: { depth: step, count: slotsAt(step), total: slotsThrough(step) },
      });
      return;
    }
    await ctx.emit({
      type: 'total-gathered',
      payload: { depth: maxDepth, count: slotsAt(maxDepth), total: slotsThrough(maxDepth) },
    });
  };

  /** 마지막 걸음. 여기까지 오면 화면이 할 말을 다 한 것이다. */
  const lastStep = maxDepth + 1;

  // ── 자동 재생. 0층을 놓고, 층마다 배로 벌리고, 끝에서 합을 묶는다.
  await emitStep(0);
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    if (ctx.cancelled) return;
    if (!(await pause())) return;
    await emitStep(depth);
  }
  if (!(await pause())) return;
  await emitStep(lastStep);

  // ── 곱씹으며 볼 사람을 위해 한 걸음씩. 한 바퀴를 돌면 처음으로 되돌아간다.
  let cursor = lastStep;
  for (;;) {
    if (ctx.cancelled) return;
    const input = await ctx.waitForInput();
    if (input.type !== 'advance') continue;
    if (cursor >= lastStep) {
      await ctx.emit({ type: 'rewind' });
      cursor = 0;
    } else {
      cursor += 1;
    }
    await emitStep(cursor);
  }
};
