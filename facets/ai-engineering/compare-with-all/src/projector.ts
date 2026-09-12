/**
 * 전부 견주기 조각의 Projector — 이벤트를 좁혀 stage 로 넘긴다 (C9).
 *
 * 캡션 문안은 `facet.ts` 의 `messages` 에 있고 여기에는 키와 en 원본만 남는다
 * (C10). 수는 `formatCount` 로 자릿수를 끊어 넘긴다 — 화면의 수 표기가 한
 * 규칙으로 통일되도록 stage 와 같은 함수를 쓴다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

import { formatCount } from './compare-with-all-stage.js';

type CompareWithAllStage = {
  setCaption?(text: string): void;
  sweep?(step: { index: number; n: number; dims: number; total: number }): void | Promise<void>;
  fuse?(step: { total: number }): void | Promise<void>;
  grow?(step: { n: number; dims: number; total: number }): void | Promise<void>;
  rewind?(): void;
};

type Step = { index: number; n: number; dims: number; total: number };

/** payload 를 정형 객체로 조립한다. 필드마다 런타임 가드를 둔다 (C9). */
function readStep(payload: unknown): Step | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const n = num(p.n);
  const dims = num(p.dims);
  const total = num(p.total);
  if (n === null || dims === null || total === null) return null;
  return { index: num(p.index) ?? 0, n, dims, total };
}

export const compareWithAllProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as CompareWithAllStage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'sweep': {
          const step = readStep(event.payload);
          if (!step) return;
          stage.setCaption?.(
            tr('caption.sweep', 'Candidate {i} of {n} — multiplications so far: {total}.', {
              i: step.index + 1,
              n: formatCount(step.n),
              total: formatCount(step.total),
            }),
          );
          await stage.sweep?.(step);
          return;
        }
        case 'fuse': {
          const step = readStep(event.payload);
          if (!step) return;
          stage.setCaption?.(
            tr('caption.fuse', 'Every candidate checked — multiplications: {total}.', {
              total: formatCount(step.total),
            }),
          );
          await stage.fuse?.({ total: step.total });
          return;
        }
        case 'grow': {
          const step = readStep(event.payload);
          if (!step) return;
          stage.setCaption?.(
            tr('caption.grow', '{n} candidates × {d} dimensions — multiplications: {total}.', {
              n: formatCount(step.n),
              d: formatCount(step.dims),
              total: formatCount(step.total),
            }),
          );
          await stage.grow?.({ n: step.n, dims: step.dims, total: step.total });
          return;
        }
        case 'real-scale': {
          const step = readStep(event.payload);
          if (!step) return;
          stage.setCaption?.(
            tr(
              'caption.real',
              '{n} documents × {d} dimensions — the pile grows past the frame: {total}.',
              {
                n: formatCount(step.n),
                d: formatCount(step.dims),
                total: formatCount(step.total),
              },
            ),
          );
          await stage.grow?.({ n: step.n, dims: step.dims, total: step.total });
          return;
        }
        case 'rewind': {
          stage.rewind?.();
          return;
        }
        default:
          // 이 algorithm 은 위 다섯만 발신한다. 그 밖의 것은 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage.rewind?.();
    },
  };
};
