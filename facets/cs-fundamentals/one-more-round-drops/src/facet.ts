/**
 * one-more-round-drops 의 선언.
 *
 * @piece 한 주장만 말하고 멈추는 조각이다 (S-piece) — "다 끝났어야 할 바퀴에서
 * 수가 또 줄면, 돌수록 짧아지는 고리가 있다는 뜻이다."
 *
 * 그래프는 정점 넷에 방향 간선 넷이다. A→B→C→A 가 고리이고 그 무게의 합이 음수라,
 * n−1 = 3 바퀴를 다 돌고도 값이 계속 내려간다. 몇 바퀴까지 보이고 멈출지는
 * `initialData.rounds` 에 둔 저작 결정이다 — 주장은 "멎지 않는다" 이지만 화면은
 * 멈춰야 한다.
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const oneMoreRoundDropsFacet: FacetJson = {
  id: 'facet:oneMoreRoundDrops',
  title: {
    en: 'One more round, and it drops again',
    ko: '한 바퀴 더 돌면 또 내려간다',
  },
  description: {
    en: 'If a distance still falls after round n−1, the graph has a negative cycle.',
    ko: 'n−1 바퀴를 다 돌고도 수가 내려가면 음수 고리가 있다는 뜻이다.',
  },
  algorithm: 'module:oneMoreRoundDrops',
  projector: 'module:oneMoreRoundDropsProjector',
  initialData: {
    type: 'one-more-round-drops',
    nodes: ['S', 'A', 'B', 'C'],
    edges: [
      { from: 'S', to: 'A', w: 1 },
      { from: 'A', to: 'B', w: 2 },
      { from: 'B', to: 'C', w: -5 },
      { from: 'C', to: 'A', w: 1 },
    ],
    source: 'S',
    // 멎어야 할 바퀴는 셋이다. 그 뒤로 셋을 더 보여 같은 폭으로 내려가는 것을
    // 보이고 멈춘다.
    rounds: 6,
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'one-more-round-drops-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'label.round': { en: 'Round {n}', ko: '{n}바퀴' },
    'caption.start': {
      en: 'Only the start is 0. The rest are still unknown.',
      ko: '출발점만 0, 나머지는 아직 모른다.',
    },
    'caption.round': {
      en: 'Round {n}: the numbers drop.',
      ko: '{n}바퀴 — 수가 내려간다.',
    },
    'caption.floor': {
      en: 'Round {n} is over. This is where they should stop.',
      ko: '{n}바퀴를 마쳤다. 여기가 바닥이어야 한다.',
    },
    'caption.beyond': {
      en: 'Round {n}: they fall through the floor.',
      ko: '{n}바퀴째 — 바닥을 뚫고 또 내려간다.',
    },
    'caption.never': {
      en: 'Every round, the same drop. It never stops.',
      ko: '바퀴마다 같은 폭. 멎지 않는다.',
    },
  },
};
