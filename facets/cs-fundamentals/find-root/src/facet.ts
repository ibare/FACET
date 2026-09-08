/**
 * @piece
 *
 * find-root — "뿌리를 찾아 올라간다" 는 질문 하나에 답한다. 자리 일곱과 그
 * 가리킴을 실측 데이터로 두고, 세 자리(3·6·2)에서 각각 올라가 어느 이름에
 * 닿는지, 그리고 자리로는 안 보이던 무리가 이름으로는 드러나는지를 보인다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const findRootFacet: FacetJson = {
  id: 'facet:findRoot',
  title: { en: 'Find the Root', ko: '뿌리 찾기' },
  algorithm: 'module:findRoot',
  projector: 'module:findRootProjector',
  initialData: {
    type: 'findRoot',
    // 자리 0~6 이 가리키는 자리. parent[i] === i 면 자기 자신 — 뿌리.
    parent: [0, 0, 1, 1, 4, 4, 5],
    // 차례로 올라가 볼 시작 자리 — 사양의 3 → 6 → 2 순서 그대로.
    queries: [3, 6, 2],
    stepMs: 640,
  },
  blocks: {
    stage: { type: 'find-root-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.start': {
      en: 'Start at slot {n}.',
      ko: '자리 {n} 에서 시작한다.',
    },
    'caption.hop': {
      en: 'Slot {from} points to slot {to} — climb up.',
      ko: '자리 {from} 은 자리 {to} 를 가리킨다 — 오른다.',
    },
    'caption.root': {
      en: 'Slot {n} points to itself — the root. Its name is {n}.',
      ko: '자리 {n} 은 자기 자신을 가리킨다 — 뿌리다. 이름은 {n}.',
    },
    'caption.compareSame': {
      en: 'Slot {a} and slot {b} both reach name {name} — same group.',
      ko: '자리 {a} 와 자리 {b} 는 둘 다 이름 {name} 에 닿는다 — 한 무리다.',
    },
    'caption.compareDiff': {
      en: 'Slot {a} reaches name {nameA}, slot {b} reaches name {nameB} — different groups.',
      ko: '자리 {a} 는 이름 {nameA} 에, 자리 {b} 는 이름 {nameB} 에 닿는다 — 남남이다.',
    },
  },
};
