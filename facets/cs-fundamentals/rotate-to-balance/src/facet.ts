/**
 * rotate-to-balance — 회전 조각(piece) 선언.
 *
 * @piece 한쪽으로 기운 자리에서 축이 내려가고 그 자식이 올라온다. 그 사이
 * 가지 하나가 손을 바꿔 내려간 축에 가서 붙고, 그것이 회전의 전부다. 중위
 * 순회 결과는 회전 전후가 같다 — 순서는 그대로고 모양만 바뀐다는 것이
 * 회전이 허용되는 이유다. 이 한 가지만 말하고 멈춘다.
 *
 * 제목 블록도 메트릭도 두지 않는다. 제목은 글의 문단이 주고, 조각은 셀 것이
 * 없다 (S-piece). layout 은 stage 와 controls 뿐이라 러너에 맡긴다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const rotateToBalanceFacet: FacetJson = {
  id: 'facet:rotateToBalance',
  title: { en: 'Rotate to Balance', ko: '균형을 위한 회전' },
  description: {
    en: 'A single rotation straightens a leaning tree.',
    ko: '한 번의 회전이 기울어진 트리를 바로 세운다.',
  },
  algorithm: 'module:rotateToBalance',
  projector: 'module:rotateToBalanceProjector',
  initialData: {
    type: 'rotateToBalance',
    stepMs: 760,
    rootId: '30',
    pivotId: '30',
    nodes: [
      { id: '30', value: 30, left: '10', right: '50' },
      { id: '50', value: 50, left: '40', right: '70' },
      { id: '70', value: 70, left: null, right: '80' },
      { id: '10', value: 10, left: null, right: null },
      { id: '40', value: 40, left: null, right: null },
      { id: '80', value: 80, left: null, right: null },
    ],
  },
  blocks: {
    stage: { type: 'rotate-to-balance-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.imbalance': {
      en: 'Node {value} has balance factor {balance} — outside the [-1, 1] range.',
      ko: '노드 {value}의 균형 인수가 {balance}로 [-1, 1] 범위를 벗어났습니다.',
    },
    'caption.balanceChecked': {
      en: 'Every balance factor is within range.',
      ko: '모든 균형 인수가 범위 안에 있습니다.',
    },
    'caption.rebalanced': {
      en: 'Every balance factor is back in the [-1, 1] range.',
      ko: '모든 균형 인수가 다시 [-1, 1] 범위 안으로 돌아왔습니다.',
    },
    'caption.rotating': {
      en: '{newRootValue} rises to the top, {pivotValue} settles below it, and {movedValue} changes parent.',
      ko: '{newRootValue}가 위로 올라가고 {pivotValue}는 그 아래로 내려가며, {movedValue}는 부모를 바꿉니다.',
    },
    'caption.rotatingSimple': {
      en: '{newRootValue} rises to the top and {pivotValue} settles below it.',
      ko: '{newRootValue}가 위로 올라가고 {pivotValue}는 그 아래로 내려갑니다.',
    },
    'caption.rewound': {
      en: 'Back to the start — press again to step through.',
      ko: '처음으로 되돌아갔습니다 — 다시 누르면 한 걸음씩 봅니다.',
    },
    'caption.done': {
      en: 'Height drops from {before} to {after}; in-order sequence stays {order}.',
      ko: '높이가 {before}에서 {after}로 줄고, 중위 순회 순서는 {order} 그대로입니다.',
    },
  },
};
