/**
 * @piece 조각(piece) facet — 질문 하나에 답하고 멈춘다.
 *
 * 답하는 질문: **가벼운 것부터 집는데, 왜 어떤 간선은 버려지는가.**
 *
 * 무게 순으로 줄 세운 간선을 위에서부터 집고, 집어 든 간선의 양 끝이 이미 같은
 * 무리이면 버린다. 무리는 정점의 색이고, 간선을 놓을 때마다 두 무리가 하나로
 * 물든다. 버리기 직전에는 이미 이어져 있던 길이 켜지고 집어 든 간선이 그 위에
 * 놓여 고리를 닫는다 — 그것이 버리는 까닭이다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const sortEdgesAvoidCycleFacet: FacetJson = {
  id: 'facet:sortEdgesAvoidCycle',
  title: {
    en: 'Sort the edges, drop the ones that close a loop',
    ko: '간선을 무게 순으로, 고리가 되면 버리기',
  },
  description: {
    en: 'Take edges from lightest to heaviest and drop any edge whose endpoints already sit in one group.',
    ko: '가벼운 간선부터 집되, 양 끝이 이미 한 무리인 간선은 버린다.',
  },
  algorithm: 'module:sortEdgesAvoidCycle',
  projector: 'module:sortEdgesAvoidCycleProjector',
  initialData: {
    type: 'sort-edges-avoid-cycle',
    nodes: ['P', 'Q', 'R', 'S', 'T'],
    // 무게 순이 아닌 차례로 적는다. 줄 세우기가 크루스칼의 첫 동작인데 이미
    // 정렬해 넘기면 그 걸음이 아무것도 움직이지 않는 죽은 걸음이 된다.
    // 이 차례에서는 여섯 장이 모두 자리를 옮긴다 — 제자리에 남는 카드가 없다.
    edges: [
      { id: 'Q-R', u: 'Q', v: 'R', weight: 3 },
      { id: 'S-T', u: 'S', v: 'T', weight: 5 },
      { id: 'P-Q', u: 'P', v: 'Q', weight: 1 },
      { id: 'Q-T', u: 'Q', v: 'T', weight: 6 },
      { id: 'R-S', u: 'R', v: 'S', weight: 2 },
      { id: 'P-R', u: 'P', v: 'R', weight: 4 },
    ],
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'sort-edges-avoid-cycle-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'label.queue': { en: 'by weight', ko: '무게 순' },
    'label.discarded': { en: 'discarded', ko: '버린 간선' },
    'caption.start': {
      en: 'The edges stand in line, lightest first.',
      ko: '간선이 가벼운 것부터 줄을 섰다.',
    },
    'caption.pick': {
      en: 'Pick up {u}–{v}, weight {weight}.',
      ko: '{u}–{v} 를 집는다. 무게 {weight}.',
    },
    'caption.keep': {
      en: '{u} and {v} are in different groups — lay the edge down, the two groups become one.',
      ko: '{u} 와 {v} 는 다른 무리다 — 간선을 놓으면 두 무리가 하나가 된다.',
    },
    'caption.discard': {
      en: '{u} and {v} are already in one group — this edge would close a loop, so it is dropped.',
      ko: '{u} 와 {v} 는 이미 한 무리다 — 이 간선은 고리를 닫으므로 버린다.',
    },
    'caption.done': {
      en: 'Kept {kept}, dropped {discarded}. Total weight {total}.',
      ko: '{kept} 개를 놓고 {discarded} 개를 버렸다. 무게 합 {total}.',
    },
  },
};
