/**
 * 잔차 조각 — @piece
 *
 * 질문: 직선이 한 점에서 얼마나 틀렸는지는 무엇으로 재는가.
 *
 * 직선은 고정이다 (학습하지 않는다). 선언에는 구조만 둔다 — 계수와 점, 그리고
 * 읽을 시간을 정하는 `stepMs`. 좌표와 색은 stage 가 셈한다 (S-piece).
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const residualDistanceFacet: FacetJson = {
  id: 'facet:residualDistance',
  title: { en: 'Residual', ko: '잔차' },
  description: {
    en: 'How far a point sits from the line, measured straight along y.',
    ko: '점이 직선에서 세로로 얼마나 벗어나 있는가.',
  },
  algorithm: 'module:residualDistance',
  projector: 'module:residualDistanceProjector',
  initialData: {
    type: 'residual-distance',
    slope: 1.5,
    intercept: 1,
    points: [
      { x: 1, y: 4 },
      { x: 2, y: 3.2 },
      { x: 3, y: 6.7 },
      { x: 4, y: 6.4 },
      { x: 5, y: 9.6 },
    ],
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'residual-distance-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.scene': {
      en: 'A fixed line and the observed points.',
      ko: '고정된 직선과 관측점.',
    },
    'caption.pick': {
      en: 'One point. How far off is the line here?',
      ko: '점 하나. 여기서 직선은 얼마나 틀렸는가.',
    },
    'caption.perpendicular': {
      en: 'The closest reach reads a right angle to the line.',
      ko: '가장 가깝게 닿는 길은 직선과 직각을 이룬다.',
    },
    'caption.turn': {
      en: 'But y is what we predict, so measure straight along y.',
      ko: '그러나 맞히려는 것은 y. 그래서 y 방향으로 잰다.',
    },
    'caption.above': {
      en: 'Above the line: the observation has more than predicted.',
      ko: '선 위 — 예측보다 남는다.',
    },
    'caption.below': {
      en: 'Below the line: the observation falls short of the prediction.',
      ko: '선 아래 — 예측보다 모자란다.',
    },
    'caption.done': {
      en: 'Length is how much, sign is which way.',
      ko: '길이는 얼마나, 부호는 어느 쪽.',
    },
  },
};
