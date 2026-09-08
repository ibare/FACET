/**
 * @piece 계수 배치 — 값의 범위가 좁으면 세는 것만으로 자리가 정해지고, 견줌이 아예
 * 필요 없다는 것을 보이는 조각.
 *
 * 정렬을 "견주는 일" 과 동의어로 아는 독자에게, 견줌 횟수의 하한(n log n)이 여기에
 * 적용되지 않는 까닭을 화면으로 말한다. 그래서 이 조각의 화면에는 두 값을 나란히
 * 놓는 장면이 한 번도 없다.
 */

import { CONTROL } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const countThenPlaceFacet: FacetJson = {
  id: 'facet:countThenPlace',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: { en: 'Counting Sort Placement', ko: '계수 배치' },
  description: {
    en: 'Tallying each value fixes every slot in advance — no value is ever compared with another.',
    ko: '값마다 세어 두면 자리가 미리 정해진다 — 값끼리 견주는 일이 한 번도 없다.',
  },
  algorithm: 'module:countThenPlace',
  projector: 'module:countThenPlaceProjector',
  initialData: {
    type: 'count-then-place',
    values: [2, 0, 1, 2, 0, 2],
    range: 3,
    stepMs: 500,
  },
  blocks: {
    stage: { type: 'count-then-place-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.count': {
      en: 'Tally how many of each value there are',
      ko: '값마다 몇 개인지 눈금을 쌓는다',
    },
    'caption.settle': {
      en: 'The tallies harden into starting slot numbers',
      ko: '눈금 더미가 시작 자리 번호로 굳는다',
    },
    'caption.place': {
      en: 'Each value goes straight to its own number',
      ko: '값이 제 번호로 곧장 간다',
    },
    'caption.done': {
      en: 'Sorted without comparing a single pair',
      ko: '한 쌍도 견주지 않고 정렬이 끝났다',
    },
  },
};
