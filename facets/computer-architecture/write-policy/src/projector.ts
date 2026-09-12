/**
 * 쓰기 정책 Projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 문안은 한 줄도 여기서 짓지 않는다. 키와 en 원본만 남고 실제 문장은
 * `facet.ts` 의 `messages` 에 있다 (C10).
 */

import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

/** stage 의 구조적 표면. 열린 타입을 좁히는 자리라 한곳에 모아 둔다 (C9). */
type WritePolicyStage = {
  setup?(writes: number[], slots: number, lineBytes: number): void;
  setPace?(mul: number): void;
  reset?(policy: string): void;
  focusWrite?(step: number, line: number): void;
  fill?(slot: number, line: number, step: number): Promise<void>;
  evict?(slot: number, line: number): Promise<void>;
  markDirty?(slot: number, pending: number): void;
  descend?(slot: number, folded: number, reason: string): Promise<void>;
  setCaption?(text: string): void;
  finish?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

const numOf = (v: unknown, fallback = 0): number => (typeof v === 'number' ? v : fallback);

export const writePolicyProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as WritePolicyStage | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 지금 재생 중인 정책 식별자. 문안이 아니라 식별자다. */
  let policy = 'through';
  /** 지금까지 센 것 — 끝맺음 문장이 두 수를 함께 말해야 한다. */
  let edits = 0;
  let sent = 0;
  /** 마지막으로 집은 쓰기 차례. fill 이 어디서 출발하는지가 여기서 온다. */
  let step = -1;

  function policyCaption(): void {
    stage?.setCaption?.(
      policy === 'back'
        ? tr('caption.back', 'write-back: edits pile up on the line and wait.')
        : tr('caption.through', 'write-through: each edit goes straight down.'),
    );
  }

  return {
    onInit(initialData: unknown) {
      const d = initialData as
        | { writes?: unknown; slots?: unknown; lineBytes?: unknown; policy?: unknown }
        | undefined;
      const writes = Array.isArray(d?.writes)
        ? d.writes.filter((x): x is number => typeof x === 'number')
        : [];
      const slots = numOf(d?.slots);
      const lineBytes = numOf(d?.lineBytes);
      if (typeof d?.policy === 'string') policy = d.policy;
      stage?.setup?.(writes, slots, lineBytes);
      stage?.setPace?.(runtime?.getSpeed() ?? 1);
      stage?.reset?.(policy);
      edits = 0;
      sent = 0;
      step = -1;
      policyCaption();
    },

    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const p = event.payload as { phase?: unknown } | undefined;
          panel?.highlightPhase?.(typeof p?.phase === 'string' ? p.phase : null);
          return;
        }

        case 'restart': {
          const p = event.payload as { policy?: unknown } | undefined;
          if (typeof p?.policy === 'string') policy = p.policy;
          edits = 0;
          sent = 0;
          step = -1;
          stage?.setPace?.(runtime?.getSpeed() ?? 1);
          stage?.reset?.(policy);
          policyCaption();
          return;
        }

        case 'write-begin': {
          const p = event.payload as { step?: unknown; line?: unknown } | undefined;
          step = numOf(p?.step, -1);
          edits += 1;
          stage?.focusWrite?.(step, numOf(p?.line));
          return;
        }

        case 'fill': {
          const p = event.payload as { slot?: unknown; line?: unknown } | undefined;
          return stage?.fill?.(numOf(p?.slot), numOf(p?.line), step);
        }

        case 'evict': {
          const p = event.payload as { slot?: unknown; line?: unknown } | undefined;
          return stage?.evict?.(numOf(p?.slot), numOf(p?.line));
        }

        case 'mark-dirty': {
          const p = event.payload as
            | { slot?: unknown; line?: unknown; pending?: unknown }
            | undefined;
          const pending = numOf(p?.pending);
          stage?.markDirty?.(numOf(p?.slot), pending);
          // 이미 고쳐진 줄을 또 고쳤다 — write-back 이 아끼는 자리가 바로 여기다.
          if (pending > 1) {
            stage?.setCaption?.(
              tr('caption.fold', 'Line {line} is edited again. Still nothing goes down.', {
                // 줄 번호다. 칸 번호가 아니다 — 지금 데이터에서만 둘이 우연히 같다.
                line: numOf(p?.line),
              }),
            );
          }
          return;
        }

        case 'descend': {
          const p = event.payload as
            | { slot?: unknown; line?: unknown; folded?: unknown; reason?: unknown }
            | undefined;
          const reason = typeof p?.reason === 'string' ? p.reason : 'through';
          const folded = numOf(p?.folded, 1);
          sent += 1;
          if (reason === 'evict') {
            stage?.setCaption?.(
              tr('caption.evict', 'No room. Line {line} leaves and takes {n} edits down at once.', {
                line: numOf(p?.line),
                n: folded,
              }),
            );
          } else if (reason === 'flush') {
            stage?.setCaption?.(
              tr('caption.flush', 'Replay is over. Lines still holding edits must go down.'),
            );
          }
          return stage?.descend?.(numOf(p?.slot), folded, reason);
        }

        case 'done': {
          stage?.finish?.();
          stage?.setCaption?.(
            tr('caption.done', '{edits} edits, {n} writes reached memory.', { edits, n: sent }),
          );
          return;
        }

        default:
          // 이 facet 의 algorithm 이 내는 이벤트는 위가 전부다. 그 밖의 것은
          // 의도적으로 버린다 (C2).
          return;
      }
    },

    onReset() {
      panel?.clearHighlight?.();
      edits = 0;
      sent = 0;
      step = -1;
    },
  };
};
