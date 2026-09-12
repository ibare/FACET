/**
 * BPE 학습 Projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 문안은 여기서 짓지 않고 `FacetJson.messages` 에서 꺼낸다. 알고리즘은 수와 조각만
 * 보내고, 무엇이라 말할지는 이 층이 정한다 (C10).
 *
 * 애니메이션 길이는 재생 속도에 비례해 줄인다 — `runtime.getSpeed()` 가 60 이면
 * 한 걸음이 눈 깜짝할 사이에 지나가야 한다.
 */

import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';
import {
  rankKey,
  showToken,
  type StageRankRow,
  type StageRule,
  type StageWord,
} from './bpe-training-stage.js';

/** stage 가 내주는 계약. 없는 메서드는 부르지 않는다 (C9). */
type Stage = {
  setWords?(words: StageWord[], duration?: number): Promise<void> | void;
  setRanking?(rows: StageRankRow[], winner: string | null, duration?: number): Promise<void> | void;
  addRule?(index: number, rule: StageRule, duration?: number): Promise<void> | void;
  clearRules?(): void;
  setCaption?(line: string): void;
  reset?(): void;
};

/** 걸음마다 오는 payload 는 projector 가 좁혀 넘긴다 (C9). */
function readWords(value: unknown): StageWord[] {
  if (!Array.isArray(value)) return [];
  const out: StageWord[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.word !== 'string' || typeof row.freq !== 'number') continue;
    if (!Array.isArray(row.tokens)) continue;
    const tokens = row.tokens.filter((tk): tk is string => typeof tk === 'string');
    out.push({ word: row.word, freq: row.freq, tokens });
  }
  return out;
}

function readRows(value: unknown): StageRankRow[] {
  if (!Array.isArray(value)) return [];
  const out: StageRankRow[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.left !== 'string' || typeof row.right !== 'string') continue;
    if (typeof row.count !== 'number') continue;
    out.push({ left: row.left, right: row.right, count: row.count, whole: row.whole === true });
  }
  return out;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export const bpeTrainingProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /**
   * 캡션에 조각 이름을 넣으려면 낱말 끝 표식이 무엇인지 알아야 한다. `onInit` 에서
   * 이 둘만 기억한다 — 초기 그림을 stage 로 밀어 넣지는 않는다. 그것은 stage 의
   * `mount` 가 이미 했다.
   */
  let endMark = '</w>';
  let handleWord = '';

  const show = (token: string): string => showToken(token, endMark);

  /** 재생 속도에 견준 애니메이션 길이. */
  function dur(base: number): number {
    const speed = Math.max(0.25, runtime?.getSpeed() ?? 1);
    return Math.max(30, Math.round(base / speed));
  }

  return {
    onInit(initialData: unknown): void {
      if (typeof initialData !== 'object' || initialData === null) return;
      const d = initialData as Record<string, unknown>;
      if (typeof d.endMark === 'string') endMark = d.endMark;
      if (typeof d.handleWord === 'string') handleWord = d.handleWord;
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const payload = (event.payload ?? {}) as Record<string, unknown>;

      switch (event.type) {
        case 'run-begin': {
          stage?.clearRules?.();
          const freq = num(payload.freq);
          await stage?.setWords?.(readWords(payload.words), dur(300));
          stage?.setCaption?.(
            tr(
              'caption.start',
              'The word "{word}" appears {freq} times. Every neighbouring pair in the corpus is counted.',
              { word: handleWord, freq },
            ),
          );
          return;
        }

        case 'pairs-ranked': {
          const rows = readRows(payload.rows);
          const top = rows.length > 0 ? rows[0] : null;
          const winner = top === null ? null : rankKey(top.left, top.right);
          await stage?.setRanking?.(rows, winner, dur(320));
          if (top === null) return;
          const pair = `${show(top.left)}+${show(top.right)}`;
          if (payload.tied === true) {
            stage?.setCaption?.(
              tr(
                'caption.tie',
                'Several pairs share the top count. The one that comes first alphabetically wins — "{pair}".',
                { pair },
              ),
            );
          } else {
            stage?.setCaption?.(
              tr('caption.ranked', 'Step {step} — the pair "{pair}" leads with {count}.', {
                step: num(payload.step),
                pair,
                count: top.count,
              }),
            );
          }
          return;
        }

        case 'merge-chosen': {
          const step = num(payload.step, 1);
          const token = str(payload.token);
          await stage?.addRule?.(
            Math.max(0, step - 1),
            { token, count: num(payload.count), whole: payload.whole === true },
            dur(260),
          );
          stage?.setCaption?.(
            tr(
              'caption.merged',
              'Merged into "{token}". Everywhere those two sat side by side is now a single piece.',
              { token: show(token) },
            ),
          );
          return;
        }

        case 'tokens-merged': {
          await stage?.setWords?.(readWords(payload.words), dur(300));
          return;
        }

        case 'run-settled': {
          const freq = num(payload.freq);
          const wholeStep = num(payload.wholeStep);
          if (wholeStep > 0) {
            stage?.setCaption?.(
              tr(
                'caption.settledWhole',
                '"{word}" appears {freq} times, so it won a merge and became a single piece at step {step}.',
                { word: handleWord, freq, step: wholeStep },
              ),
            );
            return;
          }
          const words = readWords(payload.words);
          const handle = words.find((w) => w.word === handleWord);
          const pieces = (handle?.tokens ?? []).map(show).join(' ');
          stage?.setCaption?.(
            tr(
              'caption.settledSplit',
              '"{word}" appears only {freq} times, so it never won a merge in six steps — it stays split as {pieces}.',
              { word: handleWord, freq, pieces },
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
      stage?.reset?.();
    },
  };
};
