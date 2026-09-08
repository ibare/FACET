/**
 * circular-buffer-wrap facet JSON.
 *
 * @piece 끝에 닿으면 앞으로 돌아온다 — 마지막 칸 다음이 첫 칸이다. 칸은 늘어나지
 * 않고 자리만 다시 쓴다.
 *
 * 조각이므로 header / metrics / layout 을 두지 않는다. 배치는 러너가
 * `column · gap 8 · blocks 키 순서` 로 만든다 (S-piece).
 */

import { CONTROL } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const circularBufferWrapFacet: FacetJson = {
  id: 'facet:circularBufferWrap',
  title: { en: 'Circular buffer: coming back around', ko: '원형 버퍼: 되돌아오기' },
  description: {
    en: 'The last slot is followed by the first one. Slots are reused, never added.',
    ko: '마지막 칸 다음은 첫 칸이다. 칸은 늘어나지 않고 자리만 다시 쓴다.',
  },
  algorithm: 'module:circularBufferWrap',
  projector: 'module:circularBufferWrapProjector',

  initialData: {
    type: 'circular-buffer-wrap',
    // 칸 다섯 중 둘이 차 있고, tail 은 이미 한 바퀴 감겨 0 번 칸을 가리킨다.
    slots: [null, null, null, 8, 2],
    head: 3,
    tail: 0,
    // 이 차례로 넣는다. 자리와 감김 여부는 알고리즘이 (i + 1) % 칸수 로 셈한다.
    incoming: [5, 9],
    stepMs: 700,
  },

  blocks: {
    stage: { type: 'circular-buffer-wrap-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },

  messages: {
    'caption.start': {
      en: '{count} slots. head reads at {head}, tail writes at {tail}.',
      ko: '칸은 {count}개. head 는 {head}번 칸에서 빼고, tail 은 {tail}번 칸에 넣는다.',
    },
    'caption.put': {
      en: '{value} is written into slot {slot}; tail moves on to {to}.',
      ko: '{value} → {slot}번 칸. 다음 tail 은 {to}번 칸.',
    },
    'caption.take': {
      en: 'Slot {slot} gives up {value}; head moves on to {to}.',
      ko: '{slot}번 칸 → {value} 나감. 다음 head 는 {to}번 칸.',
    },
    'caption.takeWrap': {
      en: 'Slot {slot} was the last one, so head comes back around to {to}.',
      ko: '{slot}번 칸이 마지막이라 head 는 다시 {to}번 칸으로 돌아온다.',
    },
    'caption.done': {
      en: 'Still {count} slots — nothing grew.',
      ko: '연산 넷을 거쳐도 칸은 {count}개 그대로다. 늘어난 자리는 없다.',
    },
  },
};
