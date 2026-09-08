/**
 * @piece 삽입 이동 — 가운데에 넣으면 뒤가 밀린다.
 *
 * 답하는 질문 하나: 배열 가운데에 값을 넣으면 뒤의 것들은 어떻게 되는가.
 * 답: 뒤에서부터 한 칸씩 오른쪽으로 옮겨 가고, 그렇게 비운 자리에 새 값이 들어간다.
 *
 * 조각이므로 title-block 도 metrics 도 두지 않는다. 제목은 이 조각을 안은 문단이
 * 주고, 셀 것은 화면의 이동 횟수 하나뿐이라 패널을 세우지 않는다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const shiftOnInsertFacet: FacetJson = {
  id: 'facet:shiftOnInsert',
  title: {
    en: 'Inserting in the middle pushes the rest',
    ko: '가운데에 넣으면 뒤가 밀린다',
  },
  description: {
    en: 'Values behind the insertion point really move one slot to the right, back to front.',
    ko: '넣는 자리 뒤의 값들이 뒤에서부터 한 칸씩 오른쪽으로 실제로 옮겨 간다.',
  },
  algorithm: 'module:shiftOnInsert',
  projector: 'module:shiftOnInsertProjector',
  initialData: {
    type: 'shift-on-insert',
    values: [10, 20, 30, 40, 50],
    capacity: 6,
    targetIndex: 2,
    incoming: 99,
    /** 걸음 사이에 읽을 시간 (S-piece — 간격도 저작 결정이다). */
    stepMs: 700,
  },
  layout: {
    type: 'column',
    gap: 8,
    align: 'stretch',
    children: [{ ref: 'stage' }, { ref: 'controls' }],
  },
  blocks: {
    stage: { type: 'shift-on-insert-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.plan': {
      en: 'New value {incoming} — slot {at} is already taken by {occupied}.',
      ko: '넣을 값 {incoming} — {at}번 자리는 이미 {occupied} 이 차지하고 있다.',
    },
    'caption.shift': {
      en: '{value} at slot {from} → slot {to}. Moving back to front overwrites nothing.',
      ko: '{from}번의 {value} → {to}번. 뒤에서부터라 아무것도 덮이지 않는다.',
    },
    'caption.cleared': {
      en: 'Slot {at} is empty. Only now can the new value move in.',
      ko: '{at}번 자리가 비었다. 새 값은 이제야 들어갈 수 있다.',
    },
    'caption.placed': {
      en: '{value} takes slot {at}.',
      ko: '{value} 가 {at}번 자리를 차지한다.',
    },
    'caption.done': {
      en: 'One insert cost {moves} moves. The closer to the front, the more get pushed.',
      ko: '하나 넣는 데 {moves} 개를 옮겼다. 앞쪽에 넣을수록 밀 것이 많아진다.',
    },
    'label.moveCount': {
      en: 'moved: {n}',
      ko: '옮긴 횟수: {n}',
    },
  },
};
