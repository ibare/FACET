/**
 * 잡음점 — 어디에도 안 붙는 것은 남긴다.
 *
 * @piece 질문 하나에 답하는 조각 (S-piece).
 *   답하는 질문: 어느 무리에도 속하지 않는 점은 어떻게 하는가.
 *
 * 밀도로 묶기는 "이 점은 어느 무리도 아니다" 라고 답할 수 있고, 가운데를 정하고
 * 가까운 쪽에 붙이기는 그 답을 할 수 없다. 같은 자료에 둘을 걸어 그 차이를
 * 보이는 것이 이 조각의 전부다.
 *
 * 선언에는 구조만 둔다 — 점 열여섯의 좌표와 두 방법의 손잡이(eps · minPts ·
 * 시작 중심). 그림에서의 자리, 이웃 수, 뻗은 거리는 전부 셈해서 나온다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const noiseLeftOutFacet: FacetJson = {
  id: 'facet:noiseLeftOut',
  title: { en: 'Noise points', ko: '잡음점' },
  description: {
    en: 'What a method does with a point that belongs to no group.',
    ko: '어느 무리에도 속하지 않는 점을 방법은 어떻게 다루는가.',
  },
  algorithm: 'module:noiseLeftOut',
  projector: 'module:noiseLeftOutProjector',

  initialData: {
    type: 'noise-left-out',
    points: [
      { x: 1.2, y: 1.0 },
      { x: 1.9, y: 1.3 },
      { x: 1.4, y: 1.9 },
      { x: 2.2, y: 2.0 },
      { x: 1.0, y: 2.4 },
      { x: 2.6, y: 1.4 },
      { x: 6.4, y: 5.2 },
      { x: 7.1, y: 5.6 },
      { x: 6.6, y: 6.1 },
      { x: 7.4, y: 6.3 },
      { x: 6.1, y: 6.5 },
      { x: 7.8, y: 5.4 },
      { x: 4.2, y: 3.4 },
      { x: 0.6, y: 6.8 },
      { x: 8.0, y: 1.2 },
      { x: 4.6, y: 6.9 },
    ],
    eps: 1.2,
    minPts: 3,
    seeds: [
      { x: 1.2, y: 1.0 },
      { x: 6.4, y: 5.2 },
    ],
    stepMs: 600,
  },

  blocks: {
    stage: { type: 'noise-left-out-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },

  messages: {
    'tab.density': { en: 'Group by density', ko: '밀도로 묶기' },
    'tab.nearest': { en: 'Attach to the nearer side', ko: '가까운 쪽에 붙이기' },

    'board.title': { en: 'Left out', ko: '남겨진 것' },
    'board.neighbors': { en: 'nbrs {n}', ko: '이웃 {n}' },
    'board.reach': { en: 'reach {d}', ko: '닿음 {d}' },

    'meter.note': {
      en: 'How far a group had to reach, measured against eps.',
      ko: '무리가 뻗어야 했던 거리를 eps 와 견준다.',
    },

    'caption.points': {
      en: 'Sixteen points, one dataset, two methods.',
      ko: '점 열여섯. 같은 자료에 두 방법을 건다.',
    },
    'caption.radius': {
      en: 'Count the neighbors inside the radius. The core threshold is {m}.',
      ko: '반지름 안의 이웃을 센다. 속이 되는 문턱: {m}.',
    },
    'caption.core': {
      en: 'Points dense enough to be cores: {n}.',
      ko: '속이 될 만큼 빽빽한 점: {n}.',
    },
    'caption.spread': {
      en: 'A group spreads from core to core.',
      ko: '무리가 속에서 속으로 번진다.',
    },
    'caption.halted': {
      en: 'The spread stops. Group sizes: {sizes}.',
      ko: '번짐이 멎었다. 무리의 크기: {sizes}.',
    },
    'caption.leftOut': {
      en: 'Nothing reached these. They stay where they are: {n}.',
      ko: '아무 번짐도 닿지 않았다. 그대로 남는다. 남은 것: {n}.',
    },
    'caption.nearest': {
      en: 'Same points. Now pick two centers and attach each to the nearer one.',
      ko: '같은 점들. 이번엔 가운데 둘을 정하고 가까운 쪽에 붙인다.',
    },
    'caption.centroids': {
      en: 'The two centers settle. Rounds taken: {r}.',
      ko: '가운데 둘이 자리를 잡는다. 걸음 수: {r}.',
    },
    'caption.claim': {
      en: 'It joined a group whose nearest member sits {d} away.',
      ko: '들어간 무리에서 가장 가까운 점까지의 거리: {d}.',
    },
    'caption.claimFar': {
      en: 'Far from every blob, yet it joins. Distance {d}, or {r} times eps.',
      ko: '어느 덩이에서도 멀다. 그런데도 들어간다. 거리: {d}. eps 의 배수: {r}.',
    },
    'caption.done': {
      en: 'Density left {a} out. The nearer side left {b} out.',
      ko: '밀도로 묶기가 남긴 것: {a}. 가까운 쪽에 붙이기가 남긴 것: {b}.',
    },
  },
};
