/**
 * dequeBothEnds — 양방향 큐 조각(piece) 선언.
 *
 * @piece 양끝이 모두 열려 있다. 문이 넷이 아니라 둘인데, 그 둘이 저마다 넣기와
 * 빼기를 겸한다 — 어느 끝에서든 넣고 어느 끝에서든 뺀다.
 *
 * 조각이므로 header 도 metrics 도 layout 도 두지 않는다 (S-piece).
 */

import { CONTROL } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const dequeBothEndsFacet: FacetJson = {
  id: 'facet:dequeBothEnds',
  title: { en: 'Open at both ends', ko: '양끝이 모두 열려 있다' },
  description: {
    en: 'A deque has two doors, not four — and each door both takes values in and lets them out.',
    ko: '양방향 큐의 문은 넷이 아니라 둘이고, 그 둘이 저마다 넣기와 빼기를 겸한다.',
  },
  algorithm: 'module:dequeBothEnds',
  projector: 'module:dequeBothEndsProjector',
  initialData: {
    type: 'dequeBothEnds',
    values: [4, 9],
    frontValue: 2,
    backValue: 6,
    capacity: 4,
    stepMs: 660,
  },
  blocks: {
    stage: { type: 'deque-both-ends-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.pushFront': {
      en: 'In through the front door',
      ko: 'front 문으로 들어간다',
    },
    'caption.pushBack': {
      en: 'In through the back door',
      ko: 'back 문으로 들어간다',
    },
    'caption.popFront': {
      en: 'Out through that same front door',
      ko: '들어갔던 그 front 문으로 나온다',
    },
    'caption.popBack': {
      en: 'Out through that same back door',
      ko: '들어갔던 그 back 문으로 나온다',
    },
    'caption.bothEnds': {
      en: 'Two doors, four operations — each end both takes in and gives out',
      ko: '문은 둘, 조작은 넷 — 두 끝이 저마다 넣기와 빼기를 겸한다',
    },
  },
};
