/**
 * @piece 조각(piece) facet — 질문 하나에 답하고 멈춘다 (S-piece).
 *
 * 질문: 메모리에 흩어져 있는 노드들에 어떻게 순서가 생기는가?
 * 답:   노드가 값 옆에 다음 노드의 주소를 함께 쥐고 있고, 그 주소가 가리킨다.
 *
 * 제목 블록도 메트릭도 두지 않는다 — 제목은 글의 문단이 주고, 조각은 셀 것이
 * 없다. 컨트롤은 다시 보기와 한 걸음 둘뿐이며 둘 다 눌러야 완성되는 조작이
 * 아니다. 알고리즘은 reactive 로 등록되어 mount 시 스스로 재생한다
 * (index.ts 의 registerAlgorithm 옵션).
 */

import { CONTROL } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const nodePointsNextFacet: FacetJson = {
  id: 'facet:nodePointsNext',
  title: { en: 'A node points to the next', ko: '노드가 다음을 가리킨다' },
  description: {
    en: 'Nodes lie scattered in memory, yet they have an order — the address each node holds beside its value.',
    ko: '노드는 메모리에 흩어져 있지만 순서가 있다. 그 순서를 만드는 것은 노드가 값 옆에 쥐고 있는 주소다.',
  },
  algorithm: 'module:nodePointsNext',
  projector: 'module:nodePointsNext',
  initialData: {
    type: 'node-points-next',
    /** 걸음 간격. 한 걸음마다 읽을 시간을 준다. */
    stepMs: 760,
    head: '0x0100',
    /** 노드 하나의 크기. int32 값 4바이트 + 주소 4바이트. */
    nodeBytes: 8,
    valueBytes: 4,
    addressBytes: 4,
    /** 논리 순서 (head 부터) 로 적었다. 메모리 순서는 0x0100 · 0x0180 · 0x0240 다. */
    nodes: [
      { addr: '0x0100', value: 12, next: '0x0240' },
      { addr: '0x0240', value: 5, next: '0x0180' },
      { addr: '0x0180', value: 8, next: null },
    ],
  },
  layout: {
    type: 'column',
    gap: 4,
    children: [{ ref: 'stage' }, { ref: 'controls' }],
  },
  blocks: {
    stage: { type: 'node-points-next-stage' },
    controls: { type: 'control-bar', controls: [CONTROL.replay, CONTROL.advance] },
  },
  messages: {
    'caption.scattered': {
      en: 'Three nodes lie apart in memory. Their places say nothing about which comes first.',
      ko: '세 노드는 메모리에서 떨어져 있다. 놓인 자리만 봐서는 무엇이 먼저인지 알 수 없다.',
    },
    'caption.holdsAddress': {
      en: 'Beside its value every node holds one more thing — the address of the next node.',
      ko: '노드는 값 옆에 하나를 더 쥐고 있다 — 다음 노드의 주소다.',
    },
    'caption.orderExists': {
      en: 'Follow the held addresses and an order appears: 12, 5, 8 — not the order they lie in.',
      ko: '쥔 주소를 따라가면 순서가 드러난다 — 12, 5, 8. 메모리에 놓인 차례가 아니다.',
    },
    'label.order': { en: 'order', ko: '순서' },
    'label.note': {
      en: 'A node is {bytes} bytes here — {vb} for the int32 value, {ab} for the address.',
      ko: '여기서 노드 하나는 {bytes}바이트다 — int32 값 {vb} + 주소 {ab}.',
    },
    'label.note2': {
      en: 'The cells are drawn far wider than that; only the gaps keep the real byte ratio.',
      ko: '화면의 칸은 그보다 훨씬 넓다. 칸 사이 빈 자리만 실제 바이트 간격의 비를 지킨다.',
    },
  },
};
