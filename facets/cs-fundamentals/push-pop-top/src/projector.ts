/**
 * push-pop-top projector — algorithm 의 걸음을 통 그림의 메서드 호출로 옮긴다.
 *
 * 캡션은 키로만 다룬다 (C10). 문안 정본은 facet.ts 의 `messages` 에 있고 여기
 * 남는 것은 키와 en 원본뿐이다. payload 는 가드로 좁힌 뒤 stage 로 넘긴다 (C9).
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

/** stage view 와의 계약. 열린 타입(ViewInstance) 을 여기서 한 번만 좁힌다. */
type PushPopTopStage = {
  reset?(): void;
  setCaption?(text: string): void;
  showOpening?(): Promise<void>;
  push?(p: { slot: number; top: number }): Promise<void>;
  probeBlocked?(p: { slot: number; topSlot: number }): Promise<void>;
  pop?(p: { slot: number; top: number }): Promise<void>;
  markDone?(): Promise<void>;
};

type PushInfo = { value: number; slot: number; top: number };
type BlockedInfo = { value: number; slot: number; topSlot: number; blocker: number };
type PopInfo = { value: number; slot: number; top: number; blocker: number | null };

function readPush(payload: unknown): PushInfo | null {
  const p = payload as { value?: unknown; slot?: unknown; top?: unknown } | undefined;
  if (typeof p?.value !== 'number') return null;
  if (typeof p.slot !== 'number' || typeof p.top !== 'number') return null;
  return { value: p.value, slot: p.slot, top: p.top };
}

function readBlocked(payload: unknown): BlockedInfo | null {
  const p = payload as
    | { value?: unknown; slot?: unknown; topSlot?: unknown; blocker?: unknown }
    | undefined;
  if (typeof p?.value !== 'number' || typeof p.blocker !== 'number') return null;
  if (typeof p.slot !== 'number' || typeof p.topSlot !== 'number') return null;
  return { value: p.value, slot: p.slot, topSlot: p.topSlot, blocker: p.blocker };
}

function readPop(payload: unknown): PopInfo | null {
  const p = payload as
    | { value?: unknown; slot?: unknown; top?: unknown; blocker?: unknown }
    | undefined;
  if (typeof p?.value !== 'number') return null;
  if (typeof p.slot !== 'number' || typeof p.top !== 'number') return null;
  return {
    value: p.value,
    slot: p.slot,
    top: p.top,
    blocker: typeof p.blocker === 'number' ? p.blocker : null,
  };
}

export const pushPopTopProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as PushPopTopStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  const say = (key: string, fallback: string, vars?: Record<string, number>): void => {
    stage?.setCaption?.(tr(key, fallback, vars));
  };

  return {
    onInit() {
      stage?.reset?.();
    },

    onReset() {
      stage?.reset?.();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'stage-ready': {
          say('caption.oneOpening', 'One opening. Everything enters and leaves through this end.');
          await stage?.showOpening?.();
          break;
        }
        case 'push-enter': {
          const p = readPush(event.payload);
          if (!p) break;
          say('caption.push', 'Push {value} — it lands on top, and top rises to {top}.', {
            value: p.value,
            top: p.top,
          });
          await stage?.push?.({ slot: p.slot, top: p.top });
          break;
        }
        case 'probe-blocked': {
          const p = readBlocked(event.payload);
          if (!p) break;
          say('caption.blocked', '{value} is buried under {blocker}. No hand reaches past the top.', {
            value: p.value,
            blocker: p.blocker,
          });
          await stage?.probeBlocked?.({ slot: p.slot, topSlot: p.topSlot });
          break;
        }
        case 'pop-exit': {
          const p = readPop(event.payload);
          if (!p) break;
          if (p.blocker === null) {
            say('caption.pop', 'Pop {value} — only the top may leave, so top falls to {top}.', {
              value: p.value,
              top: p.top,
            });
          } else {
            say(
              'caption.popUnblocked',
              'Now {value} is the top. It became reachable only after {blocker} left.',
              { value: p.value, blocker: p.blocker },
            );
          }
          await stage?.pop?.({ slot: p.slot, top: p.top });
          break;
        }
        case 'rewind': {
          stage?.reset?.();
          break;
        }
        case 'done': {
          say('caption.lifo', 'Last in, first out — the order out is the order in, reversed.');
          await stage?.markDone?.();
          break;
        }
        default:
          // 이 algorithm 이 내지 않는 이벤트. 조용히 버린다 (C2).
          break;
      }
    },
  };
};
