/**
 * impurityDrops — 불순도 감소. "잘 갈랐다" 를 무엇으로 재는가.
 *
 * 섞임이 수 하나로 재어지고, 가를 때마다 그 수가 떨어진다. 그 수는 개수가 아니라
 * **비율**을 읽는다 — 그래서 통이 커져도 값이 그대로다. 끝에서 0 이 되는 것,
 * 곧 통마다 이름표가 하나뿐인 것이 나무가 멈추는 조건이다.
 *
 * 선언에 두는 것은 구조뿐이다 — 점과 이름표, 그리고 가름선의 기준값. 자리와
 * 축척은 stage 가 셈한다 (S-piece).
 *
 * @piece
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const impurityDropsFacet: FacetJson = {
  id: 'facet:impurityDrops',
  title: {
    en: 'How do we measure a good split',
    ko: '"잘 갈랐다" 를 무엇으로 재는가',
  },
  description: {
    en: 'Mixing becomes a single number, and every cut makes it fall. The number reads proportions, not counts.',
    ko: '섞임이 수 하나로 재어지고, 가를 때마다 그 수가 떨어진다. 그 수는 개수가 아니라 비율을 읽는다.',
  },
  algorithm: 'module:impurityDrops',
  projector: 'module:impurityDropsProjector',
  initialData: {
    type: 'impurity-drops',
    points: [
      { x: 1, y: 1, label: 'A' },
      { x: 1, y: 2, label: 'A' },
      { x: 2, y: 1, label: 'A' },
      { x: 2, y: 2, label: 'A' },
      { x: 2, y: 3, label: 'A' },
      { x: 4, y: 4, label: 'A' },
      { x: 5, y: 1, label: 'B' },
      { x: 5, y: 2, label: 'B' },
      { x: 4, y: 1, label: 'B' },
      { x: 5, y: 3, label: 'B' },
      { x: 1, y: 5, label: 'B' },
      { x: 2, y: 5, label: 'B' },
    ],
    classes: ['A', 'B'],
    // path 는 뿌리에서의 갈림길. 'L' 은 기준값 미만 쪽, 'H' 는 이상 쪽이다.
    cuts: [
      { path: '', axis: 'x', at: 3 },
      { path: 'L', axis: 'y', at: 4 },
      { path: 'H', axis: 'y', at: 3.5 },
    ],
    stepMs: 850,
  },
  blocks: {
    stage: { type: 'impurity-drops-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'label.impurity': {
      en: 'impurity',
      ko: '섞임',
    },
    'label.formula': {
      en: 'impurity = 1 − p(A)² − p(B)²',
      ko: '섞임 = 1 − (A비율)² − (B비율)²',
    },
    'caption.start': {
      en: 'All of them sit in one bucket. The colour boundary lands right on the half-and-half mark. Impurity: {g}',
      ko: '전부 한 통에 담겨 있다. 색 경계가 한가운데 눈금에 정확히 걸린다. 섞임: {g}',
    },
    'caption.cutRoot': {
      en: 'One question for the whole bucket. Cut position: {t}',
      ko: '통 전체에 질문 하나. 자름선의 자리: {t}',
    },
    'caption.cutAgain': {
      en: 'Now each bucket gets its own question. Cut positions: {ts}',
      ko: '이제 통마다 제 질문을 받는다. 자름선의 자리: {ts}',
    },
    'caption.split': {
      en: 'Each piece drops to its own impurity — set by where the colour boundary sits, not by how wide the piece is.',
      ko: '조각마다 제 섞임까지 내려간다. 높이를 정하는 것은 폭이 아니라 색 경계의 자리다.',
    },
    'caption.level': {
      en: 'Impurity of the layer, weighted by bucket size: {to}. It fell by {drop}',
      ko: '통 크기로 가중한 층의 섞임: {to}. 내려간 폭: {drop}',
    },
    'caption.settled': {
      en: 'Every bucket now carries a single label. Nothing left to ask, so the tree stops.',
      ko: '이제 통마다 이름표가 한 가지뿐. 더 물을 것이 없어 나무가 멈춘다.',
    },
  },
};
