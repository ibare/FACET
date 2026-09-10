/**
 * insertIntoSortedPart 개념 선언.
 *
 * canonical facet 은 `facet:insertIntoSortedPart` — 칸 넷짜리 줄 위에서 새 값이
 * 뽑혀 허공에 들리고, 큰 값들이 뒤에서부터 오른쪽으로 비켜서며 빈자리가 왼쪽으로
 * 옮겨 오는 조각이다. 들린 값은 언제나 빈자리 바로 위에 머문다. 스스로 재생하고
 * 멈춘다.
 *
 * ── 묶음 안에서 어디에 무게를 두었나
 *
 * 완제품 `insertionSort` 가 일곱 걸음이 쌓여 만드는 성질을 말하므로, 이 조각은
 * **한 걸음 안에서 일어나는 일** 만 맡는다 — 자리가 저절로 벌어지지 않는다는 것,
 * 비켜섬이 뒤에서부터여야 값을 잃지 않는다는 것, 왼쪽이 이미 줄 서 있어 걸음이
 * 끝에 닿기 전에 멈춘다는 것. 자리 번호를 미리 아는 밀기(`shiftOnInsert`)와도
 * 여기서 갈린다 — 이쪽은 견줌이 자리를 찾아낸다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const insertIntoSortedPartConcept: FacetConceptSource = {
  id: 'insertIntoSortedPart',
  label: 'Placing a Value into the Ordered Part',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:insertIntoSortedPart',

  surface: {
    definition:
      'One inner step of growing a sorted prefix: the arriving value is lifted out and larger neighbours step right until the walk meets one that is not greater.',
    exemplarKeywords: [
      'the inner loop of insertion sort',
      'the hole walks left',
      'a value held out of the row',
      'walking back from the last value',
      'stopping early on a smaller value',
      'where does this value belong',
      'no temporary array needed',
      'the ordered part on the left',
      'comparing on the way to the position',
    ],
  },

  briefing: {
    observable: [
      'The row is four slots with three ordered values on the left; the arriving value starts in the last slot, is lifted out of the row and hangs above it.',
      'The slot it left becomes a dashed outline, and the hovering value tracks that outline so it is always directly above the slot it would drop into.',
      'Each larger value slides right into the empty outline, one at a time working from the back, which carries the outline one slot to the left.',
      'Every destination is a slot that was emptied a moment earlier, so no value is ever written over one that has not moved yet.',
      'The walk stops at a value that is not greater, short of the left end, and the caption says so; only then does the hovering value drop straight down.',
      'The closing caption separates the two counts — three comparisons against two step-asides — because the value that ended the walk was compared but did not move.',
    ],

    screen: {
      affordances: [
        'One placement plays through by itself and stops with the four values in order.',
        'Two buttons: Replay, and one that advances a step at a time, which is how the hole can be held part-way through its walk.',
        'The three ordered values and the arriving one are fixed, and the arriving value belongs in the middle, so the walk stops before the left end on every run.',
      ],
    },

    useWhen: [
      'The article says a value is placed into the ordered part and the reader pictures the row politely opening a gap. Here the gap is the slot that value itself vacated, carried left by the neighbours that move.',
      'The prose is about to justify writing the copy loop from the last element backwards, and the reason only lands once every destination has been seen to be a slot emptied one step earlier.',
      'The reader needs to see why an already ordered left side lets the walk stop early: one value that is not greater ends it, and everything further left goes unexamined.',
    ],

    avoidWhen: [
      'The position is given up front and only the room has to be made. Every step here is a comparison deciding where the value goes.',
      'The subject is a whole sort rather than one of its steps — how many passes there are, what the total costs, how the ordered part came to exist.',
      'The structure is a list, a tree or a hash table, where placing a value costs something other than pushing neighbours along.',
      'The article means inserting a row into a database, an element into a document, or a record into a log.',
    ],

    contrastWith: [
      {
        concept: 'insertionSort',
        note: 'The step and the sort it composes: repeating this over an ordered part that grows by one each time is the whole algorithm.',
      },
      {
        concept: 'shiftOnInsert',
        note: 'Both open a slot by pushing later values along, but there the index is given and the moving is all there is, while here each comparison is what discovers the index.',
      },
      {
        concept: 'bubbleAdjacentSwap',
        note: 'Two ways a value travels: swapping trades two values at once and leaves no gap, while lifting one out leaves a hole that walks to meet it.',
      },
      {
        concept: 'requiresSorted',
        note: 'The premise doing the work — because the left side is already ordered, meeting one value that is not greater settles every value beyond it.',
      },
    ],
  },
};
