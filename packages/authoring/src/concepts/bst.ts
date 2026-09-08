/**
 * bst 개념 선언.
 *
 * canonical facet 은 `facet:bst` — 트리 레이아웃 + 비교 HUD + 기울기 게이지 + 코드 패널.
 *
 * 이 시각화의 서명은 `fold` 이벤트다. 비교에서 진 서브트리 **전체** 가 한 프레임에
 * 접히므로, "절반을 버린다" 가 말이 아니라 화면 사건으로 보인다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bstConcept: FacetConceptSource = {
  id: 'bst',
  label: 'Binary Search Tree',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:bst',

  surface: {
    definition:
      'A binary tree keeping every left descendant below its node and every right descendant above it, so each comparison discards one whole subtree.',
    exemplarKeywords: [
      'binary search tree',
      'BST',
      'ordered tree',
      'in-order traversal gives sorted output',
      'logarithmic search',
      'tree height and balance',
      'insert delete search in a tree',
      'successor and predecessor',
      'degenerate tree',
      'self-balancing trees',
    ],
  },

  briefing: {
    observable: [
      'When a comparison decides a direction, the losing subtree folds away in a single frame — the discarded half is not merely ignored, it visibly leaves the screen.',
      'A comparison readout shows the pair being weighed at that moment: the key against the node value, with the operator between them.',
      'A tilt gauge reports h / log2(n+1) — near 1.0 the tree is balanced, at 2.0 it is skewed, at 3.0 it has degenerated into a ladder.',
      'Deletion of a node with two children walks to the successor with a second cursor, so the two cursors on screen are the whole reason that case is harder than the others.',
      'Six counters run along: comparisons, inserts, deletes, hits, misses, duplicates.',
      'The code panel highlights the running phase in step with the animation — compare, descend left or right, reach a leaf, hit, insert, and the delete variants.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset, and a speed slider. Stepping is how the reader catches a single fold.',
        'The code panel starts empty. The reader clicks "+ Add language" and picks from Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side.',
        'The tilt gauge is the place to point when the article turns to why balance matters — a skewed tree shows the number climbing, not just the shape sagging.',
      ],
    },

    useWhen: [
      'The article has reached deletion and is treating it as insertion run backwards, when removing a node that has two children is a different job. Insertions, searches and deletions run on one tree here, so whether the ordering survives a removal turns up in the search that follows it.',
      'The prose counts a failed lookup and a successful one together as the cost of searching. Hits and misses are tallied apart here, so the article can say what a miss costs on its own.',
    ],


    avoidWhen: [
      'The article is about a self-balancing tree (AVL, red-black). This one never rotates, and its tilt gauge only reports the damage rather than repairing it.',
      'The subject is a heap. A heap is also a binary tree but orders parent against children, not left against right — the fold gesture here does not apply.',
      'The article is about hash-based lookup. Comparing the two is fine, but this visualization has no notion of a hash function to point at.',
    ],

    contrastWith: [
      {
        concept: 'hashTableChaining',
        note: 'Ordered comparison versus a computed address. A BST reaches its target by halving; a hash table jumps straight there but loses the ordering a BST keeps for free.',
      },
      {
        concept: 'array',
        note: 'Binary search on a sorted array does the same halving without pointers — the tree buys cheap insertion at the price of the array\'s contiguity.',
      },
    ],
  },
};
