/**
 * beladyAnomaly 개념 선언.
 *
 * canonical facet 은 `facet:beladyAnomaly` — 같은 참조 열둘(1 2 3 4 1 2 5 1 2 3 4 5)을 FIFO 프레임 셋인 쪽과 넷인 쪽에
 * 같은 걸음으로 흘린다. 넷 쪽이 t5 · t6 에 적중해 둘 앞섰다가, t8 · t9 에 셋 쪽이 적중하는 자리에서 폴트를 내며 따라
 * 잡히고, 마지막 t12 에 앞지른다 — 셋 쪽 9, 넷 쪽 10. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `pageReplacement`(완제품)는 정책이 "프레임을 늘리면 좋아진다" 의 참거짓을 정한다는 것 — FIFO · LRU · Clock 을 프레임
 * 1~5 에 걸쳐 — 을 쥔다. 이쪽은 **FIFO 하나, 두 크기의 경주** — 큰 쪽이 앞섰다가 따라잡히고 앞질리는 흐름 — 이다.
 * 형제 `evictOldest` 는 한 크기에서 쓰임을 무시하는 것. definition 은 same references run side by side · leads early ·
 * caught · ends with more faults 를 독점하고, policy decides · LRU never · Clock 을 쓰지 않는다.
 *
 * 전제: 참조 열과 프레임 수는 역설을 보이려고 정한 값(벨레이디의 열). 빈 프레임은 번호 낮은 것부터, 내보낸 자리에
 * 새 페이지, 적중은 들어온 차례를 바꾸지 않는다. 프레임 수를 바꾸는 손잡이는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const beladyAnomalyConcept: FacetConceptSource = {
  id: 'beladyAnomaly',
  label: 'Bélády\'s Anomaly (Four Frames Fault More Than Three)',
  canonicalFacet: 'facet:beladyAnomaly',

  surface: {
    definition:
      'Under FIFO eviction the same twelve references run side by side on three frames and on four: the four-frame side leads early, is caught when it misses pages the smaller side still holds, and ends with more faults.',
    exemplarKeywords: [
      'Belady\'s anomaly',
      'Belady anomaly FIFO',
      'more frames more page faults',
      'reference string 1 2 3 4 1 2 5 1 2 3 4 5',
      'FIFO anomaly',
      'page faults increase with memory',
      'counterintuitive page replacement',
      'why FIFO is not a stack algorithm',
    ],
  },

  briefing: {
    observable: [
      'A "References" row holds 1 2 3 4 1 2 5 1 2 3 4 5; under each, once processed, the result on each side — a filled square for a fault, a hollow circle for a hit. The start reads "Same references go to both sides. Both start empty."',
      'Below, a "3-frame side" and a "4-frame side", each with its frames, a "next out" marker on the page that entered first, and a "Faults" count. A race line carries a marker per side, and a dashed line joins the two markers — tilting back when the four-frame side has fewer faults, forward when it has more.',
      'The first four references fault on both sides. At the fifth and sixth (1, 2) the 3-frame side faults and the 4-frame side hits: "Fewer faults on the 4-frame side. Gap: 2."',
      'The seventh reference, 5, makes the 4-frame side evict 1. At the eighth and ninth (1, 2) the 3-frame side hits and the 4-frame side faults: "The 4-frame side catches up. Faults on each: 7."',
      'At the last reference, 5, the 3-frame side still holds it and the 4-frame side has just evicted it: "The 4-frame side overtakes — more faults than the 3-frame side. Gap: 1." Final counts: 9 and 10.',
      'Cumulative faults per step (3 | 4): 1|1, 2|2, 3|3, 4|4, 5|4, 6|4, 7|5, 7|6, 7|7, 8|8, 9|9, 9|10. The reference string and frame counts are chosen to show the anomaly; both sides use first-in-first-out, and hits do not change arrival order.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one reference per step with both sides moving together, and stops after the twelfth reference — thirteen steps including the start.',
        'A Replay button and a playback strip sit below it. Stopping at steps 6, 9 and 12 captures the three moments: four frames ahead by 2, level at 7, behind by 1.',
        'There is no control for the number of frames; the two sizes are fixed so the comparison is always on screen.',
      ],
    },

    useWhen: [
      'The article states Bélády\'s anomaly and needs the reader to watch it happen on the classic reference string, not just read the two totals.',
      'A reader asks how adding memory could possibly cause more faults, and the article needs the exact references where the larger side misses pages the smaller side still has.',
    ],

    avoidWhen: [
      'The article compares several replacement policies, or asks which ones are immune. Only first-in-first-out runs here.',
      'The subject is thrashing or a general shortage of frames. The claim here is only about what adding one frame does.',
      'The point is caches in general getting worse with size for other reasons. This is one specific eviction order on one string.',
    ],

    contrastWith: [
      {
        concept: 'pageReplacement',
        note: 'The anomaly belongs to first-in-first-out on particular strings. Whether other rules share it is a comparative question: least-recently-used never does, while the clock can.',
      },
      {
        concept: 'evictOldest',
        note: 'Evicting by arrival alone, blind to use, is the rule at one memory size. The anomaly is what that blindness does when the size changes: a different eviction sequence that happens to miss more.',
      },
      {
        concept: 'thrashing',
        note: 'Both produce more faults than expected. Thrashing comes from too few frames for the pages in use; the anomaly comes from adding a frame, not from any shortage.',
      },
    ],
  },
};
