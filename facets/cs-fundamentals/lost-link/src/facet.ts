/**
 * lost-link FacetJson.
 *
 * @piece 연결 유실 — 한 주장만 말한다: 화살표를 잘못된 차례로 옮기면 뒤쪽이
 * 통째로 떨어져 나간다. 제목은 글의 문단이 주므로 title-block 을 두지 않고,
 * 셀 것이 없으므로 metrics 도 두지 않는다 (S-piece).
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const lostLinkFacet: FacetJson = {
  id: 'facet:lostLink',
  title: {
    en: 'Lost Link',
    ko: '연결 유실',
  },
  description: {
    en: 'Move the arrow in the wrong order and everything behind it falls out of reach.',
    ko: '고리를 놓치면 뒤가 사라진다.',
  },
  algorithm: 'module:lostLink',
  projector: 'module:lostLinkProjector',
  initialData: {
    type: 'lost-link',
    nodes: [
      { id: 'A', value: 4 },
      { id: 'B', value: 9 },
      { id: 'C', value: 2 },
      { id: 'D', value: 6 },
    ],
    newNode: { id: 'X', value: 7 },
    insertAfter: 'A',
    stepMs: 850,
  },
  layout: {
    type: 'column',
    gap: 4,
    children: [{ ref: 'stage' }, { ref: 'controls' }],
  },
  blocks: {
    stage: { type: 'lost-link-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.start': {
      en: 'Every node is reachable from head.',
      ko: '모든 노드가 head 에서 닿는다.',
    },
    'caption.staged': {
      en: 'New node {node}({value}) is ready. Nothing points to it yet.',
      ko: '새 노드 {node}({value}) 를 준비했다. 아직 아무도 가리키지 않는다.',
    },
    'caption.wrongMove': {
      en: 'Wrong order — move {from}.next to {to} first.',
      ko: '틀린 차례 — {from}.next 를 먼저 {to} 로 옮긴다.',
    },
    'caption.detached': {
      en: 'Nothing points to {first} any more, so {count} nodes drop out of reach.',
      ko: '{first} 를 가리키는 화살표가 하나도 남지 않았다. {count} 개가 통째로 떨어져 나간다.',
    },
    'caption.rewind': {
      en: 'Undo. Same insertion, other order.',
      ko: '되돌린다. 같은 삽입, 다른 차례.',
    },
    'caption.stagedAgain': {
      en: '{node}({value}) is ready again.',
      ko: '{node}({value}) 를 다시 준비한다.',
    },
    'caption.rightAdd': {
      en: 'Right order — attach {from}.next to {to} first. Now two arrows reach {to}.',
      ko: '옳은 차례 — {from}.next 를 {to} 에 먼저 붙인다. 이제 {to} 를 가리키는 화살표가 둘이다.',
    },
    'caption.rightMove': {
      en: 'Now move {from}.next to {to}. The tail is still held from the other side.',
      ko: '이제 {from}.next 를 {to} 로 옮긴다. 뒤쪽은 {to} 가 계속 붙들고 있다.',
    },
    'caption.settled': {
      en: '{node} takes its place in the chain.',
      ko: '{node} 가 줄 안으로 내려앉는다.',
    },
    'caption.done': {
      en: 'No arrow into the tail was ever cut. Nothing fell off.',
      ko: '뒤로 가는 화살표가 한순간도 끊기지 않았다. 떨어져 나간 것이 없다.',
    },
    'label.reachable': {
      en: 'reachable from head',
      ko: 'head 에서 닿는 곳',
    },
    'label.unreachable': {
      en: 'still in memory, no way in',
      ko: '메모리에 남았지만 들어갈 길이 없다',
    },
    'label.note': {
      en: 'Dropping below the line means unreachable, not moved.',
      ko: '선 아래로 내려간 것은 자리를 옮긴 것이 아니라 닿을 수 없다는 뜻이다.',
    },
  },
};
