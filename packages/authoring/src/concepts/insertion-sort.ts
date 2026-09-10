/**
 * insertionSort 개념 선언.
 *
 * canonical facet 은 `facet:insertionSort` — 집어 든 값이 위 칸에 뜨고 떠난 자리가
 * 빈 자리로 남는 화면이다. 왼쪽 줄 선 구간을 옅은 띠가 감싸고, 아래 기록이 넣은
 * 값마다 비켜선 횟수를 네모로 쌓는다. 견줌 · 비켜섬 · 넣기 세 카운터와 코드 패널이
 * 딸린 완결형이다.
 *
 * ── 묶음 안에서 어디에 무게를 두었나
 *
 * 조각 `insertIntoSortedPart` 가 안쪽 한 걸음(들림 · 빈자리 · 멈춤)을 맡으므로,
 * 이 개념은 **일곱 걸음이 쌓여 만드는 성질** 로 말한다 — 줄 선 구간이 한 칸씩
 * 자라는 것, 값마다 든 품이 크게 다른 것, 그래서 거의 정렬된 입력에서 거의 일하지
 * 않는 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const insertionSortConcept: FacetConceptSource = {
  id: 'insertionSort',
  label: 'Insertion Sort',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:insertionSort',

  surface: {
    definition:
      'A sort that grows an ordered prefix one value at a time: each new value walks back past larger values, shifting them right, until it can be dropped in.',
    exemplarKeywords: [
      'insertion sort',
      'sorting a hand of cards',
      'nearly sorted input',
      'adaptive sorting',
      'linear best case',
      'quadratic worst case',
      'small arrays inside a hybrid sort',
      'shifting rather than swapping',
      'sorting values as they arrive',
      'teaching a first sorting algorithm',
    ],
  },

  briefing: {
    observable: [
      'The value being placed leaves the row and floats in a card above it marked key, and the cell it came from is drawn as an empty gap.',
      'The gap walks one cell left per shift as each larger value steps right into it, so it is a hole travelling rather than two values trading places.',
      'A pale band wraps the ordered stretch on the left and grows by exactly one cell after every pass.',
      'A ledger along the bottom stacks one small square per shift under each value that was inserted, and the columns are visibly uneven.',
      'The column under 90 is empty — that value stopped at its first comparison because it was the largest so far — while the column under 11 holds four.',
      'The captions name the two ways a walk can end: meeting a value that is not greater, or passing the left end of the row.',
      'Three counters run along the bottom and finish at fourteen comparisons, eleven steps aside and six insertions for these seven values.',
    ],

    screen: {
      affordances: [
        'Nothing moves until Play is pressed. The bar carries play, single step, pause, reset and a speed slider.',
        'The code panel starts empty with a "+ Add language" button; up to two of Python, JavaScript, TypeScript, Java, C++ and C# stand side by side and the running line is highlighted.',
        'The seven values are fixed and reset does not reshuffle them, so the ledger comes out the same on every run and the empty column can be pointed at by name.',
      ],
    },

    useWhen: [
      'The article claims this sort is cheap on nearly ordered data and it reads as a footnote. The ledger makes it concrete: one value cost four shifts and another cost none, and the only difference is how far each had to walk.',
      'The reader has learned that sorts move values by swapping and needs the other motion. A single value held out of the row while a hole travels left is what the inner loop actually does.',
      'The prose is arguing that the work depends on the input rather than only on its size, and needs a run where the per-value cost visibly varies from pass to pass.',
    ],

    avoidWhen: [
      'The subject is a sort meant for large inputs. What this run shows is a prefix growing one value at a time, and that pattern does not carry over to splitting and recursing.',
      'The article is about inserting into a structure — a list node, a tree, a hash table — rather than about putting a whole array in order.',
      'The point is stability, comparator design or ordering records by a key. These seven values are distinct and nothing here is ordered by anything but the number itself.',
      'The subject is finding the position by binary search before moving anything. The position here emerges from the walk and is never searched for separately.',
    ],

    contrastWith: [
      {
        concept: 'insertIntoSortedPart',
        note: 'One pass of this run, enlarged: what the lift, the hole and the early stop actually look like, which here goes past in a fraction of a second.',
      },
      {
        concept: 'selectionSort',
        note: 'Both build an ordered prefix from the left, but one scans the whole remainder to find the next value and this takes whatever comes next and walks it back.',
      },
      {
        concept: 'bubbleSort',
        note: 'Both work by comparing neighbours, but the passes here shorten or lengthen with the input while the other sweeps the whole row regardless.',
      },
      {
        concept: 'mergeSort',
        note: 'The input decides the cost here and barely touches it there, which is the trade an article picking between them is really weighing.',
      },
    ],
  },
};
