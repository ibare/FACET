/**
 * nodeHoldsMany 개념 선언.
 *
 * canonical facet 은 `facet:nodeHoldsMany` — 자리 넷에 키 아홉을 담은 나무를
 * 그려 놓고, 찾는 값 50 이 자리 안에서 키를 훑다가 키와 키 사이의 틈으로
 * 내려가는 장면 하나만 말하고 멈춘다.
 *
 * 스스로 재생하고 멈추는 화면이다. 자동 재생이 끝난 뒤 한 걸음 버튼으로 같은
 * 걸음을 되짚을 수 있다.
 *
 * 변별어를 붙인 이유: "노드" 는 어느 자료구조에서나 쓰는 말이라 그대로 두면
 * 봉투가 그 넓이를 물려받는다. 이 개념이 말하는 것은 자리 하나가 키를 여럿
 * 담는다는 모양 하나다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const nodeHoldsManyConcept: FacetConceptSource = {
  id: 'nodeHoldsMany',
  label: 'Many Keys in One Node',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:nodeHoldsMany',

  surface: {
    definition:
      'A search node that holds several ordered keys at once, with one downward path in each gap between them, so the choice of direction is made inside the node.',
    exemplarKeywords: [
      'multiway node',
      'branching factor',
      'fan-out',
      'keys per node',
      'order of a B-tree',
      'many children per node',
      'index page entries',
      'scan the keys then descend',
    ],
  },

  briefing: {
    observable: [
      'Four boxes hold nine keys between them, and a line above the drawing says exactly that — nine keys in four nodes.',
      'The keys inside a box are read one at a time from the left, and the caption states each comparison as it happens: 50 > 30 means move to the next key, 50 < 60 means take the gap before it.',
      'The line downward starts from between two keys rather than from the box, so the gap the comparison picked is the thing that leads somewhere.',
      'A marker drops one level once the gap is chosen, and the walk resumes inside the box it lands in.',
      'The search ends on a key cell inside a box, two levels down, having read four of the nine keys.',
    ],

    screen: {
      affordances: [
        'The screen plays the walk on its own and stops: two keys read at the top, a step down through a gap, two more keys read below, and the match.',
        'Two buttons: Replay, and Step for taking the same walk one moment at a time. The value being looked for is fixed at 50 and printed above the tree.',
        'Stepping is worth it at the moment the second key of the top box is read — that single comparison is where the direction is settled, and it passes quickly on its own.',
      ],
    },

    useWhen: [
      'The prose has said a node carries several keys and the reader still pictures one value per node, with the direction chosen between nodes. Here the choosing happens inside one box, key by key, and the way down is a gap in the row.',
      'A fan-out number is about to be used in arithmetic — order, degree, entries per page — and it has to mean something concrete on screen before it becomes a multiplier.',
    ],

    avoidWhen: [
      'The subject is a node with no room left for another key. The keys here are already in place and the walk only reads them.',
      'The article is about why the tree stays short as it fills — levels counted against fan-out. This is one fixed two-level tree, and the counting is not on screen.',
      'The article is about B+Tree — keys held only in the bottom row and those leaves chained for range scans. Keys sit in every box here and the bottom row is not linked.',
      'The point is how the tree was built or kept in shape: insertion order, rebalancing, rotations. This is handed a finished tree.',
    ],

    contrastWith: [
      {
        concept: 'bstCompareAndGo',
        note: 'One comparison against one key sends you left or right; here a row of keys is read and the exit is the gap where the value belongs.',
      },
      {
        concept: 'bTree',
        note: 'This is the shape of a single node held still, while the full structure adds what happens when that node fills up or runs short.',
      },
      {
        concept: 'trie',
        note: 'Both let one node lead to many children, but there the child is picked by the next character of a string, and here by where a value falls among the keys.',
      },
    ],
  },
};
