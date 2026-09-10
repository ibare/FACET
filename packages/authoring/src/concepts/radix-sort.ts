/**
 * radixSort 개념 선언.
 *
 * canonical facet 은 `facet:radixSort` — 여덟 값을 놓고 한 자리 줄 세우기의
 * **안쪽 절차**를 네 층(보는 자리 · arr · count · output)으로 그리는 완결형이다.
 * 통이 개수에서 자리 번호로 뜻이 바뀌는 대목, 뒤에서부터 놓는 방향, 그리고
 * 여섯 언어로 펼쳐지는 코드 패널이 이 화면의 산출물이다.
 *
 * 묶음 안에서의 자리 — 조각 `digitByDigit` 은 "한 자리씩만 봤는데 왜 전체가
 * 서는가" 라는 **근거**를 말하고 멈춘다. 이 완결형은 그 한 라운드가 실제로
 * 어떻게 굴러가는가 — 세고 · 누적하고 · 놓는 절차와 그 값 — 을 말한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const radixSortConcept: FacetConceptSource = {
  id: 'radixSort',
  label: 'Radix Sort (Least Significant Digit First)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:radixSort',

  surface: {
    definition:
      'A non-comparison integer sort that repeats a counting pass over one digit position, turning bucket counts into prefix sums that give each value its seat directly.',
    exemplarKeywords: [
      'radix sort',
      'LSD radix sort',
      'counting sort by digit',
      'prefix sum',
      'cumulative counts',
      'bucket index becomes a position',
      'linear time sorting',
      'beating the n log n bound',
      'sorting integers',
      'sorting fixed-width keys',
      'integer division and modulo',
      'base 10 buckets',
    ],
  },

  briefing: {
    observable: [
      'The screen is four rows read top to bottom: the place being read, the eight values each with its current digit in a small box beneath it, the ten bucket cells, and the output row being filled.',
      'The bucket row changes meaning halfway through a round — while counting, a cell holds how many values carry that digit; after the cumulative pass the same cell holds a seat number.',
      'Placing runs from the back of the array towards the front, and each placement draws a line from a bucket to an output cell, so the decremented count and the destination seat are visibly the same number.',
      'Rounds and Placements climb through the run while the Compare counter stays at 0 from start to finish — it is on screen the whole time and never moves.',
      'Three rounds happen because the largest value has three digits, and the place chips for finished rounds fade instead of leaving the screen.',
      'The values used include a three-digit and a one-digit number whose tens digits are both zero, so one round visibly leaves their order alone.',
      'The code panel highlights the line matching the running phase — scanning for the largest value, picking the place, reading a digit, counting it, the cumulative pass, placing from the back, and closing the round.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider. One step is one phase, which is how the bucket row can be read after the cumulative pass and before any value moves.',
        'The code panel starts empty with an "+ Add language" button offering Python, JavaScript, TypeScript, Java, C++ and C#; two can sit side by side.',
        'The input is fixed at eight values of one to three digits, so the round and placement totals are stable enough for the article to quote.',
        'The way to show that one written line is not one language-independent operation is to add two languages and read the digit extraction line in both — integer division is where they part.',
      ],
    },

    useWhen: [
      'The prose asserts that sorting can go below the comparison bound and the reader has no reason to believe it. A comparison counter sitting at zero while the row nonetheless comes out ordered is the evidence.',
      'The article needs the cumulative pass to be more than an arithmetic trick. The moment the counts stop being quantities and become seat numbers is a single visible step, and the line drawn from a bucket to a cell is that claim carried out.',
      'The reader assumes the buckets must physically hold the values. Here only counts are kept and the destination is computed, which is what keeps the extra space to one spare row and ten cells.',
      'The article compares how the same algorithm is written across languages and needs a case where the difference is semantic rather than cosmetic.',
    ],

    avoidWhen: [
      'The keys are not integers or fixed-width strings — floating point values, arbitrary objects, or anything ordered by a comparator the caller supplies.',
      'The subject is comparison-based sorting: pivots, merges, or the n log n lower bound argued as a proof. Nothing here compares two values, so it cannot stand in for a comparison argument.',
      'The article uses "radix" for number base conversion, or for radix trees and prefix trees.',
      'The point is the memory cost of sorting or sorting in place. This keeps a second row and a bucket row alongside the input.',
    ],

    contrastWith: [
      {
        concept: 'digitByDigit',
        note: 'That one argues why the passes accumulate into a total order; this one runs the machinery inside a single pass, where the counts become positions.',
      },
      {
        concept: 'countingSort',
        note: 'One pass here is a counting sort keyed on a digit rather than on the value itself, which is what keeps the bucket count at ten however large the numbers are.',
      },
      {
        concept: 'sortStability',
        note: 'Stability is a desirable property in most sorts and a precondition in this one — placing from the back is not a style choice but the reason the earlier rounds survive.',
      },
      {
        concept: 'mergeSort',
        note: 'Both reach an ordered array without a quadratic scan, but one buys it by dividing and comparing and the other by refusing to compare at all and paying in assumptions about the keys.',
      },
    ],
  },
};
