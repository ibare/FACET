/**
 * depth-doubles-count Projector — 층 하나의 사실을 stage 메서드로 옮긴다.
 *
 * algorithm 이 보내는 것은 숫자뿐이고 (층 · 그 층의 자리 · 그때까지의 합),
 * 화면이 무엇이라 말할지는 여기서 정한다 (C10). 문안은 `facet.ts` 의
 * `messages` 에 있고 여기에는 키와 en 원본만 남는다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

/** stage 가 노출하는 계약 (C9 — 오픈 타입은 이 한 곳에서만 좁힌다). */
type DepthStage = {
  showRoot?: (row: DepthRow, caption: string) => void | Promise<void>;
  splitInto?: (row: DepthRow, caption: string) => void | Promise<void>;
  gatherTotal?: (row: DepthRow, caption: string) => void | Promise<void>;
  rewind?: () => void;
};

type DepthRow = {
  depth: number;
  count: number;
  total: number;
};

/** payload 를 좁혀서 넘긴다. 하나라도 수가 아니면 그 걸음은 그린 것이 없다. */
const readRow = (payload: unknown): DepthRow | null => {
  const p = payload as { depth?: unknown; count?: unknown; total?: unknown } | undefined;
  if (typeof p?.depth !== 'number' || !Number.isFinite(p.depth)) return null;
  if (typeof p.count !== 'number' || !Number.isFinite(p.count)) return null;
  if (typeof p.total !== 'number' || !Number.isFinite(p.total)) return null;
  return { depth: p.depth, count: p.count, total: p.total };
};

export const depthDoublesCountProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as DepthStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(): void {
      stage?.rewind?.();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'root-placed': {
          const row = readRow(event.payload);
          if (!row) return;
          await stage?.showRoot?.(row, tr('caption.root', 'Depth 0 holds one slot.'));
          return;
        }
        case 'depth-split': {
          const row = readRow(event.payload);
          if (!row) return;
          await stage?.splitInto?.(
            row,
            tr('caption.split', 'One level down: every slot splits in two — {count} slots.', {
              count: row.count,
            }),
          );
          return;
        }
        case 'total-gathered': {
          const row = readRow(event.payload);
          if (!row) return;
          await stage?.gatherTotal?.(
            row,
            tr('caption.total', 'Only {depth} levels down, and already {total} slots.', {
              depth: row.depth,
              total: row.total,
            }),
          );
          return;
        }
        case 'rewind': {
          stage?.rewind?.();
          return;
        }
        default:
          // 이 algorithm 이 발신하는 이벤트는 위 넷뿐이다. 나머지는 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind?.();
    },
  };
};
