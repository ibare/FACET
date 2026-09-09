/**
 * circular-buffer-wrap projector — 이벤트를 stage 메서드로 옮기는 유일한 번역기.
 *
 * payload 는 여기서 한 번 좁히고, stage 는 좁혀진 값만 받는다 (C9). 캡션 문안은
 * facet.ts 의 messages 에 있고 이 파일에는 키와 en 원본만 남는다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

type BufferState = { slots: (number | null)[]; head: number; tail: number };
type Move = { value: number; slot: number; from: number; to: number };

/** stage view 의 호출 가능한 표면. */
type Stage = {
  showState(state: BufferState): void;
  putValue(move: Move): Promise<void>;
  takeValue(move: Move): Promise<void>;
  setCaption(text: string): void;
};

function readState(raw: unknown): BufferState | null {
  const p = raw as { slots?: unknown; head?: unknown; tail?: unknown } | undefined;
  if (!Array.isArray(p?.slots)) return null;
  if (typeof p?.head !== 'number' || typeof p?.tail !== 'number') return null;
  const slots: (number | null)[] = [];
  for (const v of p.slots) slots.push(typeof v === 'number' ? v : null);
  return { slots, head: p.head, tail: p.tail };
}

function readMove(raw: unknown): (Move & { wrapped: boolean }) | null {
  const p = raw as
    | { value?: unknown; slot?: unknown; from?: unknown; to?: unknown; wrapped?: unknown }
    | undefined;
  if (typeof p?.value !== 'number' || typeof p?.slot !== 'number') return null;
  if (typeof p?.from !== 'number' || typeof p?.to !== 'number') return null;
  return {
    value: p.value,
    slot: p.slot,
    from: p.from,
    to: p.to,
    wrapped: p.wrapped === true,
  };
}

export const circularBufferWrapProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 처음 배치를 말하는 한 문장. 되감기도 같은 자리로 돌아가므로 한 곳에 둔다. */
  const startCaption = (state: BufferState): string =>
    tr('caption.start', '{count} slots. head reads at {head}, tail writes at {tail}.', {
      count: state.slots.length,
      head: state.head,
      tail: state.tail,
    });

  /** 처음 배치의 그림자 사본 — 되감기가 다시 그릴 자리 (원칙 5). */
  let initial: BufferState | null = null;

  return {
    onInit(initialData: unknown): void {
      const state = readState(initialData);
      if (!state) return;
      initial = state;
      stage?.showState(state);
      stage?.setCaption(startCaption(state));
    },

    onEvent(event: FacetRuntimeEvent): void | Promise<void> {
      switch (event.type) {
        case 'enqueue': {
          const move = readMove(event.payload);
          if (!move) return;
          stage?.setCaption(
            tr('caption.put', '{value} is written into slot {slot}; tail moves on to {to}.', {
              value: move.value,
              slot: move.slot,
              to: move.to,
            }),
          );
          return stage?.putValue(move);
        }

        case 'dequeue': {
          const move = readMove(event.payload);
          if (!move) return;
          stage?.setCaption(
            move.wrapped
              ? tr(
                  'caption.takeWrap',
                  'Slot {slot} was the last one, so head comes back around to {to}.',
                  { slot: move.slot, to: move.to },
                )
              : tr('caption.take', 'Slot {slot} gives up {value}; head moves on to {to}.', {
                  slot: move.slot,
                  value: move.value,
                  to: move.to,
                }),
          );
          return stage?.takeValue(move);
        }

        case 'rewind': {
          if (!initial) return;
          stage?.showState(initial);
          stage?.setCaption(startCaption(initial));
          return;
        }

        case 'done': {
          if (!initial) return;
          stage?.setCaption(
            tr('caption.done', 'Still {count} slots — nothing grew.', {
              count: initial.slots.length,
            }),
          );
          return;
        }

        // 이 algorithm 은 위 넷만 발신한다. 그 밖의 것은 조용히 버린다 (C2).
        default:
          return;
      }
    },
  };
};
