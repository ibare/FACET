/**
 * undo-by-back-edge — 되돌리는 폭 (잔여 그래프의 역방향).
 *
 * @piece 한 질문에만 답한다 — "흘린 것을 되돌릴 수 있으면 무엇이 달라지는가."
 *        앞으로 난 화살만 타면 넷에서 막히고, 앞서 흘려 둔 것을 밀어내면 여섯까지
 *        간다. 그 두 장면의 순서가 이 조각의 전부다.
 *
 * 간선을 적은 차례가 곧 길을 찾는 차례다 (선언 순서대로 도는 DFS). S→A 를 S→B
 * 보다, A→B 를 A→T 보다 앞에 둔 것은 첫 길이 일부러 가운데 관을 지나게 하려는
 * 저작 결정이다 — 가운데로 먼저 흘려 두어야 되돌릴 일이 생긴다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const undoByBackEdgeFacet: FacetJson = {
  id: 'facet:undoByBackEdge',
  title: {
    en: 'Undo by back edge',
    ko: '되돌리는 폭',
  },
  description: {
    en: 'What is flowed can be pushed back by that much — and that is what unsticks the flow.',
    ko: '흘린 만큼 되돌릴 폭이 생기고, 막힌 흐름은 그 폭으로 풀린다.',
  },
  algorithm: 'module:undoByBackEdge',
  projector: 'module:undoByBackEdgeProjector',
  initialData: {
    type: 'undo-by-back-edge',
    stepMs: 950,
    source: 'S',
    sink: 'T',
    nodes: ['S', 'A', 'B', 'T'],
    edges: [
      { from: 'S', to: 'A', capacity: 3 },
      { from: 'S', to: 'B', capacity: 3 },
      { from: 'A', to: 'B', capacity: 2 },
      { from: 'A', to: 'T', capacity: 3 },
      { from: 'B', to: 'T', capacity: 3 },
    ],
  },
  blocks: {
    stage: { type: 'undo-by-back-edge-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.pathForward': {
      en: 'A route along forward arrows. Its narrowest pipe passes {amount}.',
      ko: '앞으로 난 화살만 타고 찾은 길. 가장 좁은 관이 {amount}만큼 통과시킨다.',
    },
    'caption.pushFirst': {
      en: '{amount} gets through. Now each filled pipe can be pushed back by what it holds.',
      ko: '{amount}가 지나갔다. 이제 찬 관마다 찬 만큼 되돌릴 폭이 생겼다.',
    },
    'caption.push': {
      en: '{amount} more gets through — {total} in all.',
      ko: '더 지나간 양은 {amount} — 모두 {total}.',
    },
    'caption.blocked': {
      en: 'Forward arrows lead nowhere now. Stuck at {total}.',
      ko: '앞으로 난 화살로는 더 갈 데가 없다. {total}에서 막혔다.',
    },
    'caption.pathReverse': {
      en: 'A back arrow opens one more route — it passes {amount}.',
      ko: '되돌릴 폭을 타는 길이 하나 남아 있다 — 이 길로 {amount}가 지나간다.',
    },
    'caption.pushReverse': {
      en: 'The new flow pushes the old one out of that pipe — {total} in all.',
      ko: '새로 온 것이 앞서 흘려 둔 것을 그 관에서 밀어냈다 — 모두 {total}.',
    },
    'caption.done': {
      en: 'No route left, even along back arrows. {total} is the most.',
      ko: '되돌릴 폭으로도 남은 길이 없다. {total}이 최대다.',
    },
    'label.received': {
      en: 'reached {sink}',
      ko: '{sink} 에 닿은 양',
    },
  },
};
