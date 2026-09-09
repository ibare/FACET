/**
 * 시그모이드 — 끝없이 커지는 점수를 어떻게 0 과 1 사이의 확률로 바꾸는가.
 *
 * @piece 질문 하나에 답하고 멈춘다. 재료는 수직선 하나와 띠 하나뿐이며,
 *        점 무리도 결정 경계도 여기 없다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const squashToProbabilityFacet: FacetJson = {
  id: 'facet:squashToProbability',
  title: {
    en: 'Squashing a score into a probability',
    ko: '점수를 확률로 눌러 담기',
  },
  description: {
    en: 'An endless axis folded into the strip between 0 and 1.',
    ko: '끝없는 축이 0 과 1 사이의 띠로 접혀 든다.',
  },
  algorithm: 'module:squashToProbability',
  projector: 'module:squashToProbabilityProjector',
  initialData: {
    type: 'squash-to-probability',
    /** 눌러 담을 점수. 자리는 그림이 셈하고 확률은 알고리즘이 셈한다. */
    scores: [-8, -4, -2, -1, 0, 1, 2, 4, 8],
    /** 걸음 간격. 읽을 시간을 주는 저작 결정이다 (S-piece). */
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'squash-to-probability-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.axis': {
      en: 'The score axis runs on without end, in both directions.',
      ko: '점수 축은 양쪽으로 끝없이 뻗는다.',
    },
    'caption.band': {
      en: 'A probability may only sit between two walls.',
      ko: '확률이 앉을 자리는 두 벽 사이뿐이다.',
    },
    'caption.center': {
      en: 'The middle of the axis lands in the middle of the band: {p}.',
      ko: '축의 한가운데는 띠의 한가운데로 내려앉는다. 자리는 {p}.',
    },
    'caption.squash': {
      en: 'z = {z} lands at {p}. A step of {dz} along the axis buys {dp} of the band.',
      ko: 'z = {z} → {p}. 축에서 벌린 거리 {dz}, 띠에서 얻은 폭 {dp}.',
    },
    'caption.tails': {
      en: 'The rest of the axis presses into two slivers — and the walls stay out of reach: {lo} / {hi}.',
      ko: '축의 나머지 전부가 양 끝 자투리로 눌려 든다. 그래도 벽에 닿지는 못한다 — 끝의 두 값: {lo} / {hi}.',
    },
  },
};
