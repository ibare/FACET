/**
 * cannot-unset 의 번역기.
 *
 * payload 는 여기서 좁혀 stage 로 넘긴다 — `event.payload` 를 그대로 흘리지
 * 않는다 (C9). 화면 문안은 키로만 다루고 문장은 `facet.ts` 의 선언에서 온다 (C10).
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

type CannotUnsetStage = {
  stand?(words: { word: string; slots: number[] }[]): Promise<void> | void;
  verify?(words: string[]): Promise<void> | void;
  select?(word: string, slots: number[]): Promise<void> | void;
  clear?(slots: number[]): Promise<void> | void;
  collapse?(removed: string, broken: string[]): Promise<void> | void;
  verdict?(absent: string[]): Promise<void> | void;
  rewind?(): void;
  setCaption?(value: string): void;
};

function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((v): v is number => typeof v === 'number') : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function field(payload: unknown, key: string): unknown {
  if (typeof payload !== 'object' || payload === null) return undefined;
  return (payload as Record<string, unknown>)[key];
}

function words(payload: unknown): { word: string; slots: number[] }[] {
  const raw = field(payload, 'words');
  if (!Array.isArray(raw)) return [];
  const out: { word: string; slots: number[] }[] = [];
  for (const item of raw) {
    const word = field(item, 'word');
    if (typeof word !== 'string') continue;
    out.push({ word, slots: numbers(field(item, 'slots')) });
  }
  return out;
}

export const cannotUnsetProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as CannotUnsetStage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event) {
      switch (event.type) {
        case 'stand': {
          stage.setCaption?.(
            tr(
              'caption.stand',
              'Three values are already in the filter. Each one stands on three cells.',
            ),
          );
          await stage.stand?.(words(event.payload));
          return;
        }
        case 'verify': {
          stage.setCaption?.(tr('caption.verify', 'Ask each one, and all three answer yes.'));
          await stage.verify?.(strings(field(event.payload, 'words')));
          return;
        }
        case 'select': {
          const word = field(event.payload, 'word');
          const slots = numbers(field(event.payload, 'slots'));
          stage.setCaption?.(
            tr('caption.select', 'Erase one of them: {word}. Its cells are {slots}.', {
              word: typeof word === 'string' ? word : '',
              slots: slots.join(', '),
            }),
          );
          if (typeof word !== 'string') return;
          await stage.select?.(word, slots);
          return;
        }
        case 'clear': {
          const bits = field(event.payload, 'bits');
          stage.setCaption?.(
            tr('caption.clear', 'Turning those cells off leaves {bits}.', {
              bits: typeof bits === 'string' ? bits : '',
            }),
          );
          await stage.clear?.(numbers(field(event.payload, 'slots')));
          return;
        }
        case 'collapse': {
          const removed = field(event.payload, 'removed');
          const broken = strings(field(event.payload, 'broken'));
          stage.setCaption?.(
            tr(
              'caption.collapse',
              'But cells {shared} were shared. {broken} lose the ground under them.',
              {
                shared: numbers(field(event.payload, 'shared')).join(', '),
                broken: broken.join(', '),
              },
            ),
          );
          if (typeof removed !== 'string') return;
          await stage.collapse?.(removed, broken);
          return;
        }
        case 'verdict': {
          const absent = strings(field(event.payload, 'absent'));
          stage.setCaption?.(
            tr('caption.verdict', 'Ask again: {absent} answer no, though nobody erased them.', {
              absent: absent.join(', '),
            }),
          );
          await stage.verdict?.(absent);
          return;
        }
        case 'done': {
          stage.setCaption?.(
            tr(
              'caption.done',
              'A cell only says 1, never who set it. So erasing one value takes the others down with it.',
            ),
          );
          return;
        }
        case 'rewind': {
          stage.rewind?.();
          return;
        }
        default:
          // 이 조각의 algorithm 은 위 여덟만 발신한다. 그 밖은 조용히 흘린다 (C2).
          return;
      }
    },

    onReset() {
      stage.rewind?.();
    },
  };
};
