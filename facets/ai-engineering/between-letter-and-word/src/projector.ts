/**
 * between-letter-and-word — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 넘긴다 (C9). 화면 문안은 선언에 있고 여기에는 키와
 * en 원본만 남는다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, ProjectorFactory, ProjectorInstance } from '@ffacet/core/runtime';

type RowKey = 'word' | 'piece' | 'letter';

/** stage 가 내주는 표면. 없는 메서드를 부르지 않도록 전부 optional 로 받는다 (C9). */
type Stage = {
  setCaption?(text: string): void;
  cutRow?(row: string, segments: string[]): Promise<void> | void;
  markSeams?(seams: number[]): Promise<void> | void;
  rewind?(): void;
};

type Cut = { row: RowKey; segments: string[] };

function isRowKey(value: unknown): value is RowKey {
  return value === 'word' || value === 'piece' || value === 'letter';
}

function readCut(payload: unknown): Cut | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (!isRowKey(p.row)) return null;
  if (!Array.isArray(p.segments)) return null;
  const segments = p.segments.filter((s): s is string => typeof s === 'string');
  if (segments.length === 0) return null;
  return { row: p.row, segments };
}

type Between = { counts: Record<string, number>; seams: number[] };

function readBetween(payload: unknown): Between | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const { word, piece, letter } = p;
  if (typeof word !== 'number' || typeof piece !== 'number' || typeof letter !== 'number') return null;
  const seams = Array.isArray(p.seams)
    ? p.seams.filter((n): n is number => typeof n === 'number')
    : [];
  return { counts: { word, piece, letter }, seams };
}

export const betweenLetterAndWordProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  function captionFor(row: RowKey, n: number): string {
    if (row === 'word') return tr('caption.word', 'Cut at the spaces — words {n}.', { n });
    if (row === 'piece') return tr('caption.piece', 'Same sentence, cut into pieces — pieces {n}.', { n });
    return tr('caption.letter', 'Cut at every letter — letters {n}.', { n });
  }

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'cut': {
          const cut = readCut(event.payload);
          if (!cut) return;
          stage?.setCaption?.(captionFor(cut.row, cut.segments.length));
          await stage?.cutRow?.(cut.row, cut.segments);
          return;
        }
        case 'between': {
          const between = readBetween(event.payload);
          if (!between) return;
          stage?.setCaption?.(
            tr(
              'caption.between',
              'Pieces land in between — words {word}, pieces {piece}, letters {letter}.',
              between.counts,
            ),
          );
          await stage?.markSeams?.(between.seams);
          return;
        }
        case 'rewind': {
          stage?.rewind?.();
          return;
        }
        default:
          // 그 밖의 이벤트는 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind?.();
    },
  };
};
