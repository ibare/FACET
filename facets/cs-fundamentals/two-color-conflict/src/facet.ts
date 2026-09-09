/**
 * twoColorConflict — 홀수 길이의 고리에서 두 색 칠하기가 부딪힌다.
 *
 * @piece 조각. 질문 하나에 답하고 멈춘다 (S-piece).
 *   질문 — 이웃끼리 다른 색을 칠해 나가면, 왜 홀수 고리에서는 끝내 부딪히는가?
 *
 * 화면에 뜨는 값(고리의 길이 · 홀짝 · 마지막 변의 두 끝)은 하나도 여기 적지
 * 않는다. 아래 initialData 의 구조에서 algorithm 이 셈해 낸다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const twoColorConflictFacet: FacetJson = {
  id: 'facet:twoColorConflict',
  title: {
    en: 'Two colors collide on an odd ring',
    ko: '홀수 고리에서 부딪히는 두 색',
  },
  description: {
    en: 'Alternate two colors around a five-vertex ring and watch the last edge fail.',
    ko: '정점 다섯의 고리를 돌며 두 색을 번갈아 칠하고, 마지막 변에서 부딪히는 것을 본다.',
  },
  algorithm: 'module:twoColorConflict',
  projector: 'module:twoColorConflictProjector',
  initialData: {
    type: 'two-color-ring',
    nodes: ['P', 'Q', 'R', 'S', 'T'],
    edges: [
      { a: 'P', b: 'Q' },
      { a: 'Q', b: 'R' },
      { a: 'R', b: 'S' },
      { a: 'S', b: 'T' },
      { a: 'T', b: 'P' },
    ],
    start: 'P',
    // 걸음 간격. 걸음 하나는 stage 의 이동 애니메이션 + 이 간격이다 (S-piece).
    stepMs: 850,
  },
  blocks: {
    stage: { type: 'two-color-conflict-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.start': {
      // 규칙("이웃끼리 같은 색일 수 없다")은 글이 첫 문단에서 말한다. 화면이
      // 되풀이하면 상시 캡션이 되고, 그것은 조각이 할 일이 아니다 (S-piece).
      en: 'A ring of vertices, none of them painted yet.',
      ko: '정점들이 고리를 이룬다. 아직 아무것도 칠하지 않았다.',
    },
    'caption.first': {
      en: 'Start at {node} with the first color.',
      ko: '{node} 에서 첫 색으로 시작한다.',
    },
    'caption.alternate': {
      en: '{prev} to {node} — neighbors differ, so the color flips.',
      ko: '{prev} 에서 {node} 로 — 이웃이 달라야 하니 색이 뒤집힌다.',
    },
    'caption.lastEdge': {
      en: 'One edge is left: {a}-{b}.',
      ko: '변이 하나 남았다 — {a}-{b}.',
    },
    'caption.collide': {
      en: '{a} and {b} meet in the same color. This edge cannot hold.',
      ko: '{a} 와 {b} 가 같은 색으로 맞선다. 이 변은 지킬 수 없다.',
    },
    'caption.odd': {
      en: 'A ring of {n} is odd, so the alternation never closes.',
      ko: '길이 {n} 의 고리는 홀수라, 번갈아 칠하기가 끝내 닫히지 않는다.',
    },
    'caption.even': {
      en: 'A ring of {n} is even, so the two colors close the ring.',
      ko: '길이 {n} 의 고리는 짝수라, 두 색으로 고리가 닫힌다.',
    },
  },
};
