/**
 * @piece 분할 — 더 쪼갤 수 없을 때까지 반으로 가른다.
 *
 * 답하는 질문 하나: **쪼개는 동안 무엇이 바뀌는가.**
 * 바뀌는 것은 묶음의 경계뿐이다. 값은 한 칸도 움직이지 않고, 좌우 순서는
 * 처음과 끝이 같으며, 견줌은 한 번도 일어나지 않는다. 그리고 낱개가 되면
 * 멈춘다 — 낱개 하나는 그 자체로 이미 줄이 서 있기 때문이다.
 *
 * header (title-block) 도 metrics 도 두지 않는다. 제목은 글의 문단이 주고,
 * 조각은 셀 것이 없다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const splitUntilOneFacet: FacetJson = {
  id: 'facet:splitUntilOne',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: { en: 'Splitting', ko: '분할' },
  description: {
    en: 'Halving a range over and over changes nothing but the group boundaries.',
    ko: '구간을 거듭 반으로 가르는 동안 바뀌는 것은 묶음의 경계뿐이다.',
  },
  algorithm: 'module:splitUntilOne',
  projector: 'module:splitUntilOneProjector',
  initialData: {
    type: 'split-until-one',
    values: [6, 2, 8, 4],
    /** 걸음 간격. 화면의 갈라짐 애니메이션이 이 위에 더해진다 (S-piece). */
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'split-until-one-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
  messages: {
    'caption.whole': {
      en: 'All {n} values sit in one group. Nothing has been compared.',
      ko: '값 {n}개가 한 묶음에 있다. 아직 아무것도 견주지 않았다.',
    },
    'caption.split': {
      en: 'The group is cut in half. No value moves — only a boundary.',
      ko: '묶음이 반으로 갈린다. 값은 움직이지 않고 경계만 생긴다.',
    },
    'caption.splitAgain': {
      en: 'Each half is cut again. The left-to-right order still holds.',
      ko: '갈라진 것이 또 갈라진다. 좌우 순서는 그대로다.',
    },
    'caption.leaves': {
      en: 'Each group holds one value — already in order, nothing left to cut.',
      ko: '모든 묶음이 낱개다. 낱개 하나는 이미 줄이 서 있으니 가를 것이 없다.',
    },
  },
};
