/**
 * unknownBecomesKnown 의 번역기 — 걸음 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 그대로 넘기지 않는다. `typeof` / `Array.isArray` 로 걸러 정형 객체를
 * 만든 뒤 stage 에 넘기고, 문안은 키로 조회해 붙인다 (C9 · C10).
 *
 * `initialData` 는 여기서 다시 좁히지 않는다 — 그 일은 stage 의 mount 가 이미
 * 했다 (S-piece).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';

type UnknownBecomesKnownStage = {
  layVocab?(): Promise<void> | void;
  probeWhole?(word: string): Promise<void> | void;
  splitWord?(word: string, pieces: string[]): Promise<void> | void;
  lockPieces?(word: string, pieces: string[]): Promise<void> | void;
  receiveWord?(word: string, pieces: string[]): Promise<void> | void;
  finish?(): Promise<void> | void;
  setCaption?(text: string): void;
  resetScene?(): void;
};

type WordStep = { word: string; pieces: string[]; seen: boolean };

function readCount(payload: unknown): number {
  const p = payload as { count?: unknown; received?: unknown } | undefined;
  if (typeof p?.count === 'number') return p.count;
  if (typeof p?.received === 'number') return p.received;
  return 0;
}

function readWordOnly(payload: unknown): string | null {
  const p = payload as { word?: unknown } | undefined;
  return typeof p?.word === 'string' ? p.word : null;
}

function readWordStep(payload: unknown): WordStep | null {
  const p = payload as { word?: unknown; pieces?: unknown; seen?: unknown } | undefined;
  if (typeof p?.word !== 'string') return null;
  if (!Array.isArray(p.pieces)) return null;
  const pieces = p.pieces.filter((piece): piece is string => typeof piece === 'string');
  if (pieces.length === 0) return null;
  return { word: p.word, pieces, seen: p.seen === true };
}

export const unknownBecomesKnownProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as UnknownBecomesKnownStage;
  const tr = runtime?.t ?? makeTranslator();

  /** 조각 글자는 데이터라 문안이 아니다. 이어 붙이는 모양만 여기서 정한다. */
  const spell = (pieces: string[]): string => pieces.join(' · ');

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'vocab-laid': {
          stage.setCaption?.(
            tr('caption.vocab', 'These pieces are all it knows. Pieces: {n}.', {
              n: readCount(event.payload),
            }),
          );
          await stage.layVocab?.();
          return;
        }

        case 'whole-missed': {
          const word = readWordOnly(event.payload);
          if (word === null) return;
          stage.setCaption?.(
            tr(
              'caption.missed',
              '"{word}" never appeared in the corpus. Swept whole across the vocabulary, it matches nothing.',
              { word },
            ),
          );
          await stage.probeWhole?.(word);
          return;
        }

        case 'word-splits': {
          const step = readWordStep(event.payload);
          if (step === null) return;
          stage.setCaption?.(
            step.seen
              ? tr(
                  'caption.seenSplit',
                  '"{word}" was in the corpus. Reading it just means cutting it into pieces: {pieces}.',
                  { word: step.word, pieces: spell(step.pieces) },
                )
              : tr('caption.split', 'So "{word}" is cut apart: {pieces}.', {
                  word: step.word,
                  pieces: spell(step.pieces),
                }),
          );
          await stage.splitWord?.(step.word, step.pieces);
          return;
        }

        case 'pieces-lock': {
          const step = readWordStep(event.payload);
          if (step === null) return;
          stage.setCaption?.(
            tr('caption.lock', 'Each half meets a piece that is already in the vocabulary: {pieces}.', {
              pieces: spell(step.pieces),
            }),
          );
          await stage.lockPieces?.(step.word, step.pieces);
          return;
        }

        case 'word-received': {
          const step = readWordStep(event.payload);
          if (step === null) return;
          stage.setCaption?.(
            step.seen
              ? tr(
                  'caption.seenTaken',
                  'Both pieces are in the vocabulary, so "{word}" comes back whole. Nothing unusual yet.',
                  { word: step.word },
                )
              : tr('caption.received', '"{word}" is taken in, spelled out of known pieces: {pieces}.', {
                  word: step.word,
                  pieces: spell(step.pieces),
                }),
          );
          await stage.receiveWord?.(step.word, step.pieces);
          return;
        }

        case 'rewind': {
          stage.resetScene?.();
          return;
        }

        case 'done': {
          stage.setCaption?.(
            tr('caption.done', 'An unknown word is never turned away. Words taken in: {n}.', {
              n: readCount(event.payload),
            }),
          );
          await stage.finish?.();
          return;
        }

        default:
          // 그 밖의 이벤트는 이 조각이 발신하지 않는다. 와도 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage.resetScene?.();
    },
  };
};
