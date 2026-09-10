/**
 * heapSortExtract 개념 선언.
 *
 * canonical facet 은 `facet:heapSortExtract` — 칸 다섯짜리 줄 하나에 세로 막대가
 * 서고, 꺼낼 때마다 그 경계가 한 칸씩 왼쪽으로 밀려가는 조각(piece)이다. 꺼낸
 * 값은 힙이 방금 내놓은 그 칸에 앉는다. 시작부터 이미 최대 힙이고, 힙 모양을
 * 되찾는 과정은 걸음으로 보이지 않는다.
 *
 * 묶음 안에서의 자리 — 완제품 `heapSort` 는 힙 만들기부터 견줌 수까지 절차
 * 전체를 말한다. 이 조각은 **정렬 결과를 담을 자리를 따로 빌려야 하는가**
 * 하나만 말하고 멈춘다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const heapSortExtractConcept: FacetConceptSource = {
  id: 'heapSortExtract',
  label: 'Heap Extract Into the Vacated Cell',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:heapSortExtract',

  surface: {
    definition:
      'Removing the top of a heap shrinks it by one cell, and that freed cell at the end of the same row is exactly where the removed value is put.',
    exemplarKeywords: [
      'in-place sorting',
      'constant extra space',
      'where do the removed values go',
      'do I need a second array',
      'the boundary between two regions',
      'sorted tail grows from the back',
      'memory overhead of a sort',
      'extract the maximum repeatedly',
      'descending removals leave ascending order',
      'one array is enough',
    ],
  },

  briefing: {
    observable: [
      'One row of five cells has a vertical bar standing inside it: the region left of the bar is still the heap, the region right of it is finished. Two horizontal rules under the row measure the two regions.',
      'Each step is two motions — the top value lifts into a lane above the row, then the bar slides one cell left and the lifted value flies into the cell the heap has just released.',
      'At the same moment the remaining values travel through a lower lane into their new cells, so the whole reorganisation arrives as one rearrangement.',
      'The upper lane and the middle lane sit at different heights, so the value being taken out never crosses the values that are only changing seats.',
      'The row is a max heap before anything happens and finishes in ascending order, with the left rule shrinking to nothing as the right one grows to the whole row.',
      'No cell is ever added to the row: the left and right regions always add up to the same five, which is what the two rules underneath are measuring.',
      'The closing caption states that the sort finished inside the same row without borrowing a slot.',
    ],

    screen: {
      affordances: [
        'The screen empties the heap on its own and stops with the whole row in ascending order and the boundary bar at the far left.',
        'Two buttons: Replay, and a step control that repeats the run one motion at a time, which is how the lift and the landing can be separated and looked at.',
        'The five values are fixed and already form a max heap, so the article can name the order in which they come out.',
      ],
    },

    useWhen: [
      'The prose says that repeatedly taking the largest value sorts a list, and the reader is quietly wondering where those values are being kept. Seeing the vacated cell be the destination answers that before it becomes an objection.',
      'The article compares the memory cost of sorting methods and needs constant extra space to be a picture rather than a phrase — the two rules always summing to the same row are that picture.',
      'The reader thinks of the input array and the result as two different things. One row split by a moving boundary is what merges them into one.',
    ],

    avoidWhen: [
      'The article needs the repair that restores heap order after a removal. The remaining values simply arrive at their new cells here; the path each one takes is not shown.',
      'The subject is turning an unordered array into a heap in the first place. The row is already a heap when the screen starts.',
      'The subject is a priority queue in use, where values arrive and leave interleaved. Nothing is ever put in here.',
      'The point is comparison and swap costs, or the running time of the sort. Nothing on screen counts anything.',
    ],

    contrastWith: [
      {
        concept: 'heapSort',
        note: 'This isolates the storage question; the full screen adds the build that comes first and counts the comparisons each removal costs.',
      },
      {
        concept: 'siftDown',
        note: 'Two halves of one removal — that one follows the promoted value down through the tree, this one follows the removed value out to the cell the tree gave up.',
      },
      {
        concept: 'inPlaceVsExtra',
        note: 'The general trade between working inside the input and borrowing a second buffer, against the particular case where the shrinking structure hands back exactly the room the result needs.',
      },
    ],
  },
};
