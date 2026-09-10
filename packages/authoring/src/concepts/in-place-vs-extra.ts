/**
 * inPlaceVsExtra 개념 선언.
 *
 * canonical facet 은 `facet:inPlaceVsExtra` — 같은 값 넷을 두 띠에 나란히 놓고
 * 함께 정렬하는 조각이다. 자리(슬롯)와 값(타일)을 갈라 그려, 값이 아무리 부산히
 * 움직여도 늘지 않는 넓이와 라운드마다 한 칸씩 자라는 넓이가 눈으로 견주어진다.
 * 띠 아래 게이지가 그 넓이를 다시 재고 칸 수를 적는다.
 *
 * ── 묶음 안에서 어디에 무게를 두었나
 *
 * 이 조각의 주어는 정렬 방법이 아니라 **보조 공간** 이다. 완제품 `mergeSort` 는
 * 절차와 비용을, `mergeTwoSorted` 는 합침의 셈을, `splitUntilOne` 은 쪼갬을
 * 맡았으므로, 여기서는 두 방식이 같은 답에 닿는다는 것을 전제로 두고 차지한
 * 넓이만 말한다. 화면의 두 방식은 주제가 아니라 넓이를 실어 나르는 수레다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const inPlaceVsExtraConcept: FacetConceptSource = {
  id: 'inPlaceVsExtra',
  label: 'In-Place or Borrowed Room',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:inPlaceVsExtra',

  surface: {
    definition:
      'Auxiliary space as a property of a sort: reaching the same order while holding one reusable slot, against claiming a fresh cell for every value written out.',
    exemplarKeywords: [
      'in-place sorting',
      'auxiliary space',
      'O(1) extra memory',
      'O(n) extra memory',
      'space complexity',
      'memory footprint of an algorithm',
      'temporary array',
      'sorting on a microcontroller',
      'out-of-place algorithm',
      'why merge sort needs a buffer',
    ],
  },

  briefing: {
    observable: [
      'Two lanes run the same four values at the same time, one above the other, and both begin at the same left edge with the same width.',
      'Slots and values are drawn apart — outlined slots are the room taken, tiles are the values resting on them — so a lane full of moving tiles does not read as a lane using more room.',
      'The upper lane takes one slot in the first round and never takes another, however many rounds follow; the lower lane gains one more slot every round.',
      'A gauge under each lane restates the borrowed width as a bar and prints the number of extra cells beside it.',
      'Both lanes finish in the same number of rounds with the values in the same order, and the closing caption sets the two counts against each other: one against four, one for every value.',
    ],

    screen: {
      affordances: [
        'Both lanes play to the end on their own and stop with the two gauges at their final widths.',
        'Two buttons: Replay, and one that takes the rounds one at a time, which is how the two lanes can be compared at the same round.',
        'The four values are fixed and shared by both lanes, so the widths are the only thing that differs between them.',
      ],
    },

    useWhen: [
      'The article states a space bound and the reader treats it as bookkeeping beside the running time. Watching one lane borrow until it is as wide as the input gives the bound a shape.',
      'The reader takes "in place" to mean no extra memory at all. The upper lane visibly takes one slot and keeps reusing it, which is what the constant in that bound refers to.',
      'The prose is choosing between two algorithms and the deciding factor is room rather than speed. Both lanes finish together here, so the only thing left to choose on is the width underneath.',
    ],

    avoidWhen: [
      'The subject is running time, comparison counts or asymptotic speed. Both lanes take the same rounds and nothing on screen is timed.',
      'The article is about memory the language runtime manages — allocation, garbage collection, the region a program allocates from, the call stack of a recursion.',
      'The point is how either of these sorts actually works. The two mechanisms carry the space question and neither is presented as the subject.',
      'The article means editing something in place — a file rewritten without a copy, a database row updated where it stands.',
    ],

    contrastWith: [
      {
        concept: 'mergeSort',
        note: 'The lane that borrows, at full size: combining two halves has to write the result somewhere, so the room grows with the input.',
      },
      {
        concept: 'insertionSort',
        note: 'The lane that does not borrow, at full size: one held value and a hole travelling left need the same single slot however long the array is.',
      },
      {
        concept: 'growAndCopy',
        note: 'Both are about room that has to be asked for, but one takes a second block because the first is full, and this takes one because the method cannot write over its own input.',
      },
      {
        concept: 'mergeTwoSorted',
        note: 'The step that makes the borrowing necessary — the combined output needs a place to be written that is not the two rows being read.',
      },
    ],
  },
};
