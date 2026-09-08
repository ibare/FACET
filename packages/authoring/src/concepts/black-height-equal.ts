/**
 * blackHeightEqual 개념 선언.
 *
 * canonical facet 은 `facet:blackHeightEqual` — 한 주장만 말하고 멈추는 화면.
 * 누구의 하위도 아니므로 `aspects` 를 쓰지 않고 canonicalFacet 은 자기 자신이다.
 *
 * 화면은 고정된 트리 하나에서 뿌리 아래 네 길을 실제로 따라 내려가며 검은 자리를
 * 센다. 스스로 네 길을 다 돌고 멈추며, 그 뒤로는 한 걸음씩 되짚을 수 있다.
 *
 * 주장은 하나다 — 길이는 달라도 검은 수는 넷 다 같은 값에 닿는다. 넣고 빼기를
 * 되풀이해도 그 값이 유지되는지는 이 화면이 다루지 않는다.
 *
 * id 에 변별어를 둔 이유: "높이" 만으로는 자리 수로 세는 나무 높이와 갈리지
 * 않는다. 여기서 세는 것은 검은 자리뿐이고, 요점은 그것이 어느 길에서나 같다는
 * 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const blackHeightEqualConcept: FacetConceptSource = {
  id: 'blackHeightEqual',
  label: 'Black Height Is Equal on Every Path',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:blackHeightEqual',

  surface: {
    definition:
      'Black height is the number of black nodes on a path from a node down to an empty leaf, and it is the same number for every such path.',
    exemplarKeywords: [
      'black height',
      'black-height property',
      'same number of black nodes on every path',
      'red-black tree invariant',
      'empty leaf counts as black',
      'NIL is black',
      'longest path at most twice the shortest',
      'counting black nodes',
      'why a red-black tree stays balanced',
    ],
  },

  briefing: {
    observable: [
      'One arrangement is on screen the whole time and never changes: 20 black at the top, 10 black and 40 red below it, 5 red under 10, and 30 and 50 black under 40.',
      'A ring walks down from below the root along one route at a time and travels back to the top when the route ends — the root itself is not stepped on, and no seat ever changes colour, so the ring is the only thing that moves.',
      'The caption keeps a running total at every step: a black seat raises it, a red seat is stepped over and the total stays put, and the empty spot that ends the route raises it once more because an empty spot counts as black. The ring is solid when the step counted and dashed when it did not.',
      'Each finished route leaves its total as a small badge beside the empty spot it ended on, so all four numbers end up on screen at once instead of one at a time.',
      'The routes are not the same length — some pass three seats, some two — and the four badges all read the same number, which the closing caption states outright.',
    ],

    screen: {
      affordances: [
        'The screen walks all four routes on its own and stops, so it finishes its argument without asking for a click.',
        'Two buttons: Replay, and Step. The first press of Step returns the ring to the top and shows the first step again; each press after that moves one step, and a press past the last one starts over.',
        'The arrangement is given rather than typed in, so the four routes are always the same four and the counts can be checked by hand against the picture.',
      ],
    },

    useWhen: [
      'The prose has just defined black height and the reader is about to hear it as the length of the path — four routes of unequal length arriving at one number pulls those two apart.',
      'The article is about to argue that the longest path cannot exceed twice the shortest, and that argument rests on the count being identical everywhere, which the reader should have watched being counted before it is asked to carry the bound.',
    ],

    avoidWhen: [
      'The article is about restoring this count after an insertion or a deletion. Here nothing is added, removed, or recoloured — one fixed arrangement is walked and counted.',
      'The subject is the rule against a red node under a red parent, or the repair it triggers. Red seats are stepped over in the counting here, but that rule is never put to work.',
      'The point is the height or depth of a tree, or a level-by-level walk. Only black seats are counted here, and two routes of different length deliberately reach the same number.',
      'The article is about balance in an AVL or B-tree, where the invariant is written in subtree heights or in how full a node is. The counting on this screen belongs to a colour rule and says nothing about those.',
    ],

    contrastWith: [
      {
        concept: 'recolorThenRotate',
        note: 'The two rules of the same structure: this one is the count that must come out equal, the other is the red-under-red rule and the repair that must leave this count intact.',
      },
      {
        concept: 'redBlackTree',
        note: 'One arrangement counted once versus the number holding up under change — the equality is shown here as a fact about a tree, not as something that survives insertion and deletion.',
      },
      {
        concept: 'heightStaysLow',
        note: 'This is the reason behind that claim: because the black count is fixed and red nodes cannot follow one another, no path can stretch past twice the shortest.',
      },
    ],
  },
};
