/**
 * @piece 순회 순서 — "어느 순서로 밟는가".
 *
 * 답하는 질문 하나: **같은 나무를 세 가지 차례로 훑을 때 무엇이 달라지는가.**
 * 나무도 발이 지나는 길도 바뀌지 않는다. 제 자리를 밟았다고 세는 순간만
 * 자식보다 먼저 / 왼쪽 다음 / 둘 다 마친 뒤로 옮겨 간다.
 *
 * 조각이므로 header · metrics · layout 을 두지 않는다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const traversalOrderFacet: FacetJson = {
  id: 'facet:traversalOrder',
  title: { en: 'Traversal order', ko: '순회 순서' },
  description: {
    en: 'One tree walked three ways. Only the moment of stepping on its own place moves.',
    ko: '한 나무를 세 가지 차례로 밟는다. 제 자리를 밟는 순간만 옮겨 간다.',
  },
  algorithm: 'module:traversalOrder',
  projector: 'module:traversalOrderProjector',
  initialData: {
    type: 'traversal-order',
    // 값이 곧 이름인 이진 탐색 트리. 레벨 순서로 적었다.
    //         4
    //       /   \
    //      2     6
    //     / \   / \
    //    1   3 5   7
    values: [4, 2, 6, 1, 3, 5, 7],
    orders: ['pre', 'in', 'post'],
    stepMs: 480,
  },
  blocks: {
    stage: { type: 'traversal-order-stage' },
    // 조각의 표준 묶음 — 다시 보기 · 한 걸음 (S-piece).
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'label.preorder': { en: 'preorder', ko: '전위' },
    'label.inorder': { en: 'inorder', ko: '중위' },
    'label.postorder': { en: 'postorder', ko: '후위' },
    'caption.pre': {
      en: 'Preorder — step on your own place first, then left, then right.',
      ko: '전위 — 제 자리를 먼저 밟고, 그다음 왼쪽, 그다음 오른쪽.',
    },
    'caption.in': {
      en: 'Inorder — left first, then your own place, then right.',
      ko: '중위 — 왼쪽을 마친 뒤에 제 자리, 그다음 오른쪽.',
    },
    'caption.post': {
      en: 'Postorder — both children first, then your own place.',
      ko: '후위 — 왼쪽과 오른쪽을 다 마친 뒤에 제 자리.',
    },
    'caption.done': {
      en: 'Same tree, same route. Only the moment of stepping on its own place moves.',
      ko: '같은 나무, 같은 길. 제 자리를 밟는 순간만 옮겨 간다.',
    },
  },
};
