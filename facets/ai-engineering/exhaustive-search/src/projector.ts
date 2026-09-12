/**
 * 완전 탐색 projector — algorithm 의 이벤트를 무대 호출로 옮긴다.
 *
 * 문안은 여기서 만들고 (`runtime.t`), 자리는 stage 가 셈한다. 코드에는 키와
 * en 원본만 남고 문안은 `facet.ts` 의 messages 에 있다 (C10).
 */

import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';
import { makeTranslator, parseTarget } from '@ffacet/core/runtime';

import { formatAmount } from './exhaustive-search-stage.js';
import type { ExhaustiveScene, ExhaustiveStep } from './exhaustive-search-stage.js';

/** stage 가 내주는 호출 표면. 오픈 타입을 좁히는 자리는 여기 하나다 (C9). */
type Stage = {
  setScene(scene: ExhaustiveScene, caption: string): void;
  advance(step: ExhaustiveStep): Promise<void>;
  finish(caption: string): Promise<void>;
  reset?(): void;
};

/** 이벤트 payload 를 좁힌다. 검사를 거친 값만 stage 로 넘어간다 (C9). */
function num(source: Record<string, unknown> | undefined, key: string): number | null {
  const v = source?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

/** `index:3` 에서 3 을 꺼낸다. 식별자 파싱은 parseTarget 을 경유한다 (C1). */
function indexOfTarget(target: FacetRuntimeEvent['target']): number {
  if (typeof target !== 'string') return -1;
  const parsed = parseTarget(target);
  if (parsed === null || parsed.prefix !== 'index') return -1;
  const n = Number(parsed.id);
  return Number.isInteger(n) ? n : -1;
}

export const exhaustiveSearchProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage;
  const tr = runtime?.t ?? makeTranslator();
  let scene: ExhaustiveScene | null = null;

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = asRecord(event.payload);

      switch (event.type) {
        case 'state-changed': {
          const dim = num(p, 'dim');
          const candidates = num(p, 'candidates');
          const unit = num(p, 'unit');
          const tilesMax = num(p, 'tilesMax');
          const multiplies = num(p, 'multiplies');
          const vectorBytes = num(p, 'vectorBytes');
          const totalBytes = num(p, 'totalBytes');
          if (
            dim === null || candidates === null || unit === null || tilesMax === null ||
            multiplies === null || vectorBytes === null || totalBytes === null
          ) {
            return;
          }
          scene = { candidates, dim, unit, tilesMax, multiplies, vectorBytes, totalBytes };
          stage.setScene(
            scene,
            tr('caption.setup', 'Dimensions {d}. Candidates: {n}.', {
              d: formatAmount(dim),
              n: formatAmount(candidates),
            }),
          );
          return;
        }

        case 'mark': {
          const scanned = num(p, 'scanned');
          const candidates = num(p, 'candidates');
          const multiplies = num(p, 'multiplies');
          if (scanned === null || candidates === null || multiplies === null) return;
          await stage.advance({
            scanned,
            active: indexOfTarget(event.target),
            multiplies,
            caption: tr('caption.scan', 'Scanned {done} of {n}. Multiplications: {mult}.', {
              done: formatAmount(scanned),
              n: formatAmount(candidates),
              mult: formatAmount(multiplies),
            }),
          });
          return;
        }

        case 'done': {
          const candidates = num(p, 'candidates');
          const multiplies = num(p, 'multiplies');
          const bytes = num(p, 'bytes');
          if (candidates === null || multiplies === null || bytes === null) return;
          await stage.finish(
            tr('caption.done', 'All {n} scanned. Multiplications: {mult}, bytes: {bytes}.', {
              n: formatAmount(candidates),
              mult: formatAmount(multiplies),
              bytes: formatAmount(bytes),
            }),
          );
          return;
        }

        default:
          // algorithm 이 내보내는 것은 위 셋뿐이다 (C2). 그 밖의 것은 조용히 흘린다.
          return;
      }
    },

    onReset(): void {
      scene = null;
      stage.reset?.();
    },
  };
};
