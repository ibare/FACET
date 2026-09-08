/**
 * selectMinEachPass facet JSON 선언.
 *
 * @piece 한 질문에만 답한다 — "견줄 때마다 뭔가 움직이는가?"
 *
 * 답: 아니다. 훑는 동안 움직이는 것은 표식뿐이고, 값이 자리를 옮기는 것은
 * 한 바퀴가 끝난 뒤 딱 한 번이다. 견줌은 많고 이동은 적다.
 *
 * 제목도 메트릭도 두지 않는다. 제목은 글의 문단이 주고, 조각은 셀 것을
 * 패널로 두지 않는다 (S-piece).
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const selectMinEachPassFacet: FacetJson = {
  id: 'facet:selectMinEachPass',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: { en: 'Selecting the Minimum', ko: '최솟값 선택' },
  description: {
    en: 'While scanning, only a marker moves; the value itself moves once, after the pass is over',
    ko: '훑는 동안에는 표식만 움직이고, 값은 한 바퀴가 끝난 뒤에 한 번 옮겨진다',
  },
  algorithm: 'module:selectMinEachPass',
  projector: 'module:selectMinEachPassProjector',
  initialData: {
    type: 'select-min-each-pass',
    values: [7, 2, 9, 4],
    stepMs: 750,
  },
  blocks: {
    stage: { type: 'select-min-each-pass-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
  messages: {
    'caption.remember': {
      en: 'Remember the first cell as the smallest so far.',
      ko: '첫 자리를 지금까지 가장 작은 것으로 기억해 둔다.',
    },
    'caption.compare': {
      en: 'Is {value} smaller than {best}?',
      ko: '{value} 가 {best} 보다 작은가?',
    },
    'caption.keep': {
      en: 'No. The marker stays where it is.',
      ko: '아니다. 표식은 있던 자리에 그대로 있다.',
    },
    'caption.hop': {
      en: 'Yes. The marker hops over to {value}.',
      ko: '그렇다. 표식이 {value} 자리로 건너간다.',
    },
    'caption.scanEnd': {
      en: 'Scan over: {compares} comparisons, {hops} marker hop, and not one value has moved.',
      ko: '훑기 끝 — 견줌 {compares}번, 표식 이동 {hops}번, 값은 하나도 움직이지 않았다.',
    },
    'caption.move': {
      en: 'Only now does anything move: the marked value goes to the front.',
      ko: '이제야 하나가 움직인다 — 표식이 가리킨 값이 맨 앞으로 간다.',
    },
    'caption.done': {
      en: 'One pass: {compares} comparisons, {moves} value move.',
      ko: '한 바퀴에 견줌 {compares}번, 값 이동 {moves}번.',
    },
  },
};
