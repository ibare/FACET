/**
 * 서브워드 분할 projector — 알고리즘의 세 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 문안은 한 줄도 여기 없다. 키와 en 원본만 두고 `runtime.t` 로 조회한다 (C10).
 * 애니메이션 길이는 `runtime.getSpeed()` 에 반비례시킨다 — 빠르게 보려는 사람에게
 * 고정 길이 애니메이션은 그대로 기다림이 된다.
 */

import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';
import { readSubwordScene, type SubwordMergeFrame } from './subword-segmentation-stage.js';

/** stage 가 내주는 메서드 — 없는 것을 부르지 않도록 전부 optional 로 받는다 (C9). */
type Stage = {
  setPieces?(pieces: string[]): void;
  mergeTo?(frame: SubwordMergeFrame, durationMs: number): Promise<void> | void;
  setCaption?(line: string): void;
  setRule?(text: string): void;
  reset?(): void;
};

/** 타일이 서로에게 미끄러지는 데 드는 시간 (재생 속도 1 일 때). */
const MERGE_MS = 300;
const MERGE_MS_MIN = 40;

const readString = (v: unknown, fallback: string): string =>
  typeof v === 'string' ? v : fallback;
const readNumber = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const readStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const readNumbers = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];

export const subwordSegmentationProjector: ProjectorFactory = (views, runtime) => {
  const stage = (views.stage ?? {}) as unknown as Stage;
  const tr = runtime?.t ?? makeTranslator();
  /** 끝 표식. 화면에서는 `_` 로 보이므로 캡션도 그렇게 적는다. */
  let endMark = '</w>';

  const glyphs = (piece: string): string =>
    endMark === '' ? piece : piece.split(endMark).join('_');

  const duration = (): number =>
    Math.max(MERGE_MS_MIN, Math.round(MERGE_MS / Math.max(0.25, runtime?.getSpeed() ?? 1)));

  return {
    onInit(initialData: unknown): void {
      // stage 가 내준 좁히개를 그대로 쓴다 — 좁히는 규칙이 두 벌이 되지 않게.
      // 여기서 받는 것은 캡션에 쓸 끝 표식 하나뿐이고, stage 로 다시 밀어 넣지 않는다.
      endMark = readSubwordScene(initialData).endMark;
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = event.payload as Record<string, unknown> | undefined;

      switch (event.type) {
        case 'run-begin': {
          const merges = readNumber(p?.merges, 0);
          const pieces = readStrings(p?.pieces);
          stage.setRule?.('');
          stage.setPieces?.(pieces);
          stage.setCaption?.(
            tr(
              'caption.begin',
              'Learning {merges} merges, then cutting. The sentence starts as single letters: {n}.',
              { merges, n: pieces.length },
            ),
          );
          return;
        }

        case 'pair-merged': {
          const pieces = readStrings(p?.pieces);
          const mergedAt = readNumbers(p?.mergedAt);
          const left = readString(p?.left, '');
          const right = readString(p?.right, '');
          const joined = readString(p?.joined, '');
          stage.setRule?.(`${glyphs(left)} + ${glyphs(right)} → ${glyphs(joined)}`);
          stage.setCaption?.(
            tr(
              'caption.merge',
              'Rule {rule} of {total}: "{left}" + "{right}" becomes "{joined}". Pieces left: {n}.',
              {
                rule: readNumber(p?.ruleIndex, 0) + 1,
                total: readNumber(p?.ruleCount, 0),
                left: glyphs(left),
                right: glyphs(right),
                joined: glyphs(joined),
                n: pieces.length,
              },
            ),
          );
          await stage.mergeTo?.({ pieces, mergedAt }, duration());
          return;
        }

        case 'run-settled': {
          const merges = readNumber(p?.merges, 0);
          const pieces = readStrings(p?.pieces);
          const vocab = readNumber(p?.vocabSize, 0);
          stage.setPieces?.(pieces);
          stage.setCaption?.(
            merges === 0
              ? tr('caption.settledNone', 'With no merges every letter stands alone. Pieces: {n}.', {
                  n: pieces.length,
                })
              : tr(
                  'caption.settled',
                  'With {merges} merges the vocabulary holds {vocab} symbols, and the sentence needs {n} pieces.',
                  { merges, vocab, n: pieces.length },
                ),
          );
          return;
        }

        default:
          // 그 밖의 type 은 이 facet 이 발신하지 않는다. 와도 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage.reset?.();
    },
  };
};
