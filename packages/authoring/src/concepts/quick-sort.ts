/**
 * quickSort 개념 선언.
 *
 * canonical facet 은 `facet:quickSort` — 완결형이다. 일곱 칸짜리 배열 한 줄 위에
 * 지금 다루는 구간의 점선 테두리 · 경계 표 `i` · 훑는 자리 표 `j` 가 겹쳐 놓이고,
 * 아래에는 가르기 한 번이 한 줄씩 쌓이는 기록이 있다. 누적 계기 셋(견줌 ·
 * 맞바꿈 · 가르기)과 여섯 언어로 펼쳐지는 코드 패널이 딸려 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념은 **절차 전체와 그 결과** 를 맡는다 — 가르기가 재귀로 되풀이되며 확정된
 * 칸이 하나씩 쌓여 마침내 줄이 서고, 그 되풀이가 여벌 배열 없이 맞바꿈만으로
 * 이루어진다는 것. 무게중심은 한 번의 가르기가 아니라 **가르기가 자기 자신을
 * 부르며 끝까지 가는 일** 이다.
 * 조각 `partitionAroundPivot` 은 한 번 가른 결과가 무엇인가(갈렸을 뿐 정렬은
 * 아니다)만, 조각 `pivotChoiceMatters` 는 기준을 어디서 고르느냐가 남는 일의
 * 크기를 정한다는 것만 말한다. keywords 도 이쪽은 재귀 · 제자리 · 표준 라이브러리
 * 어휘를, 조각들은 각각 한 번의 재배치 어휘와 기준 고르기 · 최악 어휘를 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const quickSortConcept: FacetConceptSource = {
  id: 'quickSort',
  label: 'Quick Sort (Partition, Then Recurse on Both Sides)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:quickSort',

  surface: {
    definition:
      'A sorting method that picks a pivot, rearranges a range so smaller values precede it and larger follow, fixes that pivot in place, and sorts the two remaining ranges the same way.',
    exemplarKeywords: [
      'quicksort',
      'quick sort',
      'divide and conquer sorting',
      'recursive sorting',
      'Lomuto partition scheme',
      'sorting in place without a second array',
      'n log n on average, n squared at worst',
      'the standard library sort',
      'recursion on the left half and the right half',
      'sorting an array of numbers',
    ],
  },

  briefing: {
    observable: [
      'A dashed frame marks the range currently being worked on and narrows every time the recursion descends, so the reader can see which cells are out of play without them being hidden.',
      'Two marks travel with the scan — a cursor above the row for the cell being compared, and a boundary mark below it for where the small side ends — and the coloured band between them widens as values are claimed.',
      'Every round takes the last cell of its range as the pivot, and the caption names it before any comparison happens.',
      'When a value that belongs on the small side is already sitting there, the caption reports the decision but no exchange is drawn and the swap counter does not advance.',
      'A pivot that reaches its seat is redrawn as settled and never moves again for the rest of the run, so the sorted cells accumulate out of order rather than from one end.',
      'A log below the row keeps one line per partition with its range, and the bars line up vertically with the cells above, which makes the shrinking of the right-hand ranges legible as a shape.',
      'Those right-hand ranges go from [3..6] to [3..5] to [3..4] on this data — one cell shorter each time rather than half as long — because the pivot keeps turning out to be the largest value in its range.',
      'Three counters run along the bottom: comparisons, exchanges and partitions.',
      'The code panel highlights the line matching the current step as the run plays.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider.',
        'The array is fixed at seven values, so an article can name a particular cell and the round in which it settles.',
        'The code panel starts empty with an Add language button; once a language is picked, the highlighted line follows the animation.',
        'Reading the partition log after the run, rather than watching the row, is what shows how unevenly the ranges were divided.',
      ],
    },

    useWhen: [
      'The article states that sorting can be done without a second array and the reader pictures values being copied into buckets anyway. A boundary mark pushing forward through a single row, with values exchanged behind it, is what removes the second array from the picture.',
      'The prose says a partitioned pivot is "done" and the reader hears that the whole side is done. Watching settled cells appear scattered across the row while their neighbours stay jumbled separates the one finished cell from the range around it.',
      'A reader believes the recursion always halves the problem. The partition log on this data shows ranges losing a single cell at a time, which is the shape behind the quadratic worst case.',
    ],

    avoidWhen: [
      'The article is about a stable sort, or about keeping equal elements in their original relative order. Exchanges here jump values over each other and that order is not preserved.',
      'The subject is sorting data too large for memory, or merging sorted runs from disk or from several machines.',
      'The point is selecting the k-th smallest value rather than ordering everything. That work stops after one side is chosen and this run never stops early.',
      'The article uses "partition" for splitting a database table, a disk, or a stream across shards.',
    ],

    contrastWith: [
      {
        concept: 'partitionAroundPivot',
        note: 'That is one split examined closely enough to see that the two sides are not yet ordered; this repeats the split on every range until being unordered is no longer possible.',
      },
      {
        concept: 'pivotChoiceMatters',
        note: 'Both show splits, but that one holds the data fixed and varies which value becomes the pivot, while this one keeps the rule — always the last cell — and lets the consequences accumulate.',
      },
      {
        concept: 'mergeSort',
        note: 'Two divide-and-conquer sorts with the work on opposite sides of the recursion: one does everything before the calls and nothing after, the other splits blindly and does the work on the way back up.',
      },
      {
        concept: 'inPlaceVsExtra',
        note: 'The question of whether a sort needs a second array is the subject there; here it is a property of the method being watched, visible as exchanges within one row.',
      },
    ],
  },
};
