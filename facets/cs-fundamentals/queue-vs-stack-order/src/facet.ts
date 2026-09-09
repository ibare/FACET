/**
 * @piece 탐색이 쓰는 그릇 — 같은 그래프에서 순서가 갈린다.
 *
 * 답하는 질문 하나: **같은 그래프에서 담는 그릇만 바꾸면 방문 순서가 갈리는가.**
 * 그래프도 출발점도 이웃을 보는 순서도 같게 두고, 꺼내는 자리만 다른 두 그릇을
 * 나란히 돌린다. 하나는 앞에서 꺼내고 하나는 위에서 꺼낸다.
 *
 * 조각이므로 header 도 metrics 도 layout 도 두지 않는다 (S-piece). 제목은 글의
 * 문단이 주고, 셀 것은 없고, 적을 배치는 하나뿐이다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const queueVsStackOrderFacet: FacetJson = {
  id: 'facet:queueVsStackOrder',
  title: { en: 'The vessel decides the order', ko: '그릇이 순서를 정한다' },
  description: {
    en: 'Same graph, same neighbour order — swapping the vessel splits the visiting order.',
    ko: '같은 그래프, 같은 이웃 순서 — 담는 그릇만 바꾸면 방문 순서가 갈린다.',
  },
  algorithm: 'module:queueVsStackOrder',
  projector: 'module:queueVsStackOrderProjector',

  initialData: {
    type: 'queue-vs-stack-order',
    vertices: [1, 2, 3, 4, 5, 6],
    edges: [
      [1, 2],
      [1, 3],
      [2, 4],
      [2, 5],
      [3, 6],
    ],
    start: 1,
    stepMs: 750,
  },

  blocks: {
    stage: { type: 'queue-vs-stack-order-stage' },
    controls: { type: 'control-bar', controls: [CONTROL.replay, CONTROL.advance] },
  },

  messages: {
    'label.fifo': {
      en: 'first in, first out',
      ko: '먼저 넣은 것을 먼저',
    },
    'label.lifo': {
      en: 'last in, first out',
      ko: '나중에 넣은 것을 먼저',
    },
    'caption.ready': {
      en: 'Same graph, same neighbour order — only the vessels differ.',
      ko: '같은 그래프, 같은 이웃 순서 — 다른 것은 그릇뿐이다.',
    },
    'caption.seed': {
      en: 'The start, {vertex}, goes into both vessels.',
      ko: '출발점 {vertex}번이 두 그릇에 모두 들어간다.',
    },
    'caption.take': {
      en: 'Out — {fifo} from the front, {lifo} from the top.',
      ko: '꺼낸다 — 앞에서 {fifo}번, 위에서 {lifo}번.',
    },
    'caption.diverge': {
      en: 'Here the orders part — {fifo} from the front, {lifo} from the top.',
      ko: '여기서 순서가 갈린다 — 앞에서 {fifo}번, 위에서 {lifo}번.',
    },
    'caption.offer': {
      en: 'The new neighbours go in, smallest number first — the same rule on both sides.',
      ko: '새 이웃이 번호가 작은 것부터 들어간다 — 양쪽 모두 같은 규칙이다.',
    },
    'caption.done': {
      en: 'Only the vessel differed, and the visiting order split.',
      ko: '다른 것은 그릇뿐인데 방문 순서가 갈렸다.',
    },
  },
};
