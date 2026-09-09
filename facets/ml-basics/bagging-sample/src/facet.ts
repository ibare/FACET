/**
 * @piece 배깅(부트스트랩 표본) — 뽑고 되돌린다.
 *
 * 자료가 한 벌뿐인데 서로 다른 나무를 어떻게 여럿 기르는가. 답은 되돌리는
 * 동작에 있다: 뽑은 것을 도로 넣으므로 같은 것이 두 번 세 번 뽑히고, 그 바람에
 * 한 번도 안 뽑히는 것이 생긴다. 그 남겨진 것이 벌마다 다르다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const baggingSampleFacet: FacetJson = {
  id: 'facet:baggingSample',
  title: {
    en: 'Bagging',
    ko: '배깅',
  },
  description: {
    en: 'Draw with replacement, and every bag learns from something different.',
    ko: '뽑고 되돌리며 다르게 배운다.',
  },
  algorithm: 'module:baggingSample',
  projector: 'module:baggingSampleProjector',
  initialData: {
    type: 'bagging-sample',
    pool: [1, 2, 3, 4, 5, 6, 7, 8],
    sets: [
      [3, 1, 7, 7, 2, 5, 1, 8],
      [2, 6, 6, 4, 1, 3, 6, 2],
      [5, 8, 4, 5, 2, 8, 3, 4],
    ],
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'bagging-sample-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'label.pool': { en: 'Data', ko: '원본' },
    'label.leftOut': { en: 'Left out', ko: '남은 것' },
    'caption.setBegin': {
      en: 'Bag {set}: draw one and put it back, {k} times.',
      ko: '벌 {set}: 하나 뽑아 도로 넣기를 {k} 번 되풀이한다.',
    },
    'caption.draw': {
      en: 'Drawn, copied into the bag, then put back: {value}',
      ko: '뽑아서 벌에 베끼고, 도로 넣는다: {value}',
    },
    'caption.drawAgain': {
      en: 'Put back, so out it comes again: {value}',
      ko: '도로 넣었으니 또 나온다: {value}',
    },
    'caption.leftOut': {
      en: 'What never came out stays behind: {values}',
      ko: '한 번도 안 나온 것이 남는다: {values}',
    },
    'caption.done': {
      en: 'Every bag leaves out something different. The chance of never being drawn is {theory}%.',
      ko: '벌마다 남는 것이 다르다. 하나가 끝까지 안 뽑힐 확률은 {theory}%.',
    },
  },
};
