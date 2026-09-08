/**
 * siftUp — 상향 재배치 조각(piece) 선언.
 *
 * @piece 넣고 위로 올라가며 자리 잡는다. 새 값이 맨 끝자리에 앉은 뒤 부모와
 * 견주기를 반복하며 오르지만, 꼭대기까지 가는 것이 아니라 **자기 자리를
 * 찾으면 멈추는** 것이 요점이다. 이 한 가지만 말하고 멈춘다.
 *
 * 제목 블록도 메트릭도 두지 않는다. 제목은 글의 문단이 주고, 조각은 셀 것이
 * 없다 (S-piece). layout 은 stage 와 controls 뿐이라 러너에 맡긴다.
 *
 * 데이터는 최소 힙 배열 [3,5,8,9,6,12,10] 에 7 을 넣는 시나리오다. 걸음은
 * algorithm.ts 가 이 배열을 실제로 시뮬레이션해 계산하며, 여기 적힌 것은
 * 시작 배열과 넣을 값뿐이다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const siftUpFacet: FacetJson = {
  id: 'facet:siftUp',
  title: { en: 'Sift Up', ko: '상향 재배치' },
  description: {
    en: 'Insert at the last slot, then climb until you find your place.',
    ko: '맨 끝자리에 넣고, 자기 자리를 찾을 때까지 오른다.',
  },
  algorithm: 'module:siftUp',
  projector: 'module:siftUpProjector',
  initialData: {
    type: 'sift-up',
    values: [3, 5, 8, 9, 6, 12, 10],
    insertValue: 7,
    stepMs: 700,
  },
  shuffleOnReset: false,
  messages: {
    'caption.insert': {
      en: 'The new value {value} takes the last open slot.',
      ko: '새 값 {value} 이 맨 끝자리에 앉는다.',
    },
    'caption.compareSwap': {
      en: '{child} comes before its parent {parent} — they swap places.',
      ko: '{child} 이 부모 {parent} 보다 앞선다 — 자리를 맞바꾼다.',
    },
    'caption.compareStop': {
      en: '{child} does not come before its parent {parent} — it stops here.',
      ko: '{child} 이 부모 {parent} 보다 앞서지 못한다 — 여기서 멈춘다.',
    },
    'caption.settle': {
      en: 'This is its place.',
      ko: '여기가 자기 자리다.',
    },
  },
  blocks: {
    stage: { type: 'sift-up-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
