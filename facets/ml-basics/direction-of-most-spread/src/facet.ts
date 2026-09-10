/**
 * @piece 가장 넓게 퍼진 방향.
 *
 * 답하는 질문 — **점 무리를 한 방향에서만 본다면 어느 쪽에서 봐야 가장 많이
 * 보이는가.** 가운데를 지나는 축 하나가 돌고, 점을 그 축에 내려 찍은 자국의
 * 퍼짐이 오르내리다가, 가장 넓어지는 자리에서 멈춘다.
 *
 * 화면에 뜨는 수는 하나도 여기 적혀 있지 않다. 가운데도 퍼짐도 합도 몫도
 * algorithm 이 아래 좌표에서 직접 셈해 걸음마다 보낸다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const directionOfMostSpreadFacet: FacetJson = {
  id: 'facet:directionOfMostSpread',
  title: { en: 'The direction of most spread', ko: '가장 넓게 퍼진 방향' },
  description: {
    en: 'Turn one axis through the cloud and stop where the projections spread widest.',
    ko: '점 무리를 지나는 축 하나를 돌려, 내려 찍은 자국이 가장 넓게 퍼지는 자리에서 멈춘다.',
  },
  algorithm: 'module:directionOfMostSpread',
  projector: 'module:directionOfMostSpreadProjector',
  initialData: {
    type: 'direction-of-most-spread',
    points: [
      [1.0, 1.8],
      [1.8, 1.4],
      [2.6, 2.8],
      [3.3, 2.2],
      [4.1, 3.7],
      [4.8, 3.0],
      [5.6, 4.5],
      [6.3, 3.9],
      [2.2, 0.8],
      [5.2, 4.8],
      [3.0, 1.6],
      [4.4, 4.1],
    ],
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'direction-of-most-spread-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.center': {
      en: 'The axis will pivot through the center of the cloud.',
      ko: '축은 점 무리의 가운데를 지난다.',
    },
    'caption.turn': {
      en: 'Turning the axis, measuring how far the marks spread.',
      ko: '축을 돌리며 자국이 얼마나 벌어지는지 잰다.',
    },
    'caption.stop': {
      en: 'It comes back and stops where the spread is widest.',
      ko: '되돌아가, 퍼짐이 가장 넓어지는 자리에서 멈춘다.',
    },
    'caption.done': {
      en: 'The widest direction holds this much of the total: {share}%.',
      ko: '가장 넓은 방향이 합에서 가진 몫: {share}%.',
    },
    'label.spread': { en: 'spread', ko: '퍼짐' },
    'label.spreadValue': { en: 'spread = {v}', ko: '퍼짐 = {v}' },
    'label.acrossValue': { en: 'across = {v}', ko: '직각 = {v}' },
    'label.sumValue': { en: 'sum = {v}', ko: '합 = {v}' },
  },
};
