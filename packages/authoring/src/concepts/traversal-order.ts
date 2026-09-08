/**
 * traversalOrder 개념 선언.
 *
 * canonical facet 은 `facet:traversalOrder` — 나무 한 그루와 그 둘레를 도는 고정된
 * 점선 길, 노드마다 세 접점, 그리고 전위·중위·후위 결과 세 줄. 차례가 바뀌어도
 * 길은 그대로이고 "제 자리를 세는" 표식만 접점 사이를 옮겨 다닌다.
 *
 * 스스로 세 차례를 다 밟고 세 줄을 채운 뒤 멈춘다. 독자가 나무를 바꿀 자리는 없다.
 *
 * id 를 `traversalOrder` 로 둔 이유: 이 화면의 주장은 어느 한 순회가 아니라
 * 셋을 가르는 기준 하나 — 자기 자리를 언제 세는가 — 이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const traversalOrderConcept: FacetConceptSource = {
  id: 'traversalOrder',
  label: 'Preorder, Inorder, Postorder',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:traversalOrder',

  surface: {
    definition:
      'The three depth-first orders for visiting a binary tree, differing only in when a node counts itself relative to descending into its left and right children.',
    exemplarKeywords: [
      'tree traversal',
      'preorder inorder postorder',
      'depth-first traversal of a binary tree',
      'visit order',
      'copying a tree top down',
      'evaluating an expression tree',
      'freeing children before the parent',
      'recursive traversal',
      'traversal output sequence',
    ],
  },

  briefing: {
    observable: [
      'One seven-node tree is drawn with a dotted route around it, laid down before anything moves; the route is walked identically in all three passes and never changes.',
      'Every node carries three contact points — left of it, below it, right of it. A mark sits on one of them, and when the next pass begins the marks slide together to a different contact point. That single slide is the whole difference between the three orders.',
      'A foot travels the route and lingers on the marked contact while skimming past the other two, so the rhythm itself says which touch counts this time.',
      'Stepping on a marked contact drops that node\'s value out of the tree and into the next cell of the current row.',
      'Three labelled rows — preorder, inorder, postorder — each carry a three-slot glyph showing where "self" falls among left and right, and they stay filled side by side at the end: 4 2 1 3 6 5 7, then 1 2 3 4 5 6 7, then 1 3 2 5 7 6 4.',
    ],

    screen: {
      affordances: [
        'All three passes run without being asked and finish with the three rows complete and comparable.',
        'A replay button starts the three passes over; a step button moves one touch at a time, which is the way to catch a node being passed over twice before it is finally counted.',
        'The tree is a fixed seven values with no controls for editing it, so the article can name individual nodes and they will be there.',
      ],
    },

    useWhen: [
      'The reader can recite the three names but not say what actually changes between them, and usually assumes each order walks a different path through the tree. Fixing the path and moving only the counting mark leaves the difference nowhere else to hide.',
      'The article picks one order for a job — copying a structure from the top down, or finishing every child before its parent — and that choice only reads as a choice once the three completed sequences sit next to one another.',
    ],

    avoidWhen: [
      'The subject is level-order or breadth-first traversal. All three orders here are depth-first and a queue-driven sweep never appears.',
      'The article is about traversing a graph, where cycles and a visited set are the difficulty. The route here is the one a tree hands you for free.',
      'The point is specifically why the inorder result of a search tree is ascending. The sorted row appears, but nothing on screen argues the reason for it.',
      'The article is about recursion versus an explicit stack, or about the call stack during a walk. Only the sequence of visits is shown, never the machinery producing it.',
    ],

    contrastWith: [
      {
        concept: 'bstInorderSorted',
        note: 'Same family of walks, different question: this is what separates the three orders, while the other takes the inorder result alone and accounts for its ascending shape.',
      },
      {
        concept: 'parentTwoChildren',
        note: 'Having exactly a left and a right side is what gives each node three moments to be counted at, which is the entire source of the three orders.',
      },
      {
        concept: 'bfs',
        note: 'Breadth-first visits a tree rank by rank instead of diving to the bottom, so it is a fourth order that no choice among these three can produce.',
      },
    ],
  },
};
