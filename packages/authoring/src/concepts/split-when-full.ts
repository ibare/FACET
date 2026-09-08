/**
 * splitWhenFull 개념 선언.
 *
 * canonical facet 은 `facet:splitWhenFull` — 부모 한 줄과 자식 한 줄에 상자를
 * 놓고, 이미 셋을 채운 자식에 25 가 들어와 넘치는 순간부터 가운데 키가 부모로
 * 솟고 남은 것이 둘로 갈라지기까지 네 걸음만 말하고 멈춘다.
 *
 * 스스로 재생하고 멈추는 화면이다. 재생이 끝나면 한 걸음 버튼으로 같은 네
 * 걸음을 되짚는다.
 *
 * 변별어를 붙인 이유: "분할" 은 배열 재할당부터 해시 테이블 재해싱까지 여러
 * 자리에서 쓰는 말이다. 이 개념이 말하는 것은 꽉 찬 자리에서 가운데 키가 위로
 * 올라간다는 한 규칙이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const splitWhenFullConcept: FacetConceptSource = {
  id: 'splitWhenFull',
  label: 'Splitting a Full Node',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:splitWhenFull',

  surface: {
    definition:
      'The insertion rule for a node with no room left: the middle key moves up into the parent and the remaining keys divide into two sibling nodes.',
    exemplarKeywords: [
      'node split',
      'promote the middle key',
      'overflow',
      'page split',
      'index page is full',
      'split into two siblings',
      'node capacity',
      'B-tree insert',
    ],
  },

  briefing: {
    observable: [
      'The arriving key is weighed against the one key in the parent and drops into the child on that side — the caption states the comparison that sent it there.',
      'That child is already holding its full three keys, and the newcomer settles into sorted position among them, leaving the box marked as carrying four where three is the limit.',
      'The middle of those four — the second key — lifts out of the child and travels up into the parent, which now holds two keys where it held one.',
      'The three keys left over become two boxes, one to the left of the key that rose and two to the right, and the sibling already standing there slides across to make room.',
      'The drawing keeps the same two rows from beginning to end: the child row gains a box and the parent row gains a key.',
    ],

    screen: {
      affordances: [
        'It runs its four moments unprompted and holds the final arrangement — arriving, overflowing, rising, dividing.',
        'Two buttons: Replay, and Step to take the four moments singly. The first press of Step returns the tree to its state before the key arrived, then shows the first moment.',
        'The key that rises and the key that arrived are different keys, and stepping is what makes that easy to point at — the newcomer stays down in the right-hand box.',
      ],
    },

    useWhen: [
      'The prose says a full node splits and leaves the reader guessing which key leaves and where it lands. Here the middle key is the one that rises, and it arrives in the parent as the boundary between the two halves left behind.',
      'The claim to be made is that a routine insertion widens the structure rather than deepening it, and it needs the moment where the number of boxes goes up while the number of rows does not.',
    ],

    avoidWhen: [
      'The subject is the shrinking side — a node dropping below its minimum, borrowing from a neighbour, two thin nodes merging. Only a key arriving is shown here.',
      'The point is when the structure does get taller. The parent here has room for the key that rises, so the split stops there.',
      'The article is about B+Tree splits specifically — the separating key copied upward rather than moved, the bottom row chained for range scans. The middle key leaves the child entirely here, and no chain is drawn.',
      'The subject is capacity measured in storage: page size, fill factor, how many entries fit in a block. Three keys per box is the size used to make the overflow legible, and no bytes appear.',
    ],

    contrastWith: [
      {
        concept: 'growAndCopy',
        note: 'Two answers to the same overflow: one takes a larger block and copies everything across, and this one leaves the keys where they are and hands half of them to a new sibling.',
      },
      {
        concept: 'rotateToBalance',
        note: 'Both keep a tree from leaning, one by rearranging existing nodes around a pivot and this one by adding a sibling and pushing a key upward.',
      },
      {
        concept: 'bTree',
        note: 'This is a single insertion caught in the act; the full structure runs it repeatedly and adds what removal forces on the way back down.',
      },
    ],
  },
};
