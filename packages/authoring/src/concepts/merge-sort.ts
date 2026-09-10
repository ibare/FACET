/**
 * mergeSort 개념 선언.
 *
 * canonical facet 은 `facet:mergeSort` — 가로는 배열의 자리 일곱, 세로는 재귀의
 * 깊이인 화면이다. 한 번의 호출이 그 깊이 줄의 한 덩이로 서고, 쪼개면 아래 줄에
 * 두 덩이가 생기고 합치면 위 줄의 덩이가 채워진다. 견줌 · 옮김 · 깊이 세 카운터와
 * 코드 패널이 딸린 완결형이다.
 *
 * ── 묶음 안에서 어디에 무게를 두었나
 *
 * 조각 셋이 이 알고리즘의 대목을 하나씩 이미 맡고 있다 — `splitUntilOne` 은
 * 쪼개는 동안 아무것도 정렬되지 않는다는 것, `mergeTwoSorted` 는 합침 한 걸음의
 * 셈, `inPlaceVsExtra` 는 빌린 넓이. 그래서 이 개념은 **절차 전체와 그 결과**
 * 로만 말한다: 내려갔다 올라오는 순서, 맨 위의 합침이 맨 마지막이라는 것,
 * 입력이 무엇이든 흔들리지 않는 비용.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const mergeSortConcept: FacetConceptSource = {
  id: 'mergeSort',
  label: 'Merge Sort',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:mergeSort',

  surface: {
    definition:
      'A recursive sort that halves a range until single elements remain and then rebuilds each range by merging its two sorted halves on the way back up.',
    exemplarKeywords: [
      'merge sort',
      'divide and conquer sorting',
      'recursion tree',
      'n log n sorting',
      'guaranteed worst case',
      'sorting large files',
      'external sorting',
      'sorting a linked list',
      'recursive sorting algorithm',
      'the same cost on every input',
    ],
  },

  briefing: {
    observable: [
      'The horizontal axis is the seven array cells and the vertical axis is recursion depth, marked d0, d1 and so on, so one call is a block covering its range on its own row.',
      'Splitting only adds two blocks on the row below — the cells keep their values, and the reader can check that the row of numbers is unchanged all the way down to single cells.',
      'Filling runs the other way, from the bottom row upward, so the widest block is the last one to be completed and the array is not in order until the very end.',
      'While two halves are being combined only the front cell of each lower block lights up, and the winner rises into the next empty cell of the block above.',
      'When one side is used up the rest of the other side slides across without anything lighting against it.',
      'Three counters run along the bottom — compares, moves, depth — and on this fixed input they finish at fourteen, twenty and three.',
      'Reset does not reshuffle: the same seven values return in the same order, so a second run repeats the same numbers.',
    ],

    screen: {
      affordances: [
        'Nothing happens until Play is pressed. The bar carries play, single step, pause, reset and a speed slider.',
        'The code panel starts empty with a "+ Add language" button; up to two of Python, JavaScript, TypeScript, Java, C++ and C# stand side by side, and the line matching the running step is highlighted.',
        'Stepping is how the recursive call can be caught in the act — the same code line is reached again at a deeper level before any merging begins.',
      ],
    },

    useWhen: [
      'The prose has said the algorithm divides and conquers, and the reader takes the dividing to be where the ordering happens. Watching the whole run puts the events in order: every value stays where it was until a row begins filling from the row beneath it.',
      'The article claims the cost holds whatever the input looks like and the reader needs to see where the logarithm sits. The depth counter stops at three for seven values while each level touches every cell once.',
      'The reader is unsure when a recursive call actually returns. Here the widest block is the last one to fill, which makes the order of returns something to point at rather than trace on paper.',
    ],

    avoidWhen: [
      'The subject is stability or which of two equal values ends up first. These seven values are all different and the screen never puts the question.',
      'The point is where the merged output is written and who pays for that room. The copies live off screen and only the finished cells are drawn.',
      'The article is about combining two ordered inputs as an operation in its own right — merging two files, a k-way merge, intersecting posting lists. No recursion is involved in that.',
      'The article uses "merge" for combining branches in version control, or for reconciling two sets of records.',
    ],

    contrastWith: [
      {
        concept: 'splitUntilOne',
        note: 'The descent alone, held still: cutting changes only the boundaries, which is the half of this run where nothing is yet ordered.',
      },
      {
        concept: 'mergeTwoSorted',
        note: 'One combination step at full size. Here that step repeats at every level, and its cost is what the level count multiplies.',
      },
      {
        concept: 'inPlaceVsExtra',
        note: 'The room this sort borrows to combine two halves, weighed against a sort that keeps to its own cells.',
      },
      {
        concept: 'quickSort',
        note: 'Both split and recurse, but one splits by position and does its work while returning, the other splits by a chosen value and has nothing left to do on the way back.',
      },
    ],
  },
};
