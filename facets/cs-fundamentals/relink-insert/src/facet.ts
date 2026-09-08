/**
 * relink-insert — 재연결 조각의 선언.
 *
 * @piece 한 질문에만 답한다 — 연결 리스트에 하나를 끼워 넣을 때 무엇이
 * 움직이는가. 답은 화살표 둘뿐이고 상자는 하나도 움직이지 않는다.
 *
 * 그래서 header (title-block) 도 metrics 도 두지 않는다. 제목은 이 그림을
 * 안고 있는 글의 문단이 주고, 셀 것은 없다 (S-piece).
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const relinkInsertFacet: FacetJson = {
  id: 'facet:relinkInsert',
  title: { en: 'Relinking', ko: '재연결' },
  description: {
    en: 'Inserting into a linked list rewrites arrows, not positions.',
    ko: '연결 리스트의 삽입은 자리가 아니라 화살표를 고쳐 쓴다.',
  },
  algorithm: 'module:relink-insert',
  projector: 'module:relink-insert',
  initialData: {
    type: 'relink-insert',
    nodes: [
      { id: 'A', value: 4 },
      { id: 'B', value: 9 },
      { id: 'C', value: 2 },
    ],
    incoming: { id: 'X', value: 7 },
    insertAfter: 'A',
    // 걸음 사이에 읽을 시간을 준다. 조각은 지나가는 사람이 보는 그림이다.
    stepMs: 1200,
  },
  layout: {
    type: 'column',
    gap: 4,
    children: [{ ref: 'stage' }, { ref: 'controls' }],
  },
  blocks: {
    stage: { type: 'relink-insert-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.chain': {
      en: 'Three boxes in a row. The arrows, not the boxes, set the order.',
      ko: '상자 셋이 줄지어 있다. 순서를 정하는 것은 상자가 아니라 화살표다.',
    },
    'caption.staged': {
      en: 'A new box holding {value} waits below, linked to nothing yet.',
      ko: '{value} 를 담은 새 상자가 아래에서 기다린다. 아직 어디에도 이어져 있지 않다.',
    },
    'caption.attachNew': {
      en: "First, point {source}'s next at {target}.",
      ko: '먼저 {source} 의 next 를 {target} 에 붙인다.',
    },
    'caption.detach': {
      en: "Now unhook {source}'s next from {target}. For a moment it points nowhere.",
      ko: '이제 {source} 의 next 를 {target} 에서 뗀다. 그 사이 화살표는 아무 데도 가리키지 않는다.',
    },
    'caption.attachBack': {
      en: 'Drop that same arrow onto {target}. The tail never left {source}.',
      ko: '그 화살표를 그대로 {target} 에 내려놓는다. 꼬리는 {source} 를 떠난 적이 없다.',
    },
    'caption.done': {
      en: 'Inserted — and every box sits exactly where it sat.',
      ko: '다 넣었다 — 그런데 어느 상자도 자리를 옮기지 않았다.',
    },
    'label.tally': {
      en: 'Arrows rewritten: {rewires} · Boxes moved: {moves}',
      ko: '고쳐 쓴 화살표 {rewires}개 · 옮긴 상자 {moves}개',
    },
    // 전제 각주 — 아래 줄은 그림의 사정이지 자료구조의 사정이 아니다 (S-piece).
  },
};
