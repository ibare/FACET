/**
 * siftDown 개념 선언.
 *
 * canonical facet 은 `facet:siftDown` — 값 일곱 개짜리 최소 힙에서 꼭대기를 한 번
 * 빼내고, 맨 끝 값이 그 빈 자리로 올라가 두 자식 중 앞선 쪽과 맞바꾸며 내려가는
 * 과정 전부를 보이는 화면이다. 이 데이터에서는 맞바꿈이 두 번 일어나고 맨
 * 아랫단에서 멈춘다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * 변별어는 붙이지 않았다. "sift down" 은 힙 문헌 안에서만 쓰이는 말이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const siftDownConcept: FacetConceptSource = {
  id: 'siftDown',
  label: 'Sift Down (Sinking After a Removal)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:siftDown',

  surface: {
    definition:
      'The repair after the root is taken: the last value moves into the vacated root and trades downward with its smaller child until neither child precedes it.',
    exemplarKeywords: [
      'sift down',
      'percolate down',
      'heapify down',
      'trickle down',
      'extract-min',
      'delete the root',
      'priority queue pop',
      'swap with the smaller child',
      'restoring the heap after removing',
    ],
  },

  briefing: {
    observable: [
      'The removed top value does not disappear — it travels to a parked position at the edge of the canvas and stays smaller and faded there, so the reader can see what came out.',
      'The vacated root is held as a dashed empty circle until the last value flies diagonally up into it; the rest of the tree never shifts to close the gap.',
      'Before every descent both children are lit and the caption names which one is smaller, and when a position has only one child the caption says so instead of comparing two.',
      'Parent and chosen child exchange positions in an animated swap, and the descent here takes two of them before stopping in the bottom row.',
      'The final caption gives the stopping condition itself — smaller than both children, or no children left — rather than just marking the slot.',
    ],

    screen: {
      affordances: [
        'The screen plays one whole removal on its own and stops with the removed value still parked at the edge.',
        'Two buttons: Replay, and a step control for taking the descent one move at a time, which is how a reader can pause on the comparison between the two children.',
        'The starting heap is fixed, so the article can name the value that comes out and the path the promoted value takes.',
      ],
    },

    useWhen: [
      'The article says removing the smallest value leaves a hole and the reader assumes everything after it slides up to close it. Promoting the single last value into the empty root, with the rest of the tree untouched, is the move that has to be seen.',
      'The reader has to accept that the choice of child is forced rather than arbitrary — swapping with the larger child would bury the smaller one beneath it — and the screen weighs the two children against each other before every step down.',
    ],

    avoidWhen: [
      'The article is about deleting an arbitrary value or lowering a key already inside the structure. Only the top is ever removed here.',
      'The subject is the total cost of turning an unordered array into a heap. This shows a single descent, not the accumulation over many.',
      'The point is why the smallest value was at the root in the first place. That is the ordering rule, and this screen starts from a heap that already holds.',
      'The article uses "heap" for the memory region a program allocates from.',
    ],

    contrastWith: [
      {
        concept: 'siftUp',
        note: 'The mirrored repair: adding compares against one parent and walks up, removing must first pick between two children before it can walk down.',
      },
      {
        concept: 'shiftOnRemove',
        note: 'Both fill a hole left by a removal, but shifting moves every element after it while this moves one value into the hole and then walks it down a single path.',
      },
      {
        concept: 'heapBinary',
        note: 'This is the single descent; repeating it until the structure is empty is what turns a heap into a sorting method.',
      },
    ],
  },
};
