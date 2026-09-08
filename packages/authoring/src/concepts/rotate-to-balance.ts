/**
 * rotateToBalance 개념 선언.
 *
 * canonical facet 은 `facet:rotateToBalance` — 고정된 6노드 트리에 왼쪽 회전을
 * 한 번 걸고 멈추는 화면이다. 네 걸음(재기 → 돌기 → 다시 재기 → 결론)을 스스로
 * 재생한 뒤 걸음 단추로 같은 넷을 다시 짚는다. 독자가 값을 넣는 자리는 없다.
 *
 * 이 화면의 서명은 가로축이다 — 노드의 가로 위치가 값의 정렬 순서로 고정되어
 * 있어서 회전이 세로만 바꾼다. 마지막 걸음에서 아래쪽에 값 순서 눈금이 그려지고
 * 캡션이 중위 순회 순서가 그대로임을 적는다. 회전이 허용되는 이유가 화면에
 * 직접 표현되어 있으므로, 그것을 useWhen 의 첫 항목으로 삼았다.
 *
 * 변별어를 붙인 이유: "rotation" 은 2차원 회전 변환 · 비트 회전 · 배열 회전까지
 * 자칭하는 말이라, 무엇을 위한 회전인지를 id 가 먼저 특정해야 한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const rotateToBalanceConcept: FacetConceptSource = {
  id: 'rotateToBalance',
  label: 'What a Rotation Changes',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:rotateToBalance',

  surface: {
    definition:
      'A rotation swaps a parent with one of its children and hands one branch to a new parent, lowering the tree while the in-order sequence of keys stays exactly as it was.',
    exemplarKeywords: [
      'tree rotation',
      'left rotation',
      'right rotation',
      'rotate a binary search tree',
      'pivot goes down child comes up',
      'in-order order preserved',
      'rebalancing by rotation',
      'why rotation is safe',
      'constant number of pointer changes',
    ],
  },

  briefing: {
    observable: [
      'Each node sits at a horizontal position fixed by its value, so left-to-right on screen is the sorted order before anything happens.',
      'The first pass writes h and a signed Δ above every node and marks the one outside the range with a ring and the alert colour, while a caption names that node and its balance factor.',
      'The turn is animation, not a redraw: the pivot slides down, the rising child slides up into its place, and the two edges that change are drawn in a highlight colour — one fading out where it detached, one fading in where it reattached.',
      'Through that whole motion no node moves sideways. Only depth changes, and that is visible frame by frame rather than asserted.',
      'Measuring again afterwards puts every badge back inside the range, and a dashed axis with the values in ascending order appears along the bottom while the closing caption states the height dropping from 4 to 3 and the in-order sequence staying the same.',
    ],

    screen: {
      affordances: [
        'Four steps play on their own and then stop — measure, turn, measure again, conclude.',
        'Two buttons: Replay, and a step button. The first press puts the tree back to its pre-turn arrangement and shows the first step; each further press takes the next one, and after the last it starts over.',
        'One fixed six-node tree with one leaning root, so the same left turn happens the same way every time and the numbers in the captions are always the same numbers.',
      ],
    },

    useWhen: [
      'The reader suspects that a rotation reshuffles keys, so the ordering looks like something that has to be restored afterwards. Here the horizontal positions never move during the turn and the sorted sequence is written out at the end as the same one.',
      'The prose has to say what a rotation physically touches — one node down, one up, one branch handed to a new parent — before it can claim the repair is cheap.',
    ],

    avoidWhen: [
      'The subject is rotation in another sense entirely: rotating a matrix or a shape, rotating bits in a word, rotating an array. Only tree links turn here.',
      'The article is about the double rotation cases, LR and RL, or about the mirrored right turn. This screen performs a single left turn on one fixed tree.',
      'The point is how the case is diagnosed across a whole tree — which node to turn around and which of the four situations it is. The node to turn around is given here, not searched for.',
      'The subject is red-black repair, where recolouring is tried before any turn. Nothing on this screen carries a colour that stands for that invariant.',
    ],

    contrastWith: [
      {
        concept: 'heightBalanceCheck',
        note: 'One finds the node that is out of range, this one is the move that puts it back — the diagnosis and the treatment.',
      },
      {
        concept: 'avlTree',
        note: 'A single turn taken alone against the whole discipline that decides when to turn, how often, and whether one turn is enough.',
      },
      {
        concept: 'recolorThenRotate',
        note: 'Both end in the same structural move, but red-black repair first tries changing colours and only turns when that fails, while here the turn is the only tool.',
      },
    ],
  },
};
