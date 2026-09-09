/**
 * indegree-zero-first — 조각(piece) facet 선언.
 *
 * @piece 들어오는 화살이 하나도 없는 것만 지금 꺼낼 수 있고, 꺼내고 나면
 *        다음 것이 0 이 된다.
 *
 * 진입 차수는 선언에 적지 않는다 — `edges` 에서 algorithm 이 센다. 손으로 적은
 * 표를 두면 그림이 구조와 어긋날 수 있고, 그때 화면이 거짓을 말하게 된다.
 *
 * header 도 metrics 도 layout 도 두지 않는다 (S-piece).
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const indegreeZeroFirstFacet: FacetJson = {
  id: 'facet:indegreeZeroFirst',
  title: {
    en: 'Take the ones with nothing coming in',
    ko: '들어오는 것이 없는 것부터 꺼낸다',
  },
  description: {
    en: 'Only a vertex with no incoming arrows can be taken. Taking it drops the arrows it held, and whoever reaches 0 falls next.',
    ko: '들어오는 화살이 없는 정점만 꺼낼 수 있다. 꺼내면 그것이 걸어 두었던 화살이 떨어지고, 0 이 된 것이 뒤따라 떨어진다.',
  },
  algorithm: 'module:indegreeZeroFirst',
  projector: 'module:indegreeZeroFirstProjector',
  initialData: {
    type: 'indegree-zero-first',
    nodes: ['a', 'b', 'c', 'd', 'e'],
    edges: [
      { from: 'a', to: 'c' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'd' },
      { from: 'c', to: 'e' },
      { from: 'b', to: 'e' },
    ],
    stepMs: 900,
  },
  blocks: {
    stage: { type: 'indegree-zero-first-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.count': {
      en: 'Count the arrows coming into each vertex.',
      ko: '각 정점으로 들어오는 화살을 센다.',
    },
    'caption.startReady': {
      en: '{ids} carry nothing — only these can be taken now.',
      ko: '{ids} 는 이고 있는 것이 없다 — 지금 꺼낼 수 있는 것은 이것뿐이다.',
    },
    'caption.take': {
      en: 'Take {id} — it carries 0.',
      ko: '{id} 를 꺼낸다 — 이고 있는 수가 0 이다.',
    },
    'caption.drop': {
      en: '{id} is gone, so the arrows it held fall off: {drops}',
      ko: '{id} 가 빠지자 걸려 있던 화살이 떨어진다: {drops}',
    },
    'caption.newReady': {
      en: '{ids} just reached 0 — they fall next.',
      ko: '{ids} 가 방금 0 이 되었다 — 뒤따라 떨어진다.',
    },
    'caption.done': {
      en: 'Order: {order}',
      ko: '순서: {order}',
    },
  },
};
