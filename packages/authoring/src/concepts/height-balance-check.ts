/**
 * heightBalanceCheck 개념 선언.
 *
 * canonical facet 은 `facet:heightBalanceCheck` — 고정된 6노드 트리 위에서
 * 균형 인수가 잎에서 뿌리까지 셈해 올라오는 것만 보이고 멈추는 화면이다.
 *
 * 화면에는 문장 캡션이 하나도 없다. 말하는 것은 전부 트리 위에 적히는 수다 —
 * 노드 아래 `h N`, 그 아래 `Δ ±N` 상자, 그리고 범위를 벗어난 상자 하나의 색.
 * 그래서 observable 은 view 코드(height-balance-check-stage.ts)가 실제로
 * 그리는 것만 옮겼다.
 *
 * 자동 재생으로 여섯 자리를 다 셈한 뒤 멈추고, 이후에는 걸음 단추가 한 자리씩
 * 다시 짚는다. 독자가 값을 넣는 자리는 없다.
 *
 * 변별어를 붙인 이유: "balance" 는 AVL 전체 · 레드블랙의 검은 높이 · 힙의 완전
 * 이진 트리까지 자칭하는 말이라, 이 개념이 다루는 것이 "한 자리에서의 높이 차"
 * 임을 id 가 먼저 특정해야 한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const heightBalanceCheckConcept: FacetConceptSource = {
  id: 'heightBalanceCheck',
  label: 'Balance Factor at Every Node',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:heightBalanceCheck',

  surface: {
    definition:
      'The balance factor of a node is its left subtree height minus its right subtree height, counted from the leaves upward and judged separately at every node.',
    exemplarKeywords: [
      'balance factor',
      'height difference',
      'left height minus right height',
      'is this tree balanced',
      'subtree height',
      'unbalanced node',
      'checking balance node by node',
      'post-order height computation',
      'within -1 0 +1',
    ],
  },

  briefing: {
    observable: [
      'Every missing child is drawn as a dashed circle holding 0, so an empty side is a value that takes part in the subtraction rather than a gap that is skipped.',
      'One node at a time, two small tokens carrying the left and right heights travel upward from the child places into the node — the numbers arrive by moving, so the reader sees where each height came from.',
      'The node then keeps two things written under it: h with its own height, and a boxed Δ with the signed difference. Those written numbers are the whole account the screen gives.',
      'The order is forced by the shape: leaves first, root last. A node cannot be written until both of its children already carry their heights.',
      'In the tree shown, one node lands at Δ -2 and its box is marked in the alert colour, while the root above it reads Δ -1 and is left unmarked — a sound root sitting directly above an unsound node.',
    ],

    screen: {
      affordances: [
        'The screen counts all six places on its own and then stops, so it finishes its statement without a click.',
        'Two buttons: Replay, and a step button that walks one place at a time. The first press clears the written numbers back to the bare tree and shows the first place again, then each further press adds the next; after the last one it starts over.',
        'The tree is fixed at six values, so every replay measures exactly the same shape and reaches the same two numbers at the root and at the node below it.',
      ],
    },

    useWhen: [
      'The prose has called a tree balanced, and the reader takes that as a property of the whole tree. Here the subtraction happens at each place on its own, and a root inside the range is shown sitting above a node outside it.',
      'The reader needs the balance factor to be a quantity that gets computed rather than a label that gets assigned — the two child heights arrive from below and are subtracted in plain view, empty sides counted as zero.',
    ],

    avoidWhen: [
      'The article is about repairing the imbalance. This screen ends once the numbers are written; nothing moves to fix what the numbers reported.',
      'The subject is the black height of a red-black tree. That is also a per-node count checked from below, but it counts nodes of one colour along paths rather than comparing two subtree heights.',
      'The point is the asymptotic height of a tree — log n, why searching costs what it costs. The number here is the difference of two heights at one node, not the height of the tree.',
      'The article calls a heap or an array-backed tree balanced. That means the shape is filled level by level, which no subtraction on this screen speaks to.',
    ],

    contrastWith: [
      {
        concept: 'rotateToBalance',
        note: 'Measuring against repairing: one settles where the imbalance is, the other is the move that removes it.',
      },
      {
        concept: 'avlTree',
        note: 'This is the single check that a self-balancing tree runs at each node; that concept is the whole operation the check sits inside, repeated over many keys.',
      },
      {
        concept: 'bstDegenerate',
        note: 'A degenerate tree is what happens when nobody checks; this is the number that would have caught it at the first node that went out of range.',
      },
    ],
  },
};
