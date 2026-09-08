/**
 * union-by-rank 조각의 번역기 — algorithm.ts 가 발신하는 확장 이벤트를
 * union-by-rank-stage 의 메서드 호출로 옮긴다 (원칙 5).
 *
 * 문안은 여기서 `runtime.t` 로 해석해 완성된 문자열만 stage 에 건넨다 — stage 는
 * 번역을 모르고 주어진 문자열을 그대로 그린다 (C10).
 */

import { makeTranslator, type ProjectorFactory, type ViewInstance } from '@ffacet/core/runtime';

// stage 가 실제로 노출하는 메서드 중 이 projector 가 쓰는 것만 좁혀 선언한다 (C9).
type UnionByRankStage = ViewInstance & {
  init(n: number): void;
  compareRoots(rootA: number, rootB: number, rankA: number, rankB: number, caption: string): void;
  attach(loser: number, winner: number, tie: boolean, caption: string): Promise<void>;
  growRank(root: number, rank: number, caption: string): Promise<void>;
  rewind(caption: string): Promise<void>;
  markDone(caption: string): void;
};

type RankComparePayload = { rootA: number; rootB: number; rankA: number; rankB: number };
type AttachPayload = { loser: number; winner: number; loserRank: number; winnerRank: number; tie: boolean };
type RankGrowPayload = { root: number; rank: number };

function isRankComparePayload(p: unknown): p is RankComparePayload {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.rootA === 'number' &&
    typeof o.rootB === 'number' &&
    typeof o.rankA === 'number' &&
    typeof o.rankB === 'number'
  );
}

function isAttachPayload(p: unknown): p is AttachPayload {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.loser === 'number' &&
    typeof o.winner === 'number' &&
    typeof o.loserRank === 'number' &&
    typeof o.winnerRank === 'number' &&
    typeof o.tie === 'boolean'
  );
}

function isRankGrowPayload(p: unknown): p is RankGrowPayload {
  if (typeof p !== 'object' || p === null) return false;
  const o = p as Record<string, unknown>;
  return typeof o.root === 'number' && typeof o.rank === 'number';
}

function isUnionByRankInitialData(d: unknown): d is { n: number } {
  if (typeof d !== 'object' || d === null) return false;
  const o = d as Record<string, unknown>;
  return typeof o.n === 'number';
}

export const unionByRankProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as UnionByRankStage;
  const t = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData) {
      if (!isUnionByRankInitialData(initialData)) return;
      stage.init(initialData.n);
    },

    onEvent(event) {
      switch (event.type) {
        case 'rank-compare': {
          if (!isRankComparePayload(event.payload)) return;
          const { rootA, rootB, rankA, rankB } = event.payload;
          const caption = t(
            'caption.compare',
            'Compare rank: node {a} (rank {rankA}) vs node {b} (rank {rankB})',
            { a: rootA, rankA, b: rootB, rankB },
          );
          stage.compareRoots(rootA, rootB, rankA, rankB, caption);
          return;
        }
        case 'attach': {
          if (!isAttachPayload(event.payload)) return;
          const { loser, winner, loserRank, winnerRank, tie } = event.payload;
          const caption = tie
            ? t(
                'caption.attachTie',
                'Ranks tie — node {loser} goes under node {winner}. Height must grow by one.',
                { loser, winner },
              )
            : t(
                'caption.attachDiffer',
                'Ranks differ — node {loser} (rank {loserRank}) goes under node {winner} (rank {winnerRank}). Height stays the same.',
                { loser, loserRank, winner, winnerRank },
              );
          return stage.attach(loser, winner, tie, caption);
        }
        case 'rank-grow': {
          if (!isRankGrowPayload(event.payload)) return;
          const { root, rank } = event.payload;
          const caption = t('caption.grow', "Node {root}'s height grows to {rank}.", { root, rank });
          return stage.growRank(root, rank, caption);
        }
        case 'rewind': {
          const caption = t('caption.rewind', 'Replaying from the start.');
          return stage.rewind(caption);
        }
        case 'done': {
          const caption = t('caption.done', 'All unions done.');
          stage.markDone(caption);
          return;
        }
        default:
          // 알려지지 않은 이벤트는 조용히 무시한다 (C2).
          return;
      }
    },
  };
};
