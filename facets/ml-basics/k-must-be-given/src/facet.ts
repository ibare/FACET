/**
 * 군집 수 선택 — 몇 무리인지 누가 정하는가.
 *
 * @piece 질문 하나에 답하고 멈추는 조각 (S-piece).
 *
 * 같은 점 열둘을 k=2 · 3 · 4 로 돌리면 답이 매번 다르고 매번 그럴듯하다.
 * 흩어짐 합은 k 가 커질수록 늘 줄어들어 잣대가 되어 주지 못하고, 이 자료에서는
 * 줄어드는 폭조차 꺾이지 않는다. 세 답을 한 화면에 남긴 채 끝난다.
 *
 * 점 열둘은 큰 덩이 둘이고 각 덩이 안에 작은 덩이가 둘씩이다. k=2 · 3 · 4 가
 * 다 말이 되도록 일부러 그렇게 놓았다 (전제는 글이 밝힌다).
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const kMustBeGivenFacet: FacetJson = {
  id: 'facet:kMustBeGiven',
  title: { en: 'k has to be given', ko: '군집 수는 주어져야 한다' },
  description: {
    en: 'The same twelve points split three different ways, and the scatter cannot choose between them.',
    ko: '같은 점 열둘이 세 갈래로 갈리는데, 흩어짐을 재도 그중 하나를 고르지 못한다.',
  },
  algorithm: 'module:kMustBeGiven',
  projector: 'module:kMustBeGivenProjector',
  initialData: {
    type: 'k-must-be-given',
    // 큰 덩이 둘, 각 덩이 안에 작은 덩이가 둘씩. 왼아래 · 오른아래 · 왼위 · 오른위.
    points: [
      [1.0, 1.0],
      [1.4, 1.6],
      [0.8, 1.8],
      [2.6, 1.2],
      [3.0, 1.8],
      [2.4, 2.0],
      [1.0, 6.0],
      [1.5, 6.6],
      [0.9, 6.8],
      [2.7, 6.2],
      [3.1, 6.7],
      [2.5, 7.0],
    ],
    ks: [2, 3, 4],
    stepMs: 900,
  },
  blocks: {
    stage: { type: 'k-must-be-given-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'label.membership': { en: 'group of each point', ko: '점마다의 무리' },
    'label.scatterSum': { en: 'scatter sum', ko: '흩어짐 합' },
    'caption.cloud': {
      en: 'Twelve points, one cloud. Nothing is cut yet.',
      ko: '점 열둘, 한 덩이. 아직 아무것도 자르지 않았다.',
    },
    'caption.chosen': {
      en: 'Pick starting centres, farthest first. k = {k}.',
      ko: '가장 먼 점부터 시작 중심을 고른다. k = {k}.',
    },
    'caption.split2': {
      en: 'It cuts top from bottom. Group sizes: {sizes}.',
      ko: '위아래로 갈렸다. 무리 크기: {sizes}.',
    },
    'caption.split3': {
      en: 'Run it again and the lower half cuts in two. Group sizes: {sizes}.',
      ko: '다시 돌리니 아래쪽이 둘로 갈렸다. 무리 크기: {sizes}.',
    },
    'caption.split4': {
      en: 'Again, into four — this cut is real too. Group sizes: {sizes}.',
      ko: '또 갈렸다. 이 나눔도 자료에 실제로 있다. 무리 크기: {sizes}.',
    },
    'caption.drops': {
      en: 'Measure how far the scatter fell: {d1}, then {d2}.',
      ko: '흩어짐이 얼마나 내려갔는지 잰다 — 앞이 {d1}, 뒤가 {d2}.',
    },
    'caption.noKink': {
      en: 'The later fall is the bigger one. There is no kink to pick.',
      ko: '뒤가 오히려 더 크다. 꺾이는 자리가 없으니 고를 데도 없다.',
    },
    'caption.allAlive': {
      en: 'All three cuts stand. How many groups is given, not found.',
      ko: '셋 다 그대로 남는다. 몇 무리인지는 찾는 것이 아니라 주는 것이다.',
    },
  },
};
