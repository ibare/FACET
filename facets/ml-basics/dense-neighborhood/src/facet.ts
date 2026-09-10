/**
 * @piece 밀도 기반 군집 — 무리를 "가운데로부터의 거리" 말고 무엇으로 정할 수 있는가.
 *
 * 답 하나: **이웃의 이웃으로 번지는 것**으로 정할 수 있다. 가운데를 아예 두지
 * 않으므로 무리가 둥글 필요가 없다.
 *
 * 자료는 바깥 고리 열넷과 가운데 덩이 여섯이다. 좌표는 구조이므로 여기 두고,
 * 화면 좌표·거리·이웃 수는 전부 algorithm 과 stage 가 이 좌표에서 셈한다 (S-piece).
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const denseNeighborhoodFacet: FacetJson = {
  id: 'facet:denseNeighborhood',
  title: {
    en: 'A group is what the spreading reaches',
    ko: '번짐이 닿는 데까지가 한 무리',
  },
  description: {
    en: 'Neighbours of neighbours join the same group, so the group need not be round.',
    ko: '이웃의 이웃이 같은 무리가 된다. 그래서 무리가 둥글 필요가 없다.',
  },
  algorithm: 'module:denseNeighborhood',
  projector: 'module:denseNeighborhoodProjector',
  initialData: {
    type: 'dense-neighborhood',
    points: [
      { x: 7.2, y: 4.0 },
      { x: 6.88, y: 5.39 },
      { x: 6.0, y: 6.5 },
      { x: 4.71, y: 7.12 },
      { x: 3.29, y: 7.12 },
      { x: 2.0, y: 6.5 },
      { x: 1.12, y: 5.39 },
      { x: 0.8, y: 4.0 },
      { x: 1.12, y: 2.61 },
      { x: 2.0, y: 1.5 },
      { x: 3.29, y: 0.88 },
      { x: 4.71, y: 0.88 },
      { x: 6.0, y: 1.5 },
      { x: 6.88, y: 2.61 },
      { x: 4.0, y: 4.0 },
      { x: 4.5, y: 4.2 },
      { x: 3.6, y: 4.4 },
      { x: 4.2, y: 3.5 },
      { x: 3.5, y: 3.6 },
      { x: 4.6, y: 3.7 },
    ],
    eps: 1.6,
    minPts: 3,
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'dense-neighborhood-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.start': {
      en: 'Points on a plane, no group yet. Count: {n}.',
      ko: '평면 위의 점들. 아직 무리는 없다. 개수: {n}.',
    },
    'caption.ignite': {
      en: 'A spark here. Neighbours inside eps, itself included: {n}.',
      ko: '여기에 불씨를 놓는다. eps 안의 이웃은 자기를 넣어 {n}.',
    },
    'caption.reignite': {
      en: 'A new spark where the fire never reached. Neighbours inside eps: {n}.',
      ko: '불이 닿지 않은 곳에 새 불씨를 놓는다. eps 안의 이웃은 {n}.',
    },
    'caption.spread': {
      en: 'The fire jumps to the neighbours of neighbours. In the group: {total}.',
      ko: '이웃의 이웃으로 옮아붙는다. 무리에 든 것은 {total}.',
    },
    'caption.blocked': {
      en: 'Nothing more inside eps. Distance to the nearest point outside: {d}.',
      ko: 'eps 안에 더는 이웃이 없다. 무리 밖에서 가장 가까운 점까지의 거리는 {d}.',
    },
    'caption.done': {
      en: 'Groups the fire settled into: {k}. Sizes: {list}.',
      ko: '불이 앉은 무리의 수는 {k}. 크기: {list}.',
    },
    'label.pairDistance': {
      en: 'distance between the two points',
      ko: '두 점 사이의 거리',
    },
    'label.linked': { en: 'linked', ko: '이어진다' },
    'label.tooFar': { en: 'too far', ko: '너무 멀다' },
  },
};
