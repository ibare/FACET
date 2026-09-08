/**
 * @piece 배열 기반 트리 — 번호로 건너간다.
 *
 * 답하는 질문 하나: **배열 하나로 나무를 어떻게 흉내 내는가.** 한 줄로 늘어선
 * 칸과 나무의 자리가 같은 것의 두 모습임을 보이고, 잇는 줄(포인터) 없이
 * `2i+1` · `2i+2` · `⌊(i−1)/2⌋` 셈만으로 부모와 자식 사이를 오간다.
 *
 * 조각이므로 header 도 metrics 도 두지 않는다 (S-piece). 제목은 글의 문단이
 * 주고, 셀 것은 없다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const arrayAsTreeFacet: FacetJson = {
  id: 'facet:arrayAsTree',
  title: { en: 'Array as a tree', ko: '배열 기반 트리' },
  description: {
    en: 'How one array stands in for a tree — no stored links, only index arithmetic.',
    ko: '배열 하나로 나무를 흉내 내는 법 — 저장된 링크 없이, 번호 셈만으로.',
  },
  algorithm: 'module:arrayAsTree',
  projector: 'module:arrayAsTreeProjector',

  initialData: {
    type: 'array-as-tree',
    values: [3, 5, 8, 9, 6, 12, 10],
    stepMs: 640,
  },

  blocks: {
    stage: { type: 'array-as-tree-stage' },
    controls: { type: 'control-bar', controls: [CONTROL.replay, CONTROL.advance] },
  },

  messages: {
    'caption.start': {
      en: 'Index {i} — the root of the tree.',
      ko: '자리 {i} — 나무의 뿌리.',
    },
    'caption.descendLeft': {
      en: 'Left child: 2 × {from} + 1 = {to}.',
      ko: '왼쪽 자식: 2 × {from} + 1 = {to}.',
    },
    'caption.descendRight': {
      en: 'Right child: 2 × {from} + 2 = {to}.',
      ko: '오른쪽 자식: 2 × {from} + 2 = {to}.',
    },
    'caption.ascend': {
      en: 'Parent: ⌊({from} − 1) / 2⌋ = {to}.',
      ko: '부모: ⌊({from} − 1) / 2⌋ = {to}.',
    },
    'caption.root': {
      en: 'Parent: ⌊({from} − 1) / 2⌋ = {to} — back at the root.',
      ko: '부모: ⌊({from} − 1) / 2⌋ = {to} — 뿌리로 돌아왔다.',
    },
    'caption.leaf': {
      en: '{l} and {r} both fall past the last cell ({n} of them) — {at} has no child. It is a leaf.',
      ko: '{l}과 {r} 모두 마지막 칸({n}개)을 넘는다 — {at}에는 자식이 없다. 잎이다.',
    },
    'caption.saved': {
      en: '{n} cells hold {n} values and {links} stored links. The same shape as linked nodes would need {hypo}.',
      ko: '{n}개 칸에 값 {n}개, 저장된 링크는 {links}개. 노드로 이었다면 {hypo}개가 필요했다.',
    },
  },
};
