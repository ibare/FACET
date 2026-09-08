/**
 * indexAddressCalc — 번호로 자리를 셈한다.
 *
 * @piece 한 질문에만 답한다: "번호로 자리를 어떻게 셈하는가."
 *
 * 답은 곱셈 한 번과 덧셈 한 번이다. 칸을 훑지 않으므로 번호가 멀어도 셈은
 * 길어지지 않는다 — 그래서 두 번째 번호를 한 번 더 넣어 같은 길이를 보인다.
 * 제목은 이 조각이 놓일 문단이 준다 (title-block 없음). 셀 것이 없으므로
 * metrics 도 없다 (S-piece).
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const indexAddressCalcFacet: FacetJson = {
  id: 'facet:indexAddressCalc',
  title: { en: 'Index to address', ko: '번호에서 주소로' },
  description: {
    en: 'One multiply and one add turn an index into an address.',
    ko: '번호는 곱셈 한 번과 덧셈 한 번을 거쳐 주소가 된다.',
  },
  algorithm: 'module:indexAddressCalc',
  projector: 'module:indexAddressCalcProjector',
  initialData: {
    type: 'index-address-calc',
    /** 0x1000 — 배열이 할당된 자리. 재지 않고 선언한 값이며 각주가 그렇게 밝힌다. */
    base: 4096,
    /** int32 이므로 4바이트. 크기는 자료형이 정한다. */
    unit: 4,
    values: [42, 7, 13, 99, 5, 61],
    /** 0x1000 + 3 × 4 = 0x100C → 99. */
    probeA: 3,
    /** 0x1000 + 5 × 4 = 0x1014 → 61. 멀어도 셈은 그대로 한 번이다. */
    probeB: 5,
    stepMs: 520,
  },
  layout: {
    type: 'column',
    gap: 4,
    children: [{ ref: 'stage' }, { ref: 'controls' }],
  },
  blocks: {
    stage: { type: 'address-calc-stage' },
    controls: { type: 'control-bar', controls: [CONTROL.replay, CONTROL.advance] },
  },
  messages: {
    'caption.memory': {
      en: 'The array sits in memory: {unit} bytes per slot from {base}.',
      ko: '배열은 {base} 부터 {unit} 바이트씩 이어 놓인다.',
    },
    'caption.ask': {
      en: 'Where is arr[{index}]?',
      ko: 'arr[{index}] 은 어디에 있나.',
    },
    'caption.scale': {
      en: 'Index times element size: {index} × {unit} = {offset}.',
      ko: '번호 × 원소 크기: {index} × {unit} = {offset}.',
    },
    'caption.add': {
      en: 'Add the base address: {base} + {offset} = {addr}.',
      ko: '기준 주소를 더한다: {base} + {offset} = {addr}.',
    },
    'caption.reach': {
      en: 'One multiply, one add: {addr} holds arr[{index}] = {value}.',
      ko: '곱셈 한 번, 덧셈 한 번 — {addr} 에 arr[{index}] = {value}.',
    },
    'caption.done': {
      en: 'Any index, the same one calculation. Nothing in between is read.',
      ko: '어느 번호를 넣어도 셈은 똑같이 한 번. 사이의 칸은 읽지 않는다.',
    },
  },
};
