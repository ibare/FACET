/**
 * traverse-from-head projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁힌다 (C9). stage 는 좁혀진 숫자만 받으므로 `unknown` 을
 * 만질 일이 없다. 캡션 문안은 키로만 들고 있고 (C10) 실제 문장은
 * `facet.ts` 의 `messages` 에 있다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

/** stage view 와의 계약. optional 메서드는 반드시 `?.()` 로 부른다 (C9). */
type TraverseStage = {
  setData?: (values: number[], targetIndex: number) => void;
  setCaption?: (text: string) => void;
  markTarget?: (index: number) => Promise<void> | void;
  attemptJump?: (from: number, to: number) => Promise<void> | void;
  moveCursor?: (from: number, to: number, hops: number) => Promise<void> | void;
  settle?: (index: number, hops: number) => Promise<void> | void;
  rewind?: () => void;
};

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export const traverseFromHeadProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as TraverseStage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData: unknown) {
      const data = (initialData ?? {}) as { values?: unknown; targetIndex?: unknown };
      const raw = data.values;
      const values = Array.isArray(raw)
        ? raw.filter((v): v is number => typeof v === 'number')
        : [];
      stage.setData?.(values, num(data.targetIndex, 0));
    },

    async onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'mark': {
          const p = event.payload as { index?: unknown } | undefined;
          const index = num(p?.index, 0);
          stage.setCaption?.(
            tr('caption.want', 'We need the node at index {i}.', { i: index }),
          );
          await stage.markTarget?.(index);
          break;
        }
        case 'jump-attempt': {
          const p = event.payload as { from?: unknown; to?: unknown } | undefined;
          stage.setCaption?.(
            tr('caption.noJump', 'No address to compute, so the jump has nowhere to land.'),
          );
          await stage.attemptJump?.(num(p?.from, 0), num(p?.to, 0));
          break;
        }
        case 'cursor-move': {
          const p = event.payload as { from?: unknown; to?: unknown; hops?: unknown } | undefined;
          stage.setCaption?.(
            tr('caption.follow', 'Follow one link. That is the only move there is.'),
          );
          await stage.moveCursor?.(num(p?.from, 0), num(p?.to, 0), num(p?.hops, 0));
          break;
        }
        case 'done': {
          const p = event.payload as
            | { index?: unknown; hops?: unknown; visited?: unknown }
            | undefined;
          const index = num(p?.index, 0);
          const hops = num(p?.hops, 0);
          const visited = num(p?.visited, 0);
          stage.setCaption?.(
            tr('caption.arrived', 'Index {i} took {n} moves through {v} nodes.', {
              i: index,
              n: hops,
              v: visited,
            }),
          );
          await stage.settle?.(index, hops);
          break;
        }
        case 'rewind': {
          stage.rewind?.();
          break;
        }
        default:
          // 이 facet 의 algorithm 은 위 다섯 종류만 발신한다. 그 밖은 silently drop.
          break;
      }
    },

    onReset() {
      stage.rewind?.();
    },
  };
};
