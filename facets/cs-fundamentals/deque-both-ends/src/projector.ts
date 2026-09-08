/**
 * dequeBothEndsProjector — 문 두 개짜리 어휘를 stage 호출로 옮긴다.
 *
 * 이벤트의 target (`queue:front` / `queue:back`) 이 어느 문인지를 말하고,
 * projector 는 그 문에 맞는 캡션 키를 골라 stage 에 넘긴다. 문안은 코드에 없다 —
 * 키만 있고 문장은 facet.ts 의 messages 에 있다 (C10).
 */

import { makeTranslator, parseTarget } from '@ffacet/core/runtime';
import type {
  FacetEventTarget,
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
} from '@ffacet/core/runtime';
import type { DequeSide } from './deque-both-ends-stage.js';

/** stage view 의 계약 — 오픈 타입을 좁혀 한 곳에 모은다 (C9). */
type DequeStage = {
  init?(p: { values: number[]; capacity: number }): void;
  enter?(p: { side: DequeSide; value: number }): Promise<void> | void;
  leave?(p: { side: DequeSide }): Promise<void> | void;
  openBothEnds?(): Promise<void> | void;
  rewind?(): void;
  setCaption?(text: string): void;
};

/** target 이 가리키는 문. `queue:` prefix 는 parseTarget 을 거친다 (원칙 4). */
function readSide(target: FacetEventTarget | undefined): DequeSide | null {
  const raw = Array.isArray(target) ? target[0] : target;
  if (typeof raw !== 'string') return null;
  const parsed = parseTarget(raw);
  if (parsed?.prefix !== 'queue') return null;
  if (parsed.id === 'front') return 'front';
  if (parsed.id === 'back') return 'back';
  return null;
}

/** payload 는 믿지 않고 좁힌다 (C9). */
function readValue(payload: unknown): number | null {
  const p = payload as { value?: unknown } | undefined;
  return typeof p?.value === 'number' ? p.value : null;
}

function readInitial(initialData: unknown): { values: number[]; capacity: number } | null {
  const d = initialData as { values?: unknown; capacity?: unknown } | undefined;
  const raw: unknown = d?.values;
  if (!Array.isArray(raw)) return null;
  const values: number[] = [];
  for (const v of raw) if (typeof v === 'number') values.push(v);
  const capacity = typeof d?.capacity === 'number' ? d.capacity : values.length;
  return { values, capacity };
}

export const dequeBothEndsProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as DequeStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData: unknown): void {
      const seed = readInitial(initialData);
      if (!seed) return;
      stage?.init?.(seed);
    },

    onEvent(event: FacetRuntimeEvent): void | Promise<void> {
      switch (event.type) {
        case 'enqueue': {
          const side = readSide(event.target);
          const value = readValue(event.payload);
          if (side === null || value === null) return;
          stage?.setCaption?.(
            side === 'front'
              ? tr('caption.pushFront', 'In through the front door')
              : tr('caption.pushBack', 'In through the back door'),
          );
          return stage?.enter?.({ side, value });
        }
        case 'dequeue': {
          const side = readSide(event.target);
          if (side === null) return;
          stage?.setCaption?.(
            side === 'front'
              ? tr('caption.popFront', 'Out through that same front door')
              : tr('caption.popBack', 'Out through that same back door'),
          );
          return stage?.leave?.({ side });
        }
        case 'done': {
          stage?.setCaption?.(
            tr('caption.bothEnds', 'Two doors, four operations — each end both takes in and gives out'),
          );
          return stage?.openBothEnds?.();
        }
        case 'rewind': {
          stage?.rewind?.();
          return;
        }
        default:
          // 이 facet 의 algorithm 이 내는 이벤트는 위 넷뿐이다. 그 밖은 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind?.();
    },
  };
};
