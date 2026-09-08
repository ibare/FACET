/**
 * @piece 제자리 정렬 — 가진 자리 안에서 끝내는가, 자리를 더 얻어 쓰는가.
 *
 * 답하는 질문 하나: **같은 값을 같은 순서로 만들면서 한쪽은 왜 자리를 빌리지
 * 않는가.** 견주고 옮기는 일은 두 방식이 똑같이 한다. 다른 것은 차지한 넓이뿐이고,
 * 그 차이가 알고리즘을 고르는 이유가 된다.
 *
 * 조각이므로 header 도 metrics 도 두지 않는다 (S-piece). 제목은 글의 문단이 주고,
 * 셀 것은 없다 — 넓이는 세는 것이 아니라 보이는 것이다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const inPlaceVsExtraFacet: FacetJson = {
  id: 'facet:inPlaceVsExtra',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: { en: 'In-Place Sorting', ko: '제자리 정렬' },
  description: {
    en: 'Two sorts reach the same order; only one of them asks for more room.',
    ko: '두 정렬이 같은 순서에 닿는다. 자리를 더 달라는 쪽은 하나뿐이다.',
  },
  algorithm: 'module:inPlaceVsExtra',
  projector: 'module:inPlaceVsExtraProjector',

  initialData: {
    type: 'in-place-vs-extra',
    // 값 넷을 두 벌 늘어놓고 나란히 정렬한다. 넷이면 빌린 넓이가 원본만큼
    // 자라는 것이 한 화면에 들어오고, 그보다 많으면 칸이 좁아진다.
    values: [8, 3, 5, 1],
    stepMs: 850,
  },

  blocks: {
    stage: { type: 'in-place-vs-extra-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },

  messages: {
    'caption.begin': {
      en: 'The same values, sorted two ways — one keeps to its own cells, the other copies them out.',
      ko: '같은 값을 두 방식으로 정렬한다 — 한쪽은 가진 칸 안에서, 다른 쪽은 새 자리에 옮겨 적으며.',
    },
    'caption.claim': {
      en: 'Each side takes the room it needs: one slot to hold a value, one cell to write the first result.',
      ko: '각자 필요한 자리를 얻는다 — 한쪽은 값을 잠깐 들고 있을 칸 하나, 다른 쪽은 첫 결과를 적을 칸 하나.',
    },
    'caption.reuseVsGrow': {
      en: 'The held slot is used again. Copying needs one more cell — {n} of them now.',
      ko: '들고 있던 자리는 그대로 다시 쓴다. 옮겨 적는 쪽은 칸이 또 하나 필요하다 — 이제 {n}칸.',
    },
    'caption.done': {
      en: 'Same order, different room: {a} extra cell against {b} — one for every value.',
      ko: '순서는 같고 넓이는 다르다 — 한쪽은 {a}칸, 다른 쪽은 값의 수만큼 {b}칸.',
    },

    'label.laneInPlace': { en: 'sorting in place', ko: '제자리에서 정렬' },
    'label.laneCopy': { en: 'copying into new space', ko: '새 자리에 옮겨 적기' },
    'label.extraCells': { en: '{n} extra', ko: '추가 {n}칸' },
  },
};
