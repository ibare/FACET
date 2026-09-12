/**
 * 이벤트를 stage 메서드로 옮긴다. 화면 문안은 여기서 키로 조회하고 (C10),
 * payload 는 좁힌 뒤에만 넘긴다 (C9).
 *
 * `onInit` 을 두지 않는다 — `initialData` 는 stage 의 mount 가 이미 받았다.
 * 여기서 다시 좁혀 밀어 넣으면 좁히는 규칙이 두 벌이 된다 (S-piece).
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

/** stage 가 내주는 계약. 없는 메서드를 부르지 않도록 전부 optional 로 받는다 (C9). */
type SpaceStage = {
  setCaption?: (text: string) => void;
  resetScene?: () => void;
  showSentence?: () => Promise<void>;
  markGaps?: () => Promise<void>;
  attach?: () => Promise<void>;
  cutPieces?: () => Promise<void>;
  showSecond?: () => Promise<void>;
  fillSpaced?: () => Promise<void>;
  fillBare?: () => Promise<void>;
  splitUnseen?: (token: string, parts: string[]) => Promise<void>;
  finish?: () => Promise<void>;
};

/** payload 에서 수 하나를 꺼낸다. 없거나 수가 아니면 0. */
function readCount(payload: unknown, key: string): number {
  if (typeof payload !== 'object' || payload === null) return 0;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** 쪼개지는 낱말과 그 조각. 어느 한쪽이라도 성하지 않으면 빈 것으로 본다. */
function readSplit(payload: unknown): { token: string; parts: string[] } {
  if (typeof payload !== 'object' || payload === null) return { token: '', parts: [] };
  const source = payload as Record<string, unknown>;
  const token = typeof source.token === 'string' ? source.token : '';
  const parts = Array.isArray(source.parts)
    ? source.parts.filter((part): part is string => typeof part === 'string')
    : [];
  return { token, parts };
}

export const spaceIsPartOfItProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as SpaceStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event) {
      switch (event.type) {
        case 'sentence':
          stage?.setCaption?.(tr('caption.gaps', 'A blank sits between the words.'));
          await stage?.showSentence?.();
          return;

        case 'mark-gaps':
          stage?.setCaption?.(tr('caption.mark', 'Write each blank as a character of its own.'));
          await stage?.markGaps?.();
          return;

        case 'attach':
          stage?.setCaption?.(tr('caption.attach', 'The blank slides onto the word that follows it.'));
          await stage?.attach?.();
          return;

        case 'cut':
          stage?.setCaption?.(
            tr('caption.cut', 'Pieces the sentence is cut into: {n}.', {
              n: readCount(event.payload, 'count'),
            }),
          );
          await stage?.cutPieces?.();
          return;

        case 'second-line':
          stage?.setCaption?.(tr('caption.second', 'Only the first word carries no blank.'));
          await stage?.showSecond?.();
          return;

        case 'shelf-spaced':
          stage?.setCaption?.(
            tr('caption.spaced', 'Each form with a blank takes one slot in the vocabulary.'),
          );
          await stage?.fillSpaced?.();
          return;

        case 'shelf-bare':
          stage?.setCaption?.(
            tr('caption.bare', 'The bare form takes a slot of its own. Pairs: {n}.', {
              n: readCount(event.payload, 'pairs'),
            }),
          );
          await stage?.fillBare?.();
          return;

        case 'split-unseen': {
          const { token, parts } = readSplit(event.payload);
          stage?.setCaption?.(
            tr('caption.split', 'A form never seen without its blank cannot stay whole.'),
          );
          await stage?.splitUnseen?.(token, parts);
          return;
        }

        case 'done':
          stage?.setCaption?.(
            tr('caption.done', 'Whether the blank is attached decides the piece. Vocabulary: {n}.', {
              n: readCount(event.payload, 'vocab'),
            }),
          );
          await stage?.finish?.();
          return;

        case 'rewind':
          stage?.resetScene?.();
          stage?.setCaption?.('');
          return;

        default:
          // 이 조각이 내보내는 이벤트는 위가 전부다. 그 밖의 것이 오면 화면에서
          // 할 일이 없으므로 조용히 흘린다 (C2).
          return;
      }
    },

    onReset() {
      stage?.resetScene?.();
      stage?.setCaption?.('');
    },
  };
};
