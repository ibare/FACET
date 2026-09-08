/**
 * @piece
 *
 * union-by-rank — 랭크 기반 합집합의 "고르기" 질문 하나에 답한다: 두 무리를
 * 합칠 때 어느 쪽 뿌리를 아래로 넣을지 고르면 나무가 길어지지 않는다는 것.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const unionByRankFacet: FacetJson = {
  id: 'facet:unionByRank',
  title: { en: 'Union by Rank', ko: '랭크 기반 합집합' },
  algorithm: 'module:unionByRank',
  projector: 'module:unionByRankProjector',
  initialData: {
    type: 'unionByRank',
    n: 5,
    unions: [
      [0, 1],
      [2, 3],
      [0, 2],
      [4, 0],
    ],
    stepMs: 720,
  },
  blocks: {
    stage: { type: 'union-by-rank-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
  messages: {
    'caption.compare': {
      en: 'Compare rank: node {a} (rank {rankA}) vs node {b} (rank {rankB})',
      ko: '랭크를 견준다: {a}번(랭크 {rankA}) 대 {b}번(랭크 {rankB})',
    },
    'caption.attachDiffer': {
      en: 'Ranks differ — node {loser} (rank {loserRank}) goes under node {winner} (rank {winnerRank}). Height stays the same.',
      ko: '랭크가 다르다 — {loser}번(랭크 {loserRank})을 {winner}번(랭크 {winnerRank}) 밑에 넣는다. 키는 그대로다.',
    },
    'caption.attachTie': {
      en: 'Ranks tie — node {loser} goes under node {winner}. Height must grow by one.',
      ko: '랭크가 같다 — {loser}번을 {winner}번 밑에 넣는다. 키가 하나 는다.',
    },
    'caption.grow': {
      en: "Node {root}'s height grows to {rank}.",
      ko: '{root}번의 키가 {rank}로 는다.',
    },
    'caption.rewind': {
      en: 'Replaying from the start.',
      ko: '처음부터 다시 본다.',
    },
    'caption.done': {
      en: 'All unions done.',
      ko: '합치기를 모두 마쳤다.',
    },
  },
};
