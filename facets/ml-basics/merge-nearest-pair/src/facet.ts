/**
 * mergeNearestPair — 병합 군집화. 가장 가까운 둘을 합쳐 올라간다.
 *
 * 무리 수를 미리 정하지 않는다. 저 혼자 한 무리인 채로 시작해 가장 가까운 둘을
 * 합치고, 합친 자리를 그 거리만큼의 높이에 걸어 둔다. 하나가 남을 때까지.
 * 그래서 올라간 높이가 곧 "얼마나 먼 것들을 합쳤는가" 다. 이 조각이 말하는 것은
 * 나무를 짓는 데까지이고, 그 나무를 어디서 자를지는 다른 조각의 몫이다.
 *
 * 선언에 두는 것은 점과 걸음 간격뿐이다. 자리·축척·자의 눈금은 stage 가
 * 캔버스에서 역산한다 (S-piece).
 *
 * @piece
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const mergeNearestPairFacet: FacetJson = {
  id: 'facet:mergeNearestPair',
  title: {
    en: 'Can you cluster without fixing the number first',
    ko: '무리 수를 미리 정하지 않고도 무리를 만들 수 있는가',
  },
  description: {
    en: 'Merge the closest two and hang the joint at the height of that gap. The tree that grows out of it says how far apart everything was.',
    ko: '가장 가까운 둘을 합쳐 그 거리만큼의 높이에 걸어 둔다. 그렇게 자란 나무의 높이가 곧 얼마나 먼 것들을 합쳤는가를 말한다.',
  },
  algorithm: 'module:mergeNearestPair',
  projector: 'module:mergeNearestPairProjector',
  initialData: {
    type: 'merge-nearest-pair',
    // 세 무리와 외톨이 하나. h 가 끝에서 두 번째에야 붙는 것이 이 배치의 요점이다.
    points: [
      { id: 'a', x: 1.0, y: 1.0 },
      { id: 'b', x: 1.55, y: 1.2 },
      { id: 'c', x: 2.4, y: 1.7 },
      { id: 'd', x: 5.2, y: 1.0 },
      { id: 'e', x: 5.9, y: 1.5 },
      { id: 'f', x: 3.0, y: 5.4 },
      { id: 'g', x: 3.8, y: 5.9 },
      { id: 'h', x: 7.5, y: 6.2 },
    ],
    stepMs: 850,
  },
  blocks: {
    stage: { type: 'merge-nearest-pair-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'label.axis': {
      en: 'height = distance',
      ko: '높이 = 거리',
    },
    'label.remaining': {
      en: 'clusters left',
      ko: '남은 무리',
    },
    'caption.start': {
      en: 'Eight points, and each is a cluster of its own.',
      ko: '점 여덟, 저마다 한 무리다.',
    },
    'caption.merge': {
      en: 'The nearest two join, and the joint hangs at the height of that gap. Height: {d}',
      ko: '가장 가까운 둘을 합쳐 그 사이만큼 올려 건다. 걸린 높이: {d}',
    },
    'caption.done': {
      en: 'Four bars huddle low, three leap high — the height is how far apart they were.',
      ko: '넷은 바닥에 몰리고 셋은 훌쩍 뛴다. 높이가 곧 얼마나 먼 것들을 합쳤는가다.',
    },
  },
};
