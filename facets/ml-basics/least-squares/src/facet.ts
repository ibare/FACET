/**
 * @piece 최소제곱 — 벗어남을 그냥 더하면 왜 안 되는가.
 *
 * 답하는 질문 하나: **부호가 있는 벗어남을 그냥 더하면 왜 안 되는가.**
 * 엉터리 직선과 좋은 직선이 똑같이 0 을 내는 것을 먼저 보이고, 제곱으로 바꾸면
 * 비로소 셋이 갈리는 것을 보인다. 걸음의 순서가 곧 논증이다.
 *
 * 견줄 직선 셋은 고정이다 — 이 조각은 직선을 학습하지 않는다. 계수는 선언이
 * 주고, 잔차와 합은 algorithm 이 점과 계수에서 셈한다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const leastSquaresFacet: FacetJson = {
  id: 'facet:leastSquares',
  title: { en: 'Least squares', ko: '최소제곱' },
  description: {
    en: 'Why signed misses cannot be summed, and what squaring fixes.',
    ko: '부호가 있는 벗어남을 그냥 더하면 왜 안 되는가.',
  },
  algorithm: 'module:leastSquares',
  projector: 'module:leastSquaresProjector',
  initialData: {
    type: 'least-squares',
    points: [
      { x: 1, y: 2 },
      { x: 2, y: 5 },
      { x: 3, y: 4 },
      { x: 4, y: 9 },
    ],
    // 견줄 직선 셋. 평평한 것 · 가파른 것 · 들어맞는 것.
    lines: [
      { slope: 0, intercept: 5 },
      { slope: 3, intercept: -2.5 },
      { slope: 2, intercept: 0 },
    ],
    stepMs: 900,
  },
  blocks: {
    stage: { type: 'least-squares-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.opening': {
      en: 'Four points. Three lines to be judged.',
      ko: '점 넷과, 견줄 직선 셋.',
    },
    'caption.miss': {
      en: 'Each point misses the line by this much.',
      ko: '이 직선에서 점들이 얼마나 벗어나는가.',
    },
    'caption.cancel': {
      en: 'Stacked with their signs, the misses undo one another.',
      ko: '부호를 지닌 채 쌓으면 서로를 지운다.',
    },
    'caption.allZero': {
      en: 'All three come back to zero. The signed sum cannot tell them apart.',
      ko: '셋 다 기준선으로 돌아온다. 부호 있는 합은 셋을 가르지 못한다.',
    },
    'caption.square': {
      en: 'So square each miss: a length becomes an area, and an area is never negative.',
      ko: '그래서 벗어남을 제곱한다. 길이가 넓이가 되고, 넓이에는 음수가 없다.',
    },
    'caption.pileUp': {
      en: 'The same misses, squared. Squares only pile up.',
      ko: '같은 벗어남을 제곱해서 쌓는다. 쌓이기만 하고 지워지지 않는다.',
    },
    'caption.split': {
      en: 'Now the three stand apart.',
      ko: '이제야 셋이 갈린다.',
    },
    'caption.verdict': {
      en: 'Least squares picks the line whose squares pile up the least.',
      ko: '제곱이 가장 적게 쌓인 직선. 최소제곱이 고르는 것이 그것이다.',
    },
  },
};
