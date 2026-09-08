/**
 * @piece 간격 축소.
 *
 * 답하는 질문 하나 — "마지막에 어차피 옆칸끼리 다 견줄 거면, 멀리 견주는 앞
 * 라운드는 낭비 아닌가?"
 *
 * 화면은 보폭이 세 칸에서 한 칸으로 좁아지는 것을 보이고, 그렇게 줄여 온 쪽의
 * 이동 횟수와 처음부터 옆칸만 견준 쪽의 이동 횟수를 나란히 들고 있는다.
 */

import { CONTROL } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const gapShrinkFacet: FacetJson = {
  id: 'facet:gapShrink',
  title: { en: 'Gap shrinking', ko: '간격 축소' },
  description: {
    en: 'Clearing far-apart disorder first leaves the final neighbour pass less to do.',
    ko: '멀리 있는 어긋남을 먼저 걷어 내면 마지막 옆칸 라운드가 할 일이 줄어든다.',
  },
  algorithm: 'module:gapShrink',
  projector: 'module:gapShrinkProjector',
  initialData: {
    type: 'gap-shrink',
    values: [8, 1, 7, 2, 6, 3],
    gaps: [3, 1],
    // 걸음 간격. 재생 총 길이는 stage 애니메이션이 그 위에 더해진다 (S-piece).
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'gap-shrink-stage' },
    controls: { type: 'control-bar', controls: [CONTROL.replay, CONTROL.advance] },
  },
  messages: {
    'caption.roundFar': {
      en: 'Round {round} — compare pairs {gap} cells apart',
      ko: '라운드 {round} — {gap}칸 건너 짝을 견준다',
    },
    'caption.roundNear': {
      en: 'Round {round} — compare neighbours',
      ko: '라운드 {round} — 옆칸끼리 견준다',
    },
    'caption.baseline': {
      en: 'The same input, neighbours only from the start:',
      ko: '같은 입력을 처음부터 옆칸만으로 하면',
    },
    'caption.result': {
      en: 'Shrinking the stride: {moves} moves. Neighbours only: {baseMoves}.',
      ko: '보폭을 줄여 오면 이동 {moves}회, 옆칸만으로는 {baseMoves}회.',
    },
    'label.stride': { en: 'stride {gap}', ko: '보폭 {gap}칸' },
    'label.compares': { en: 'compares', ko: '견줌' },
    'label.moves': { en: 'moves', ko: '이동' },
    'label.shrinkRun': { en: 'stride shrinking', ko: '보폭 줄이기' },
    'label.nearOnly': { en: 'neighbours only', ko: '옆칸만' },
  },
};
