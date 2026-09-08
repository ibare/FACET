/**
 * take-best-now — FacetJson 선언.
 *
 * @piece 조각. 한 질문에만 답한다 —
 *        "그리디는 매 순간 무엇을 보고 무엇을 하는가."
 *        답: 지금 남은 몫 하나만 보고 거기 들어가는 가장 큰 것을 집는다.
 *        재는 걸음도 무르는 걸음도 없어서 절차가 짧다.
 *
 * 동전 25 · 10 · 5 · 1 로 41 을 만든다. 집는 차례와 남은 몫은 알고리즘이 셈한다 —
 * 여기에는 재료(동전과 금액)만 있고 답은 없다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const takeBestNowFacet: FacetJson = {
  id: 'facet:takeBestNow',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: { en: 'Greedy Choice', ko: '그리디 선택' },
  description: {
    en: 'One rule, one pick, no second look — the largest coin that still fits comes down, and what is left shrinks',
    ko: '기준 하나로 하나를 집고 돌아보지 않는다 — 남은 몫에 들어가는 가장 큰 동전이 내려오고 몫이 줄어든다',
  },
  algorithm: 'module:takeBestNow',
  projector: 'module:takeBestNowProjector',
  initialData: {
    type: 'take-best-now',
    coins: [25, 10, 5, 1],
    target: 41,
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'take-best-now-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'label.taken': { en: 'Taken', ko: '집은 것' },
    'label.remaining': { en: 'Remaining', ko: '남은 몫' },
    'caption.goal': { en: 'Make {target} out of these.', ko: '이것들로 {target}을 만든다.' },
    'caption.take': {
      en: 'Takes {coin} — the largest that fits in {before}.',
      ko: '{before}에 들어가는 가장 큰 것은 {coin}. 집어 내린다.',
    },
    'caption.done': {
      en: '{count} coins make {target}. Not one was put back.',
      ko: '동전 {count}닢으로 {target}. 무른 것은 하나도 없다.',
    },
  },
};
