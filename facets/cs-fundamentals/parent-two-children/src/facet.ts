/**
 * parent-two-children — 이진 트리 조각(piece) 선언.
 *
 * @piece 한 자리에서 아래로 최대 둘이 뻗고, 그 둘은 이름이 달라 자리를 바꿀 수
 * 없다. 자식이 하나뿐이어도 그것이 왼쪽인지 오른쪽인지가 정해져 있다는 것 —
 * 이 한 가지만 말하고 멈춘다.
 *
 * 제목 블록도 메트릭도 두지 않는다. 제목은 글의 문단이 주고, 조각은 셀 것이
 * 없다 (S-piece). layout 은 stage 와 controls 뿐이라 러너에 맡긴다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const parentTwoChildrenFacet: FacetJson = {
  id: 'facet:parentTwoChildren',
  title: { en: 'One seat, two branches', ko: '한 자리에서 둘로' },
  description: {
    en: 'A node reaches down to at most two children, and left and right are named seats that cannot be swapped.',
    ko: '한 자리에서 아래로 최대 둘이 뻗는다. 왼쪽과 오른쪽은 이름이 다른 자리라 바꿀 수 없다.',
  },
  algorithm: 'module:parentTwoChildren',
  projector: 'module:parentTwoChildrenProjector',
  initialData: {
    type: 'binary-tree',
    root: 'A',
    // 가지 다섯 · 잎 셋 · 높이 둘 (뿌리를 0 으로 셈). C 는 오른쪽 자식만 갖는다 —
    // 자식이 하나여도 어느 쪽인지가 정해진다는 것을 보이는 자리다.
    nodes: [
      { id: 'A', left: 'B', right: 'C' },
      { id: 'B', left: 'D', right: 'E' },
      { id: 'C', left: null, right: 'F' },
      { id: 'D', left: null, right: null },
      { id: 'E', left: null, right: null },
      { id: 'F', left: null, right: null },
    ],
    stepMs: 640,
  },
  blocks: {
    stage: { type: 'parent-two-children-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.seat': {
      en: 'It starts with one seat.',
      ko: '자리 하나에서 시작한다.',
    },
    'caption.splitRoot': {
      en: 'One seat, two branches reaching down — a left and a right.',
      ko: '한 자리에서 아래로 둘이 뻗는다. 왼쪽과 오른쪽이다.',
    },
    'caption.splitAgain': {
      en: 'Each new seat splits the same way: at most two, downward.',
      ko: '새로 생긴 자리도 같은 방식으로 갈라진다. 아래로 최대 둘.',
    },
    'caption.splitOne': {
      en: 'Even a single child has a side. The other seat opens and stays empty.',
      ko: '자식이 하나여도 어느 쪽인지가 정해진다. 남은 한 자리는 빈 채로 열린다.',
    },
    'caption.sidesFixed': {
      en: 'Left and right are different names — they cannot trade places.',
      ko: '왼쪽과 오른쪽은 이름이 다르다. 서로 자리를 바꿀 수 없다.',
    },
  },
};
