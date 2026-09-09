/**
 * @piece 한 길로 흘릴 수 있는 양은 가장 좁은 곳이 정한다.
 *
 * 질문 — "여유가 남은 길을 찾았다. 그러면 얼마를 흘리는가?"
 * 답 — 그 길에서 여유가 가장 적은 관만큼. 흘리고 나면 그 관이 꽉 차서 다음
 * 길은 그리로 지나지 못한다.
 *
 * 화면에 뜨는 수는 모두 알고리즘이 이 구조에서 셈한 것이다 (여유 · 흘린 양 ·
 * 도착 총량). 여기 선언하는 것은 관의 굵기뿐이다.
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const bottleneckSetsFlowFacet: FacetJson = {
  id: 'facet:bottleneckSetsFlow',
  title: {
    en: 'The narrowest pipe sets the amount',
    ko: '가장 좁은 곳이 흘릴 양을 정한다',
  },
  description: {
    en: 'How much a route can carry is decided by its narrowest pipe.',
    ko: '한 길로 흘릴 수 있는 양은 그 길에서 가장 좁은 관이 정한다.',
  },
  algorithm: 'module:bottleneckSetsFlow',
  projector: 'module:bottleneckSetsFlowProjector',
  initialData: {
    type: 'bottleneck-sets-flow',
    nodes: ['S', 'A', 'B', 'T'],
    edges: [
      { id: 'S-A', from: 'S', to: 'A', capacity: 3 },
      { id: 'S-B', from: 'S', to: 'B', capacity: 2 },
      { id: 'A-T', from: 'A', to: 'T', capacity: 2 },
      { id: 'B-T', from: 'B', to: 'T', capacity: 3 },
      { id: 'A-B', from: 'A', to: 'B', capacity: 1 },
    ],
    source: 'S',
    sink: 'T',
    stepMs: 900,
  },
  blocks: {
    stage: { type: 'bottleneck-sets-flow-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.pathFound': {
      en: 'Found a route that still has room: {route}',
      ko: '아직 여유가 남은 길을 찾았다 — {route}',
    },
    'caption.narrowest': {
      en: 'The narrowest pipe on this route has room for {amount} — that is all this route can take',
      ko: '이 길에서 가장 좁은 곳의 여유는 {amount} — 이 길로는 그만큼밖에 못 흘린다',
    },
    'caption.pushed': {
      en: 'Sent {amount} through. {total} has arrived so far',
      ko: '{amount} 만큼 흘렸다. 지금까지 도착한 양은 {total}',
    },
    'caption.noMoreRoom': {
      en: 'Every pipe leaving the source is full — there is no route left',
      ko: '들어오는 곳에서 나가는 관이 모두 꽉 찼다 — 갈 길이 없다',
    },
    'caption.done': {
      en: '{total} in total — nothing more can get through',
      ko: '모두 {total} 만큼 흘렸다 — 더는 지나갈 수 없다',
    },
    'label.room': { en: 'room {n}', ko: '여유 {n}' },
    'label.full': { en: 'full', ko: '꽉 참' },
    'label.arrived': { en: 'arrived {n}', ko: '도착 {n}' },
  },
};
