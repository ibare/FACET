/**
 * shellSort 개념 선언.
 *
 * canonical facet 은 `facet:shellSort` — 값 일곱을 간격 3 → 1 두 라운드로
 * 정렬하면서 간격 자 · 사슬 표시 · 구멍과 집은 값을 함께 그리고, 견줌 · 이동 ·
 * 간격 라운드 세 카운터와 `ir:shellsort-gap` 코드 패널을 갖춘 완결형이다.
 *
 * ── 묶음 안에서의 자리 (조각 `gapShrink` 와 어떻게 갈랐는가)
 *
 * 조각은 **주장 하나** 를 진다 — 멀리부터 견주면 마지막 이웃 라운드가 할 일이
 * 준다. 완제품은 **알고리즘의 정체** 를 진다 — 이름 · 간격 수열 · 사슬 분해,
 * 그리고 코드가 삽입 정렬에서 `1` 을 `gap` 으로 바꾼 것뿐이라는 사실.
 * exemplarKeywords 도 그렇게 갈랐다: 여기에는 알고리즘의 이름과 부속(shell
 * sort · gap sequence · diminishing increment)만 두고, 조각에는 이름을 하나도
 * 두지 않고 "왜 멀리부터 견주는가" 쪽 구어만 둔다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const shellSortConcept: FacetConceptSource = {
  id: 'shellSort',
  label: 'Shell Sort',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:shellSort',

  surface: {
    definition:
      'Insertion sort run repeatedly with a shrinking stride, each round ordering the elements that stand a fixed number of seats apart, until the final round with stride one finishes the job.',
    exemplarKeywords: [
      'shell sort',
      'Shellsort',
      'diminishing increment sort',
      'gap sequence',
      'halving the gap',
      'insertion sort with a stride',
      'in-place sorting algorithm',
      'gap 3 then gap 1',
      'Knuth sequence',
      'comparison sort without extra memory',
    ],
  },

  briefing: {
    observable: [
      'A ruler is drawn at its true length from the centre of seat 0 to the centre of the seat one stride away, so when the stride folds from three to one the ruler visibly shortens.',
      'The seats a stride apart are tied together by coloured bands and arcs beneath the row, and the round with stride three shows three such groups that never touch each other; only the group currently being ordered stays dark.',
      'Lifting a value leaves its seat as an empty hole, and each time a larger value steps aside the hole travels left by a whole stride rather than by one seat.',
      'The held value rides above the hole until a seat is free and then drops into it; when nothing had to move, the caption says so instead of leaving the reader to notice the absence.',
      'Two rows underneath carry shift counts: the run that came through the wide round, and the same input taken with stride one from the beginning. Both numbers are counted by the run itself.',
      'Comparisons come out the same on both rows while shifts do not, so the saving is visibly in the moving rather than in the looking.',
      'Three counters run in the control bar — comparisons, shifts and how many stride rounds have happened.',
      'The code panel starts empty with an Add language button; once a language is picked, the line matching the current step is highlighted, and the inner loop is insertion sort with the constant one replaced by the stride in the two places it appears.',
      'The seven values are fixed and are not reshuffled on reset, so the same three groups form every time.',
    ],

    screen: {
      affordances: [
        'Playback controls — play, single step, pause, reset and a speed setting.',
        'It runs on its own from mount; stepping is how to stop between a comparison and the shift it causes, which is where the stride is visible in the movement.',
        'The way to see the claim rather than read it is to let the run finish and compare the two shift totals at the bottom.',
      ],
    },

    useWhen: [
      'The reader has been told this is "insertion sort with a gap" and cannot see where the second algorithm went. Reading the code with the stride set to one recovers insertion sort character for character, which is the point being made.',
      'The article treats a round with a wide stride as a separate pass over the array, when what it actually does is order several interleaved chains independently — the bands and arcs are what make those chains objects rather than a description.',
      'A cost claim is on the table and needs a number: the same input taken both ways, with the two shift totals standing side by side, is what settles whether the early wide rounds paid for themselves.',
    ],

    avoidWhen: [
      'The subject is which gap sequence to use, or the analysis of their running times. The sequence here is the simplest one, halving from the array length, and no alternative is shown.',
      'The article is about a shell in the operating-system sense, or about shell scripting. The word matches and nothing else does.',
      'The point is stability of a sort. Values a stride apart trade places directly here, and nothing on screen speaks to the order of equal keys.',
      'The subject is a merge- or partition-based sort, or sorting data too large for memory. Everything happens in one row of seats.',
      'The article needs a large input to make its point about growth. Seven values are on screen and the difference between the two totals is a handful of moves.',
    ],

    contrastWith: [
      {
        concept: 'gapShrink',
        note: 'The single claim that early wide comparisons repay themselves, against the whole algorithm that claim belongs to — its gap sequence, its chains, and the code it shares with insertion sort.',
      },
      {
        concept: 'insertionSort',
        note: 'The same inner loop with one constant turned into a variable; setting the stride to one here gives back insertion sort exactly.',
      },
      {
        concept: 'shiftOnInsert',
        note: 'One is the cost of making room a seat at a time; this is what happens to that cost when room can be made a stride at a time instead.',
      },
      {
        concept: 'quickSort',
        note: 'Both beat a quadratic method by handling distant disorder early, but one splits the array around a pivot while this one interleaves chains and never partitions anything.',
      },
    ],
  },
};
