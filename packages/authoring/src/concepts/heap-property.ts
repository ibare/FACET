/**
 * heapProperty 개념 선언.
 *
 * canonical facet 은 `facet:heapProperty` — 값 일곱 개짜리 최소 힙을 그려 놓고
 * 부모-자식 짝 여섯을 하나씩 견주어 표시한 뒤, 같은 부모를 둔 형제 짝 셋은
 * 견주지 않고 지나간다는 것을 보이고 멈추는 화면이다.
 *
 * 스스로 재생하고 멈춘다. 독자의 입력이 없어도 할 말을 다 하며, 다시 보기와
 * 한 걸음씩 짚어보기만 딸려 있다.
 *
 * 변별어를 붙인 이유: "힙" 은 자료구조 전체를 가리키기도 하고 언어 런타임의
 * 동적 할당 영역을 가리키기도 한다. 이 개념이 다루는 것은 그 자료구조가 지키는
 * 순서 제약 하나뿐이라 그 범위를 id 에 박는다 (C4 명명 규칙 2).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const heapPropertyConcept: FacetConceptSource = {
  id: 'heapProperty',
  label: 'The Heap Property (Parent Before Child)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:heapProperty',

  surface: {
    definition:
      'The single ordering rule a heap keeps: every parent precedes both of its children, while two values sharing a parent are never ordered against each other.',
    exemplarKeywords: [
      'heap property',
      'heap invariant',
      'min-heap',
      'max-heap',
      'parent smaller than child',
      'partial order',
      'a heap is not sorted',
      'smallest at the root',
      'sibling order',
    ],
  },

  briefing: {
    observable: [
      'Seven values hang as a tree, and the walk visits the six parent-child edges one at a time; a marker travels along each edge and the edge keeps a badge once it has been checked.',
      'Each check names both values in the caption and computes the verdict on the spot rather than displaying a pre-written mark.',
      'The three sibling pairs are then visited on arcs above the tree and marked with a crossed-out dashed badge while both nodes go dim — the pair is reached and then deliberately passed over.',
      'Two of those sibling pairs are visibly out of order — 9 stands to the left of 6, and 12 to the left of 10 — and nothing on screen treats that as an error.',
      'The walk ends by ringing the root and naming the smallest value, which is the only position the rule actually pins down.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole walk on its own and stops; nothing has to be clicked for it to make its point.',
        'Two buttons: Replay, and a step control for taking the pairs one at a time. Stepping is what lets a reader dwell on a single sibling pair.',
        'The seven values are fixed, so the same pairs come up every time and the article can quote them by value.',
      ],
    },

    useWhen: [
      'The prose says a heap keeps the smallest value at the top, and the reader hears that as "a heap is sorted". Exhausting all six parent-child pairs and then refusing all three sibling pairs is what separates the two readings.',
      'An argument is about to lean on what a heap deliberately does not promise — that reading the tree across gives you nothing usable. That absence has to be shown pair by pair before anyone will grant it.',
    ],

    avoidWhen: [
      'The article uses "heap" for the memory region a program allocates from. Nothing here concerns allocation.',
      'The subject is how a heap is repaired after a value goes in or comes out. This screen inspects a heap that already holds, and no value moves.',
      'The point is the ordering rule of a binary search tree. That rule reaches across whole subtrees, while every relation checked here is one step from a parent to its own child.',
      'The article needs the second or third smallest value, or the values in order. Only the root position is determined by this rule.',
    ],

    contrastWith: [
      {
        concept: 'bstInorderSorted',
        note: 'Both are tree ordering rules, but walking a search tree across yields the values in order and walking this one across yields nothing in particular.',
      },
      {
        concept: 'bstCompareAndGo',
        note: 'A search tree\'s rule tells you which way to go and so supports lookup; this rule only tells you what is at the top, so there is no direction to search in.',
      },
      {
        concept: 'siftUp',
        note: 'One states the condition that must hold; the other is the work done to restore it after a value is added.',
      },
    ],
  },
};
