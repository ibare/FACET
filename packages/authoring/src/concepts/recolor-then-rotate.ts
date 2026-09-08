/**
 * recolorThenRotate 개념 선언.
 *
 * canonical facet 은 `facet:recolorThenRotate` — 한 주장만 말하고 멈추는 화면.
 * 누구의 하위도 아니므로 `aspects` 를 쓰지 않고 canonicalFacet 은 자기 자신이다.
 *
 * 화면은 20, 10, 30, 5, 3 을 이 순서로 넣으며 "빨강 아래 빨강" 을 두 번 겪는다.
 * 스스로 다섯 삽입을 재생하고 멈추며, 그 뒤로는 한 걸음씩 되짚을 수 있다.
 *
 * 주장은 하나다 — 옆자리의 색이 색칠과 회전을 가르고, 색칠은 그 자리에서
 * 끝내는 것이 아니라 빨강이 된 조부모를 위로 넘긴다.
 *
 * id 에 변별어를 둔 이유: "회전" 만으로는 높이차로 도는 다른 균형 트리와
 * 갈리지 않는다. 이 개념이 다루는 것은 색을 보고 고르는 그 한 판정이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const recolorThenRotateConcept: FacetConceptSource = {
  id: 'recolorThenRotate',
  label: 'Why Recoloring Alone Is Not Always Enough',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:recolorThenRotate',

  surface: {
    definition:
      'The repair after a red node lands under a red parent: the colour of the spot beside the parent decides whether recoloring settles it or a rotation is needed.',
    exemplarKeywords: [
      'red-black insert fixup',
      'red under red',
      'double red violation',
      'uncle is red',
      'uncle is black',
      'recolor case versus rotate case',
      'grandparent turns red',
      'empty spot counts as black',
      'NIL is black',
    ],
  },

  briefing: {
    observable: [
      'Five keys go in — 20, 10, 30, 5, 3 — and the same violation, a red seat under a red parent, is met twice on the way.',
      'The first time, the spot beside the parent holds a red seat: three seats change colour where they stand, nothing moves, and the grandparent comes out red.',
      'The very next caption turns that grandparent black again because it is the root — so the recolor did not end the matter where it happened, it handed a red seat upward to be dealt with.',
      'The second time, the spot beside the parent is empty, and a small black square labelled NIL is drawn into it and ringed along with the child and parent; the caption says an empty spot counts as black and recoloring alone will not fix this.',
      'That one is settled by turning: the grandparent rotates, the parent travels up into its place, the displaced seats slide to their new positions, and the two swap colours.',
    ],

    screen: {
      affordances: [
        'The screen plays the five insertions on its own and stops, so it makes its point without waiting for a click.',
        'Two buttons: Replay, and Step. The first press of Step empties the tree and shows the first moment again; each press after that advances one moment, and a press past the last one rewinds and starts over.',
        'The order of those five keys is what produces one of each case, so stepping the run is what turns two rules into one visible decision.',
      ],
    },

    useWhen: [
      'The prose has said a violation is repaired by recoloring and the reader takes that to be the end of it — here the recolor leaves a red grandparent behind and the repair has to be picked up a level higher.',
      'The reader needs the rule that picks between the two repairs tied to something on the tree — the colour of the spot beside the parent, empty spots included — rather than held as a list of cases to memorise.',
    ],

    avoidWhen: [
      'The article is about AVL rotations, single and double rotations chosen by a balance factor, or any rebalancing driven by subtree heights. The word rotation is shared and will pull this in wrongly, but nothing here is decided by a height difference.',
      'The subject is the repair after a deletion. Only insertions run here, and the deletion cases are neither shown nor named.',
      'The article is about counting black nodes along a path. That rule is invoked in one caption to explain why the empty spot blocks recoloring, but no path is counted out.',
      'The point is what rebalancing costs across many operations, or how it compares with another tree. Five keys go in and nothing is tallied.',
    ],

    contrastWith: [
      {
        concept: 'redBlackTree',
        note: 'The same decision, seen once against seen repeatedly — one violation resolved here, and the chain of them that follows when keys keep arriving and leaving.',
      },
      {
        concept: 'blackHeightEqual',
        note: 'The two rules of the same structure: this one is about the red-under-red rule and its repair, the other about the count that recoloring must not disturb.',
      },
      {
        concept: 'rotateToBalance',
        note: 'Both end with a node moving up and its parent moving down, but the trigger differs — a colour next door here, a height difference between subtrees there.',
      },
    ],
  },
};
