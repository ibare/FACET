/**
 * row-times-column projector — 걸음을 stage 의 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 정형 객체로 만들어 넘긴다 (C9). 화면 문안은 선언에
 * 있고 여기에는 키와 en 원본만 남는다 (C10).
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

/** 한 짝의 만남. 알고리즘이 실어 보내는 것을 그대로 좁힌 모양이다. */
type Step = {
  row: number;
  col: number;
  k: number;
  a: number;
  b: number;
  product: number;
  sum: number;
};

type Stage = {
  mesh(step: Step & { closes: boolean; caption: string }): Promise<void>;
  close(caption: string): Promise<void>;
  rewind(): void;
};

function readStep(payload: unknown): Step | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const row = num(p.row);
  const col = num(p.col);
  const k = num(p.k);
  const a = num(p.a);
  const b = num(p.b);
  const product = num(p.product);
  const sum = num(p.sum);
  if (
    row === null ||
    col === null ||
    k === null ||
    a === null ||
    b === null ||
    product === null ||
    sum === null
  ) {
    return null;
  }
  return { row, col, k, a, b, product, sum };
}

export const rowTimesColumnProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      if (!stage) return;
      switch (event.type) {
        case 'pair-meet': {
          const step = readStep(event.payload);
          if (!step) return;
          await stage.mesh({
            ...step,
            closes: false,
            caption: tr(
              'caption.pairMeet',
              'Row {row} of A and column {col} of B mesh — running total {sum}.',
              { row: step.row, col: step.col, sum: step.sum },
            ),
          });
          return;
        }
        case 'cell-formed': {
          const step = readStep(event.payload);
          if (!step) return;
          await stage.mesh({
            ...step,
            closes: true,
            caption: tr('caption.cellFormed', 'C[{row}][{col}] = {value} — {count} products, one cell.', {
              row: step.row,
              col: step.col,
              value: step.sum,
              // 안쪽 치수를 문안에 못박지 않는다 — 행렬을 바꾸면 화면이 거짓이 된다.
              // cell-formed 는 마지막 항에서만 나오므로 k + 1 이 곧 맞물린 항의 수다.
              count: step.k + 1,
            }),
          });
          return;
        }
        case 'rewind': {
          stage.rewind();
          return;
        }
        case 'done': {
          await stage.close(
            tr('caption.done', 'Every cell of C comes from one row of A and one column of B.'),
          );
          return;
        }
        default:
          // 이 facet 은 위 넷만 발신한다. 그 밖의 것은 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind();
    },
  };
};
