/**
 * heapSort 개념 선언.
 *
 * canonical facet 은 `facet:heapSort` — 배열 한 줄만 그리고 부모-자식 관계를
 * 줄 아래 걸린 활로 보이는 완결형이다. 자식을 가진 마지막 자리부터 거꾸로
 * 힙을 만들고, 꼭대기와 끝을 맞바꿔 힙을 줄이기를 되풀이한다. 견줌 · 맞바꿈 ·
 * 확정된 칸 세 카운터와 여섯 언어 코드 패널이 딸린다.
 *
 * 묶음 안에서의 자리 — 조각 `heapSortExtract` 는 "꺼낸 것을 어디에 두는가"
 * 하나만 말한다. 이 완제품은 힙을 만드는 앞 단계부터 견줌이 몇 번 드는지까지
 * **절차 전체와 그 값**을 말한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const heapSortConcept: FacetConceptSource = {
  id: 'heapSort',
  label: 'Heap Sort',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:heapSort',

  surface: {
    definition:
      'A sort that reads one array as a binary tree through index arithmetic, builds a max heap in it, then repeatedly swaps the top with the last cell of the shrinking heap.',
    exemplarKeywords: [
      'heap sort',
      'heapify',
      'build a max heap',
      'array as a binary tree',
      'children at 2i+1 and 2i+2',
      'sift down',
      'guaranteed n log n worst case',
      'sorting with a heap',
      'repeatedly take the largest',
      'unstable sort',
      'sorting without recursion',
    ],
  },

  briefing: {
    observable: [
      'Only one row is drawn. Parent and child are joined by arcs hung beneath that row, so the tree and the array are one object rather than two pictures side by side.',
      'An arc is drawn only between cells still inside the heap, so as the heap shrinks the arcs disappear from the right and the finished tail grows in the same row.',
      'A band above the row shows the levels of the heap, each level twice the width of the one above it, shortening from the last level as the heap gives cells up.',
      'The build starts at the last cell that has children and works backwards to the front, sinking one value at a time rather than inserting values one by one.',
      'One descent shows two comparisons — the two children against each other, then the parent against the winner — and it stops the moment the parent already wins, which is often before the bottom.',
      'A descent skips the first comparison at a cell with only one child, so the comparison count is not simply twice the number of levels travelled.',
      'Three counters run along the bottom — compares, swaps and settled cells — and this array finishes at 19 compares and 13 swaps.',
      'The code panel highlights the line for the running phase: building the heap, comparing children, moving down, settling, swapping top with end, shrinking the heap, and sinking the new top.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider. One step is one phase, which is how a single descent can be followed comparison by comparison.',
        'The code panel starts empty with an "+ Add language" button offering Python, JavaScript, TypeScript, Java, C++ and C#; two can sit side by side.',
        'The input is fixed at seven values, so the compare and swap totals are stable enough for the article to quote.',
        'Watching the arcs vanish from the right is the way to point at the boundary between what is still a tree and what is already sorted.',
      ],
    },

    useWhen: [
      'The article has introduced a heap as a structure and now has to make it a sorting method. The same row serving as the tree and as the finished output is the step between the two.',
      'The reader believes a tree needs stored child references. Arcs drawn from index arithmetic alone over a flat row is the counter, and the row is the only storage on screen.',
      'The prose gives the cost as n log n and the reader wants to see where the logarithm comes from. The level band above the row is the depth any single descent can travel.',
      'The reader has to accept that a descent usually ends early. The comparison that asks whether the parent already wins is on screen and is what stops it.',
    ],

    avoidWhen: [
      'The article uses "heap" for the memory region a program allocates from. That is an unrelated meaning and nothing here concerns allocation.',
      'The subject is keeping equal keys in their input order. Values here jump between distant cells and their relative order is not preserved.',
      'The article is about a priority queue as an interface — pushing and popping as work arrives, changing a priority, cancelling a queued item — rather than ordering a fixed array once.',
      'The point is whether building a heap in one pass costs less than inserting values one at a time. The build happens once here and is not set against an alternative.',
    ],

    contrastWith: [
      {
        concept: 'heapSortExtract',
        note: 'That one answers only where the removed values are stored; this one includes the build that precedes the removals and the cost of the descents they trigger.',
      },
      {
        concept: 'heapBinary',
        note: 'The structure and its operations against one use of them — here nothing is ever inserted, the array arrives whole and is drained in one direction.',
      },
      {
        concept: 'siftDown',
        note: 'One descent in isolation against the two loops that call it — first backwards over the parents, then once after every removal.',
      },
      {
        concept: 'selectionSort',
        note: 'Both repeatedly move the largest remaining value to the end; one finds it by scanning everything each time, the other keeps a structure in which it is already at the front.',
      },
    ],
  },
};
