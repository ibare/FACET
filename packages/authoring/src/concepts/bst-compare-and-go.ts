/**
 * bstCompareAndGo 개념 선언.
 *
 * canonical facet 은 `facet:bstCompareAndGo` — 노드 일곱짜리 이진 탐색 트리에서
 * 값 40 을 찾아 내려가는 화면. 커서 링이 좌표로 실제 이동하고, 진 쪽 서브트리는
 * 지워지지 않고 옅어져 자리에 남으며, 캡션이 남은 후보 수를 말한다.
 *
 * 스스로 한 번 끝까지 재생하고 멈춘다. 다시 보기와 한 걸음 버튼만 있고 독자가
 * 값을 넣을 자리는 없다.
 *
 * `bst` 가 이미 이진 탐색 트리 전반을 맡고 있어, id 에 "비교하고 내려간다" 라는
 * 한 걸음을 변별어로 붙였다 — 이 화면이 말하는 것은 탐색 한 걸음의 정체뿐이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bstCompareAndGoConcept: FacetConceptSource = {
  id: 'bstCompareAndGo',
  label: 'One Comparison, One Branch Gone',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:bstCompareAndGo',

  surface: {
    definition:
      'Searching a binary search tree by comparing the target against one node at a time, each comparison picking a side and dropping the opposite subtree from the candidates.',
    exemplarKeywords: [
      'binary search tree search',
      'BST lookup',
      'compare and go left or right',
      'halving the search space',
      'discarding a subtree',
      'descending one level per comparison',
      'why tree search is fast',
      'number of comparisons to find a key',
      'logarithmic lookup',
    ],
  },

  briefing: {
    observable: [
      'A cursor ring travels from node to node by actually moving across the picture, one level down for each comparison — three comparisons in all, 50 then 30 then 40.',
      'The caption states the comparison in full at each step, in the form "40 < 50 — smaller, go left", so the direction is read off the numbers rather than asserted.',
      'The subtree that loses a comparison is not erased. It fades and stays where it was, marking itself as out of the running while remaining part of the tree.',
      'After each fade the caption reports how many candidates are left: seven nodes narrow to three, then to one.',
      'The final comparison lands on an equal value and the node it stops at is marked as the match.',
    ],

    screen: {
      affordances: [
        'The screen runs the whole search on its own and stops on the match, so it delivers its point with nothing clicked.',
        'Two buttons remain afterwards: one replays the search from the start, the other walks it one comparison at a time for a reader who wants to stop on a single fade.',
        'The tree and the key being sought are fixed — seven values from 50 down to the leaves, looking for 40. There is no field for supplying a different key.',
      ],
    },

    useWhen: [
      'The prose has claimed that a lookup throws away half the tree and the reader takes that as a rough estimate. Here the surviving candidate count is stated after every comparison — seven, three, one — so the claim is settled by counting rather than by assertion.',
      'The argument is heading toward height as the price of a search, and the single downward step has to be beyond question before anything about depth can rest on it.',
    ],

    avoidWhen: [
      'The article is about inserting into or deleting from a search tree. Only a lookup happens here, and nothing on screen changes the tree.',
      'The subject is a search that fails. The walk here ends on a value that is present, so a miss and its stopping condition are never shown.',
      'The article is about rotations or rebalancing. The tree here is fixed and never changes shape.',
      'The point is binary search over a sorted array. The halving is the same idea but there are no indices or midpoint arithmetic on screen to point at.',
    ],

    contrastWith: [
      {
        concept: 'bst',
        note: 'Same ordering rule, different scope: this is one comparison and what it costs the losing side, while the broader concept covers building, changing and measuring the whole structure.',
      },
      {
        concept: 'array',
        note: 'Binary search over a sorted array halves the same way but reaches its next candidate by arithmetic on an index, not by following a stored link.',
      },
      {
        concept: 'bstDegenerate',
        note: 'The number of comparisons a search takes depends on the shape of the tree, and the shape is decided by the order the values arrived in.',
      },
    ],
  },
};
