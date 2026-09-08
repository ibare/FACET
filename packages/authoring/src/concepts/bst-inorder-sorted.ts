/**
 * bstInorderSorted 개념 선언.
 *
 * canonical facet 은 `facet:bstInorderSorted` — 위에 아홉 노드짜리 이진 탐색 트리,
 * 아래에 아홉 칸의 빈 줄. 중위 하나만 걷고, 값이 노드 좌표에서 다음 빈 칸으로
 * 실제로 이동해 내려앉는다.
 *
 * 스스로 아홉 값을 다 내놓고 멈춘다. 독자가 값을 넣을 자리는 없다.
 *
 * id 에 `inorderSorted` 를 붙인 이유: 순회 이름을 그대로 쓰면 세 순회를 견주는
 * 개념과 갈리지 않는다. 이 화면은 중위 하나만 다루고, 그 결과가 왜 오름차순
 * 인가만 말한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bstInorderSortedConcept: FacetConceptSource = {
  id: 'bstInorderSorted',
  label: 'Why Inorder Comes Out Sorted',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:bstInorderSorted',

  surface: {
    definition:
      'Walking a binary search tree left subtree first, then the node itself, then the right subtree, which emits every stored value in ascending order.',
    exemplarKeywords: [
      'inorder traversal',
      'in-order walk gives sorted output',
      'sorted order from a tree',
      'left node right',
      'range query on a search tree',
      'next larger key',
      'tree sort',
      'reading a BST in order',
      'ordering invariant',
    ],
  },

  briefing: {
    observable: [
      'A nine-node tree stands above a row of nine empty cells, and the row is empty from the start so the reader watches it fill rather than reading a finished list.',
      'Standing at a node lights it up and the caption says the left side has to be emptied first — the rule is spoken at the moment it applies, not summarised afterwards.',
      'When a node finally gives up its value, that value travels from the node\'s own position down into the next empty cell; a node that has already spoken settles into a fixed colour.',
      'The root 8 sits in the middle of the picture but leaves sixth of nine, so its place on screen and its place in the row are visibly different things.',
      'The last caption reports that all nine are out, low to high, with the completed row underneath as the evidence.',
    ],

    screen: {
      affordances: [
        'The walk plays through all nine values by itself and stops on the finished row.',
        'Afterwards a replay button starts the walk over, and a step button advances one moment at a time so a reader can stop exactly where a value leaves its node.',
        'The tree is fixed — nine values arranged so that the root is neither first nor last out. Nothing on screen takes a new value.',
      ],
    },

    useWhen: [
      'The reader will accept that a search tree can be read in sorted order but treats it as a fact to memorise. Watching each node hand its value down to the next free cell shows the sorted row being produced by the left-node-right rule itself.',
      'The article leans on sorted output for a range query or for finding the next larger key, and the reader first has to see that where a value sits in the picture says nothing about when it comes out.',
    ],

    avoidWhen: [
      'The article is about choosing among traversal orders, or about what preorder and postorder produce. Only one walk happens here.',
      'The subject is a sorting algorithm such as merge sort or quicksort. Nothing is sorted here; the order was already in the tree and is only being read out.',
      'The article is about the mechanics of implementing a traversal — recursion depth, an explicit stack, threaded or constant-space walks. What is on screen is the order values come out in, not how the walk is coded.',
      'The tree in question is a heap or an unordered binary tree. The ascending row depends on the left-smaller right-larger rule, which those do not keep.',
    ],

    contrastWith: [
      {
        concept: 'traversalOrder',
        note: 'One walk versus the family of walks: this is the inorder result and why it is ascending, while the other is about what separates preorder, inorder and postorder from each other.',
      },
      {
        concept: 'bst',
        note: 'The ordering rule is what makes the sorted read-out possible, so this is the payoff of the invariant the broader concept spends its time maintaining.',
      },
      {
        concept: 'heapProperty',
        note: 'A heap also orders a binary tree, but between parent and children rather than left and right, so walking it yields no sorted sequence.',
      },
    ],
  },
};
