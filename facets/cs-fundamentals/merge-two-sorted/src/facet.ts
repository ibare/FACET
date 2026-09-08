/**
 * @piece 정렬된 두 줄을 합칠 때 다시 정렬하는가?
 *
 * 하지 않는다 — 양쪽이 이미 줄 서 있으므로 맨 앞 둘만 견주면 다음에 올 것이
 * 확정된다. 이긴 쪽이 아래 결과줄로 내려가고, 뒤쪽은 한 번도 읽히지 않는다.
 *
 * header 도 metrics 도 layout 도 두지 않는다. 제목은 글의 문단이 주고, 셀 것은
 * 없으며, 배치는 stage 와 controls 뿐이라 러너가 정한다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const mergeTwoSortedFacet: FacetJson = {
  id: 'facet:mergeTwoSorted',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: { en: 'Merging', ko: '병합' },
  description: {
    en: 'Two ordered rows become one — by looking only at the two fronts.',
    ko: '줄 선 둘이 하나가 된다 — 맨 앞 둘만 보고서.',
  },
  algorithm: 'module:mergeTwoSorted',
  projector: 'module:mergeTwoSortedProjector',
  initialData: {
    type: 'merge-two-sorted',
    left: [1, 4, 7],
    right: [2, 3, 9],
    // 걸음 간격. 무대의 이동 애니메이션이 이 위에 더해진다 (S-piece).
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'merge-two-sorted-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.premise': {
      en: 'Both rows are already in order.',
      ko: '두 줄 모두 이미 정렬돼 있다.',
    },
    'caption.compare': {
      en: 'Only the fronts are compared: {left} vs {right}',
      ko: '맨 앞끼리만 견준다 — {left} 대 {right}',
    },
    'caption.take': {
      en: 'The smaller front is {value} — down it goes',
      ko: '더 작은 쪽은 {value} — 아래로 내려간다',
    },
    'caption.drain': {
      en: 'Nothing left to compare — the rest just follows down',
      ko: '견줄 상대가 없다 — 남은 것은 그대로 따라 내려간다',
    },
    'caption.done': {
      en: 'One pass, {comparisons} comparisons, and nothing was re-sorted',
      ko: '한 번 훑어 끝났다 — 견줌 {comparisons}회, 다시 정렬한 적 없다',
    },
  },
};
