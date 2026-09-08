/**
 * @piece 한계 기반 가지치기.
 *
 * 답하는 질문 하나 — "아무 조건도 어기지 않은 갈래를 왜 미리 접는가?"
 * 갈래마다 최선을 내다본 값(한계)을 재고, 그것이 지금까지의 최고를 못 넘으면
 * 그 아래는 볼 것이 없다. 최고가 일찍 높아질수록 더 많이 잘린다.
 *
 * 조각이므로 header · metrics · code-view · layout 을 두지 않는다 (S-piece).
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const boundAndCutFacet: FacetJson = {
  id: 'facet:boundAndCut',
  title: {
    en: 'Bound and cut',
    ko: '한계 기반 가지치기',
  },
  description: {
    en: 'A branch whose best possible outcome cannot beat the current best is cut before it is explored.',
    ko: '최선을 내다본 값이 지금 최고보다 못하면 그 아래는 볼 것도 없다.',
  },
  algorithm: 'module:boundAndCut',
  projector: 'module:boundAndCutProjector',
  initialData: {
    type: 'bound-and-cut',
    capacity: 5,
    items: [
      { id: 'A', weight: 2, value: 12 },
      { id: 'B', weight: 3, value: 15 },
      { id: 'C', weight: 4, value: 16 },
    ],
    stepMs: 850,
  },
  blocks: {
    stage: { type: 'bound-and-cut-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'label.best': { en: 'Best', ko: '최고' },
    'label.capacity': { en: 'Capacity {c}', ko: '한도 {c}' },
    'label.itemSpec': { en: 'w {w} · v {v}', ko: '무게 {w} · 값 {v}' },

    'caption.root': {
      en: 'If items could be split, at most {bound}',
      ko: '쪼갤 수 있다 치면 많아야 {bound}',
    },
    'caption.measure': {
      en: 'This branch tops out at {bound}',
      ko: '이 갈래는 아무리 잘해도 {bound}',
    },
    'caption.settled': {
      en: 'Every item is decided — value {value}',
      ko: '물건이 모두 정해졌다 — 값 {value}',
    },
    'caption.newBest': {
      en: 'New best: {best}',
      ko: '새 최고 {best} — 자르는 기준이 올라간다',
    },
    // 숫자 뒤에 조사를 붙이지 않는다 — 읽는 소리에 따라 은/는·이/가가 갈려
    // {값} 자리에 무엇이 오든 맞는 문장이 되게 어순을 잡는다.
    'caption.cut': {
      en: '{bound} cannot beat {best} — cut this branch',
      ko: '한계 {bound}, 최고 {best} — 못 넘으니 이 갈래를 자른다',
    },
    'caption.done': {
      en: 'Cut {cuts} branches and the best is still {best}',
      ko: '자르기 {cuts}번 — 그래도 최적은 {best}',
    },
  },
};
