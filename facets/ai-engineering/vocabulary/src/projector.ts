/**
 * 어휘 사전 facet 의 Projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 화면 문안은 전부 여기서 `tr` 로 조회한다. stage 는 데이터(낱말 · 조각 글자 ·
 * 수)만 그리고 문장은 그리지 않으므로, 문안 출처가 한 자리로 모인다 (C10).
 */

import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

/** stage 가 내주는 계약. 없는 메서드에도 견디게 optional 로 두고 `?.()` 로 부른다 (C9). */
type Stage = {
  setCorpus?(name: string): void;
  cutWord?(word: string, parts: string[]): Promise<void> | void;
  setCaption?(line: string): void;
  reset?(): void;
};

type ChosenPayload = { corpus: string };
type CutPayload = { word: string; parts: string[]; pieces: number };
type SettledPayload = { corpus: string; total: number; size: number; tieWith: string | null };

function readChosen(payload: unknown): ChosenPayload | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.corpus !== 'string') return null;
  return { corpus: p.corpus };
}

function readCut(payload: unknown): CutPayload | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.word !== 'string' || !Array.isArray(p.parts)) return null;
  if (typeof p.pieces !== 'number') return null;
  const parts = p.parts.filter((x): x is string => typeof x === 'string');
  if (parts.length !== p.parts.length) return null;
  return { word: p.word, parts, pieces: p.pieces };
}

function readSettled(payload: unknown): SettledPayload | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.corpus !== 'string') return null;
  if (typeof p.total !== 'number' || typeof p.size !== 'number') return null;
  return {
    corpus: p.corpus,
    total: p.total,
    size: p.size,
    tieWith: typeof p.tieWith === 'string' ? p.tieWith : null,
  };
}

export const vocabularyProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = (views.stage ?? {}) as unknown as Stage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(): void {
      stage.setCaption?.(
        tr('caption.start', 'No vocabulary yet — every letter stands on its own.'),
      );
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'corpus-chosen': {
          const p = readChosen(event.payload);
          if (!p) return;
          stage.setCorpus?.(p.corpus);
          stage.setCaption?.(
            tr(
              'caption.corpus',
              'Vocabulary learned from this corpus: {corpus}. Cutting the same six words again.',
              { corpus: p.corpus },
            ),
          );
          return;
        }
        case 'word-cut': {
          const p = readCut(event.payload);
          if (!p) return;
          stage.setCaption?.(
            tr('caption.cut', 'Word just cut: {word}. Pieces: {n}.', {
              word: p.word,
              n: p.pieces,
            }),
          );
          await stage.cutWord?.(p.word, p.parts);
          return;
        }
        case 'corpus-settled': {
          const p = readSettled(event.payload);
          if (!p) return;
          stage.setCaption?.(
            p.tieWith === null
              ? tr(
                  'caption.settled',
                  'Vocabulary {corpus} — six words in {total} pieces, vocabulary size {size}.',
                  { corpus: p.corpus, total: p.total, size: p.size },
                )
              : tr(
                  'caption.tie',
                  'Same piece total as this vocabulary: {other} — {total}. Yet the words each one cuts well are opposite.',
                  { other: p.tieWith, total: p.total },
                ),
          );
          return;
        }
        default:
          // 이 facet 의 algorithm 은 위 셋만 발신한다. 그 밖의 어휘가 오면
          // 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage.reset?.();
    },
  };
};
