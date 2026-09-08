/**
 * open-addressing-probe facet 선언.
 *
 * @piece 조각(piece) facet — 한 주장만 말하고 멈춘다 (S-piece).
 *   질문: 자리가 차 있으면 열쇠는 어디에 앉는가?
 *   답:   사슬을 달지 않고 한 칸씩 옆으로 밀려가 빈 자리에 앉는다.
 *
 * hash 값은 Java String.hashCode 실측값이다. 자리는 알고리즘이
 * (h & 0x7FFFFFFF) % size 로 직접 구하므로 선언에 적힌 수는 hash 뿐이다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const openAddressingProbeFacet: FacetJson = {
  id: 'facet:openAddressingProbe',
  title: {
    en: 'Open addressing: probing for the next seat',
    ko: '개방 주소법 — 다음 자리를 본다',
  },
  description: {
    en: 'When a bucket is taken, the key walks sideways to the next one until it finds an empty seat.',
    ko: '자리가 차 있으면 열쇠는 한 칸씩 옆으로 밀려가 빈 자리를 찾는다.',
  },
  algorithm: 'module:openAddressingProbe',
  projector: 'module:openAddressingProbeProjector',
  initialData: {
    type: 'open-addressing-probe',
    size: 8,
    stepMs: 680,
    keys: [
      { key: 'apple', hash: 93029210 },
      { key: 'elder', hash: 96592394 },
      { key: 'mango', hash: 103662530 },
      { key: 'fig', hash: 101380 },
    ],
  },
  blocks: {
    stage: { type: 'open-addressing-probe-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'label.hashLine': {
      en: '{key} · hashCode {hash} · (h & 0x7FFFFFFF) % {size} = {home}',
      ko: '{key} · hashCode {hash} · (h & 0x7FFFFFFF) % {size} = {home}',
    },
    'caption.arrive': {
      en: '{key} belongs in slot {home}.',
      ko: '{key} — 제 자리는 {home} 번이다.',
    },
    'caption.probe': {
      en: 'Slot {from} is taken by {holder} — look one slot over.',
      ko: '{from} 번은 이미 차 있다 ({holder}) — 한 칸 옆 {to} 번을 본다.',
    },
    'caption.seat': {
      en: 'Slot {slot} is empty — {key} sits down here.',
      ko: '{key} — {slot} 번이 비어 있어 여기 앉는다.',
    },
    'caption.spill': {
      en: 'Slot {home} belongs to {key}, but {blocker} had already been pushed into it — so {key} slid on to {slot}.',
      ko: '{key} 의 자리는 {home} 번이다. 그런데 남의 충돌에 밀려온 {blocker} 가 거기 앉아 있어, 결국 {slot} 번까지 밀려간다.',
    },
    'caption.done': {
      en: 'No chains anywhere — every key found a seat inside the table itself.',
      ko: '사슬은 어디에도 없다 — 모든 열쇠가 표 안에서 자리를 찾았다.',
    },
  },
};
