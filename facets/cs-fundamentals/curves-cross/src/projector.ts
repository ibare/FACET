/**
 * curves-cross projector — 알고리즘의 걸음을 저울의 동작으로 옮긴다.
 *
 * payload 는 여기서 좁혀 stage 로 넘긴다 (C9). stage 는 좁혀진 값만 받는다.
 * 문안은 stage 가 `params.t` 로 가져오므로 이 파일에는 문자열이 없다 (C10).
 */

import type { FacetRuntimeEvent, ProjectorFactory, ProjectorInstance } from '@ffacet/core/runtime';
import type { CurvesCrossLead, CurvesCrossWeighRow } from './curves-cross-stage.js';

type Stage = {
  setBoard(sizes: number[]): Promise<void>;
  weigh(row: CurvesCrossWeighRow): Promise<void>;
  markThreshold(n: number, index: number): Promise<void>;
  showRule(n: number, index: number): Promise<void>;
  rewind(): void;
};

/** 런타임 가드가 뒤따르는 좁히개 (C9). */
function fields(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) return {};
  return payload as Record<string, unknown>;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function leadOf(v: unknown): CurvesCrossLead | null {
  return v === 'insertion' || v === 'merge' || v === 'tie' ? v : null;
}

function sizesOf(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const item of v) {
    const n = num(item);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}

export const curvesCrossProjector: ProjectorFactory = (views): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      if (!stage) return;
      const p = fields(event.payload);

      switch (event.type) {
        case 'board-set': {
          const sizes = sizesOf(p.sizes);
          if (sizes) await stage.setBoard(sizes);
          return;
        }
        case 'weigh': {
          const index = num(p.index);
          const n = num(p.n);
          const insertion = num(p.insertion);
          const merge = num(p.merge);
          const lead = leadOf(p.lead);
          if (index === null || n === null || insertion === null || merge === null || lead === null) return;
          await stage.weigh({ index, n, insertion, merge, lead });
          return;
        }
        case 'mark-threshold': {
          const index = num(p.index);
          const n = num(p.n);
          if (index === null || n === null) return;
          await stage.markThreshold(n, index);
          return;
        }
        case 'library-rule': {
          const index = num(p.index);
          const n = num(p.n);
          if (index === null || n === null) return;
          await stage.showRule(n, index);
          return;
        }
        case 'rewind': {
          stage.rewind();
          return;
        }
        default:
          // 이 알고리즘은 위 다섯만 발신한다. 그 밖은 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind();
    },
  };
};
