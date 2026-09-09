/**
 * 앙상블 투표 projector — algorithm 이 발신한 것을 좁혀서 stage 로 넘긴다.
 *
 * payload 는 `unknown` 이므로 여기서 한 번에 좁히고, 좁힌 값만 stage 로 간다 (C9).
 * 화면 문안은 키로만 다루고 실제 문장은 `facet.ts` 의 messages 에 있다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import { readVoteModel } from './many-trees-vote-stage.js';
import type { ManyTreesVoteStage, VoteModel } from './many-trees-vote-stage.js';

type BoardReady = { trees: number; questions: number; total: number };
type Split = { question: number; counts: number[] };
type Gathered = {
  question: number;
  majority: string;
  truth: string;
  correct: boolean;
  winners: number[];
  losers: number[];
};
type Done = {
  treeScores: number[];
  best: number;
  perfect: number;
  majorityScore: number;
  total: number;
};

function isNumberArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number');
}

function readBoardReady(payload: unknown): BoardReady | null {
  const p = payload as { trees?: unknown; questions?: unknown; total?: unknown } | undefined;
  if (p === undefined) return null;
  if (typeof p.trees !== 'number') return null;
  if (typeof p.questions !== 'number' || typeof p.total !== 'number') return null;
  return { trees: p.trees, questions: p.questions, total: p.total };
}

function readSplit(payload: unknown): Split | null {
  const p = payload as { question?: unknown; counts?: unknown } | undefined;
  if (p === undefined) return null;
  if (typeof p.question !== 'number' || !isNumberArray(p.counts)) return null;
  return { question: p.question, counts: p.counts };
}

function readGathered(payload: unknown): Gathered | null {
  const p = payload as
    | {
        question?: unknown;
        majority?: unknown;
        truth?: unknown;
        correct?: unknown;
        winners?: unknown;
        losers?: unknown;
      }
    | undefined;
  if (p === undefined) return null;
  if (typeof p.question !== 'number') return null;
  if (typeof p.majority !== 'string' || typeof p.truth !== 'string') return null;
  if (typeof p.correct !== 'boolean') return null;
  if (!isNumberArray(p.winners) || !isNumberArray(p.losers)) return null;
  return {
    question: p.question,
    majority: p.majority,
    truth: p.truth,
    correct: p.correct,
    winners: p.winners,
    losers: p.losers,
  };
}

function readDone(payload: unknown): Done | null {
  const p = payload as
    | {
        treeScores?: unknown;
        best?: unknown;
        perfect?: unknown;
        majorityScore?: unknown;
        total?: unknown;
      }
    | undefined;
  if (p === undefined) return null;
  if (!isNumberArray(p.treeScores)) return null;
  if (typeof p.best !== 'number' || typeof p.perfect !== 'number') return null;
  if (typeof p.majorityScore !== 'number' || typeof p.total !== 'number') return null;
  return {
    treeScores: p.treeScores,
    best: p.best,
    perfect: p.perfect,
    majorityScore: p.majorityScore,
    total: p.total,
  };
}

export const manyTreesVoteProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ManyTreesVoteStage;
  const tr = runtime?.t ?? makeTranslator();

  /**
   * 판. 되감기(rewind) 는 러너의 reset 을 거치지 않으므로 여기 쥔 것으로 다시 그린다.
   * 좁히는 규칙은 stage 가 내주는 `readVoteModel` 한 벌뿐이다 (C9 / S-piece).
   */
  let model: VoteModel | null = null;

  return {
    onInit(initialData: unknown): void {
      const next = readVoteModel(initialData);
      if (next === null) return;
      model = next;
      stage.setModel(next);
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'board-ready': {
          const p = readBoardReady(event.payload);
          if (p === null) return;
          stage.setCaption(
            tr('caption.intro', '{trees} trees, {questions} questions, {total} answers.', {
              trees: p.trees,
              questions: p.questions,
              total: p.total,
            }),
          );
          return;
        }

        case 'votes-split': {
          const p = readSplit(event.payload);
          if (p === null) return;
          stage.setCaption(
            tr(
              'caption.split',
              '{q}: the answers split — {countA} chose {optionA}, {countB} chose {optionB}.',
              {
                q: model?.questions[p.question] ?? '',
                optionA: model?.options[0] ?? '',
                optionB: model?.options[1] ?? '',
                countA: p.counts[0] ?? 0,
                countB: p.counts[1] ?? 0,
              },
            ),
          );
          await stage.splitVotes(p.question);
          return;
        }

        case 'votes-gathered': {
          const p = readGathered(event.payload);
          if (p === null) return;
          stage.setCaption(
            p.correct
              ? tr(
                  'caption.gatherRight',
                  'The larger side gathers into one answer: {majority}. The truth is {truth}.',
                  { majority: p.majority, truth: p.truth },
                )
              : tr(
                  'caption.gatherWrong',
                  'The larger side gathers into one answer: {majority}. But the truth is {truth}.',
                  { majority: p.majority, truth: p.truth },
                ),
          );
          await stage.gatherVotes(p.question, p.majority, p.truth, p.winners, p.losers);
          return;
        }

        case 'done': {
          const p = readDone(event.payload);
          if (p === null) return;
          stage.showScores(p.treeScores, p.majorityScore, p.total);
          stage.setCaption(
            p.perfect === 0
              ? tr(
                  'caption.doneNone',
                  'No tree got all {total}. Best tree: {best}/{total}. The vote: {majorityScore}/{total}.',
                  { total: p.total, best: p.best, majorityScore: p.majorityScore },
                )
              : tr(
                  'caption.donePerfect',
                  'Trees with all {total}: {perfect}. Best tree: {best}/{total}. The vote: {majorityScore}/{total}.',
                  {
                    total: p.total,
                    perfect: p.perfect,
                    best: p.best,
                    majorityScore: p.majorityScore,
                  },
                ),
          );
          return;
        }

        case 'rewind': {
          stage.setCaption('');
          if (model !== null) stage.setModel(model);
          return;
        }

        // 위 다섯이 이 algorithm 이 내는 전부다. 그 밖의 것은 조용히 흘린다.
        default:
          return;
      }
    },

    onReset(): void {
      stage.setCaption('');
    },
  };
};
