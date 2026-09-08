/**
 * arrayAsTree 개념 선언.
 *
 * canonical facet 은 `facet:arrayAsTree` — 칸 일곱 개짜리 배열을 위에, 같은 값의
 * 나무를 아래에 그려 놓고, 커서 하나가 두 그림을 동시에 짚으며 `2i+1` · `2i+2` ·
 * `⌊(i−1)/2⌋` 셈만으로 부모와 자식 사이를 오가는 화면이다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * 변별어를 붙인 이유: "배열" 도 "트리" 도 그 자체로 개념이 따로 있다. 이 개념이
 * 다루는 것은 그 둘이 같은 것의 두 모습이 되는 자리 하나뿐이다 (C4).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const arrayAsTreeConcept: FacetConceptSource = {
  id: 'arrayAsTree',
  label: 'A Tree Stored in an Array',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:arrayAsTree',

  surface: {
    definition:
      'Holding a gap-free binary tree in a flat array, where index arithmetic gives the children as 2i+1 and 2i+2 and the parent as the floor of (i-1)/2, with no pointers stored.',
    exemplarKeywords: [
      'array-backed tree',
      'implicit tree',
      'index arithmetic',
      '2i+1 and 2i+2',
      'parent index formula',
      'complete binary tree',
      'heap storage layout',
      'tree without pointers',
      'contiguous memory',
      'cache locality',
    ],
  },

  briefing: {
    observable: [
      'The array runs across the top with an index number over every cell and the tree hangs below, and the cell and node for the same index are ringed at the same moment and joined by a dashed line — one position seen twice, not two pieces of data.',
      'Each move draws the arithmetic in the caption with the actual numbers filled in, so the jump from one position to another is shown as a computation rather than as a link being followed.',
      'The walk goes down to the left twice, back up to a parent, down to the right, and up again to the root, so both directions of the arithmetic are exercised on the same tree.',
      'At a leaf, two ghost positions fade in below it in dashed outline carrying index numbers that fall past the last cell — having no child shows up as a number out of range.',
      'The closing step counts what was stored: seven cells holding seven values and zero links, against the fourteen that linked nodes would have needed.',
    ],

    screen: {
      affordances: [
        'The screen walks the whole route on its own and stops with every cell and node outlined together.',
        'Two buttons: Replay, and a step control for taking one jump at a time, which is how a reader can read the arithmetic in a caption before the cursor moves again.',
        'The seven values are fixed, so the index numbers the article quotes are the ones the reader will see.',
      ],
    },

    useWhen: [
      'The prose says the structure is a tree but is stored in a plain array, and the reader carries two pictures — an array somewhere and a tree somewhere else. Driving one cursor through both at once is what collapses them into a single position with two appearances.',
      'A claim about saved space or contiguous storage is about to be made, and it only lands once the reader has watched a parent and a child be reached by arithmetic alone with nothing linking them.',
    ],

    avoidWhen: [
      'The article is about a tree where values are inserted and removed at arbitrary positions. The arithmetic only holds while the tree is filled level by level with no gaps.',
      'The subject is a tree built from node objects that hold references to their children — the point here is precisely that there are none.',
      'The point is how an array grows when it runs out of room, or what happens on an out-of-range index. Neither occurs here.',
      'The article is about a general tree or a tree with more than two children per node, where these three formulas do not apply.',
    ],

    contrastWith: [
      {
        concept: 'nodePointsNext',
        note: 'Two ways of saying where the next element is: one stores a reference and follows it, the other stores nothing and computes the position.',
      },
      {
        concept: 'indexAddressCalc',
        note: 'Both reach a position by arithmetic instead of by search; one computes a memory address from an index, this computes another index from an index.',
      },
      {
        concept: 'heapBinary',
        note: 'This is the storage trick on its own; a heap is the structure that adopts it, and can only do so because it is always filled without gaps.',
      },
    ],
  },
};
