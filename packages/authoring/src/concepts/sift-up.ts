/**
 * siftUp 개념 선언.
 *
 * canonical facet 은 `facet:siftUp` — 값 일곱 개짜리 최소 힙에 7 을 넣고,
 * 새 값이 맨 끝자리에서 부모와 견주며 오르다 **멈추는 지점**까지 보이는
 * 화면이다. 이 데이터에서는 맞바꿈이 한 번뿐이고 꼭대기에 닿지 않는다 —
 * 그 사실 자체가 이 화면의 주장이다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * 변별어는 붙이지 않았다. "sift up" 은 힙 문헌 안에서만 쓰이는 말이고 다른
 * 뜻으로 갈릴 여지가 없다 (C4 명명 규칙 2 의 반대 방향).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const siftUpConcept: FacetConceptSource = {
  id: 'siftUp',
  label: 'Sift Up (Climbing After an Insert)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:siftUp',

  surface: {
    definition:
      'The repair after an insert: a value placed in the last slot trades upward with its parent until it meets a parent it does not precede, and stops there.',
    exemplarKeywords: [
      'sift up',
      'percolate up',
      'bubble up',
      'heapify up',
      'heap insert',
      'priority queue push',
      'swap with parent',
      'log n insertion',
      'restoring the heap after adding',
    ],
  },

  briefing: {
    observable: [
      'The existing heap is drawn first, and the new value appears in the next open slot at the bottom rather than at the top or in the middle.',
      'Before every move the new value and its parent are lit together and the caption states both values, so the decision is visible as a comparison and not as a rule being recited.',
      'A swap is an actual exchange of positions — the two circles travel past each other — rather than one value being redrawn somewhere else.',
      'The climb here ends after a single swap, two levels short of the top, and the stopping slot is repainted to mark it as final.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole insertion on its own and stops at the settling slot.',
        'Two buttons: Replay, and a step control that walks the same moments one at a time, which is the way to hold on the comparison that ends the climb.',
        'The starting heap and the inserted value are fixed, so the article can name them and count the swaps.',
      ],
    },

    useWhen: [
      'The text says an inserted value "bubbles up" and the reader pictures it travelling to the root every single time. Watching it halt at the first parent it cannot precede is what corrects that, and here the halt comes after one swap.',
      'A cost claim about insertion is coming and the reader needs to see what is actually being counted — one comparison per level along a single path from the bottom, never a pass over the stored values.',
    ],

    avoidWhen: [
      'The article is about bubble sort. The word "bubble" is shared but this is one value walking a single path upward, not repeated passes over neighbours.',
      'The subject is turning an unordered array into a heap in one pass. That route repairs from the bottom parents downward and is not the motion here.',
      'The point is removing a value or emptying a heap. Nothing is taken out on this screen.',
      'The article uses "heap" for the memory region a program allocates from.',
    ],

    contrastWith: [
      {
        concept: 'siftDown',
        note: 'The same kind of repair aimed the other way: one is triggered by adding at the bottom and walks up against a single parent, the other by removing at the top and walks down having to choose between two children.',
      },
      {
        concept: 'shiftOnInsert',
        note: 'Both are the price of putting a value into an ordered store, but shifting touches every element after the insertion point while this touches one element per level.',
      },
      {
        concept: 'heapProperty',
        note: 'One is the condition that must hold after an insert; this is the work that restores it.',
      },
    ],
  },
};
