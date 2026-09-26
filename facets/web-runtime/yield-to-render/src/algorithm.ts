/**
 * 이벤트 (facet 고유 확장, C2)
 *
 *   task-run   태스크 하나(`chunk(from)`)가 끝까지 돈다.
 *              payload: { index: number; from: number; to: number; t: number }
 *              index — 몇 번째 조각인가 (0부터). from/to — 이 조각이 채운 DOM 행의 구간.
 *              t — 이 조각이 끝난 시각(ms).
 *   render     한 차례가 끝난 뒤 프레임 경계를 지나 렌더 기회가 왔다.
 *              payload: { t: number; screenRows: number; boundaries: number[] }
 *              t — 렌더 시각(ms). screenRows — 렌더가 그린 화면의 행 수(= 그 시점의 DOM 행 수).
 *              boundaries — 마지막 렌더 뒤로 지난 프레임 경계들(ms, 반올림 전 그대로).
 *
 * silent 발신 없음.
 *
 * 모형은 `common.md` 를 따른다 — 태스크 줄은 하나, 브라우저 API 호출은 0ms, 프레임
 * 경계는 k × 1000/60 (분수 그대로 셈하고 표시만 반올림), 렌더는 한 차례가 끝난
 * 뒤에만 보고 마지막 렌더 뒤로 경계가 하나라도 지났으면 그 자리에서 한 장을 그린다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type YieldToRenderFacetData = {
  type: 'yieldToRender';
  /** 화면에 그대로 보일 다섯 줄 (native 코드, 자료). */
  code: readonly string[];
  /** 넣어야 할 전체 행 수. */
  totalRows: number;
  /** 태스크 하나가 넣는 행 수. */
  chunkRows: number;
  /** 태스크 하나가 쥐고 도는 ms. */
  workMs: number;
  /** 걸음 사이 머무는 ms. */
  stepMs: number;
};

/** 한 프레임의 길이(ms). 60Hz 모형 — 설명 글이 전제를 밝힌다. */
const FRAME_MS = 1000 / 60;

async function yieldToRender(ctx: FacetContext<YieldToRenderFacetData>): Promise<void> {
  const rc = ctx as ReactiveContext<YieldToRenderFacetData>;
  const { totalRows, chunkRows, workMs, stepMs } = rc.data;

  async function pause(): Promise<boolean> {
    if (rc.cancelled) return false;
    return (await rc.sleep(stepMs)) && !rc.cancelled;
  }

  let t = 0;
  let from = 0;
  let index = 0;
  let nextBoundary = 1;

  while (from < totalRows) {
    if (!(await pause())) return;
    const to = Math.min(from + chunkRows, totalRows);
    t += workMs;
    await rc.emit({ type: 'task-run', payload: { index, from, to, t } });

    const boundaries: number[] = [];
    while (nextBoundary * FRAME_MS <= t) {
      boundaries.push(nextBoundary * FRAME_MS);
      nextBoundary += 1;
    }
    if (boundaries.length > 0) {
      if (!(await pause())) return;
      await rc.emit({ type: 'render', payload: { t, screenRows: to, boundaries } });
    }

    index += 1;
    from = to;
  }
}

export { yieldToRender };
