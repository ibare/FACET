/**
 * unionByRank 개념 선언.
 *
 * canonical facet 은 `facet:unionByRank` — 자리 다섯을 나무로 그리고 네 번
 * 합치면서, 두 뿌리의 랭크를 견주어 어느 쪽을 아래로 넣을지 고르는 순간만
 * 확대해 보이는 조각이다. 세로 층이 곧 키라 고르기의 결과가 그림에 바로 선다.
 *
 * 스스로 재생하고 멈춘다. 네 번의 합치기를 자동으로 마친 뒤, 한 걸음 단추를
 * 누르면 처음으로 되감아 견줌 / 붙임 / 키 늘어남을 한 걸음씩 다시 짚는다.
 *
 * 변별어를 붙인 이유: `rank` 는 순위·정렬·행렬에서 모두 쓰이는 말이라, 어느
 * 연산에서 쓰이는 랭크인지 id 가 먼저 못박아야 한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const unionByRankConcept: FacetConceptSource = {
  id: 'unionByRank',
  label: 'Union by Rank',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:unionByRank',

  surface: {
    definition:
      'When two disjoint sets merge, the root of the shallower tree is linked under the root of the deeper one, using a rank held per root, so the merged tree seldom gets taller.',
    exemplarKeywords: [
      'union by rank',
      'union by size',
      'weighted union',
      'attach the smaller tree',
      'rank array',
      'which root goes under',
      'tree height in union-find',
      'avoid long chains',
    ],
  },

  briefing: {
    observable: [
      'Five nodes are merged four times, and each merge is shown in three moments: the two roots being compared, the losing subtree moving, and where needed the height going up.',
      'A rank number rides on each root as a small badge, and it disappears from a node the moment that node stops being a root — the number only means something at the top.',
      'Depth is drawn as a vertical level, so the height of a tree is literally how far down the picture it reaches, and the rank badge on the root agrees with it.',
      'The losing root does not vanish and reappear: its whole subtree slides across and down into place under the winner, so what moves is a group and not a single node.',
      'The first three merges are all between equal ranks, and each time the caption says the height must grow by one — the badge pops as the number changes. Equal ranks leave no better choice.',
      'The fourth merge is between a rank 0 root and a rank 2 root, the lower one goes under, and the caption states that the height stays; the picture reaches no further down than before.',
    ],

    screen: {
      affordances: [
        'The screen runs the four merges on its own and stops on a caption saying the merges are done.',
        'Two buttons: Replay, and Step for taking the merge moments one at a time. The first Step after the automatic run returns everything to five separate nodes and starts again.',
        'The pairs to merge are fixed and run in the same order every time; the reader chooses neither the order nor which root wins.',
      ],
    },

    useWhen: [
      'The prose describes merging as setting one parent pointer, and the reader concludes the two arguments are interchangeable; the moment two roots meet is where that turns out to be a decision with a lasting price.',
      'A rank or size counter is about to appear next to the parent array in pseudocode, and the reader needs to see the one place it is read and what it settles there.',
    ],

    avoidWhen: [
      'The article is about ranking things — leaderboards, sort order, a RANK window function in SQL, or PageRank. The rank here is a bound on tree height and orders nothing.',
      'The subject is the rank of a matrix or of a statistical variable. The word matches and the topic does not.',
      'The article is about the walk to the representative or what one lookup costs. What is on screen is the choice made while merging, and the height that choice leaves behind.',
      'The point is that repeated lookups get cheaper over time. Nothing here changes any pointer after a merge is finished.',
    ],

    contrastWith: [
      {
        concept: 'pathCompression',
        note: 'Two different moments in the same structure: this one decides which root goes underneath while two groups are being merged, the other rewires a path after a lookup has already climbed it.',
      },
      {
        concept: 'unionFind',
        note: 'One rule about merging, against the whole structure, where this rule is one of several that can be switched on and measured against each other.',
      },
      {
        concept: 'rotateToBalance',
        note: 'Both keep a tree from getting tall, but a search tree rearranges nodes after an insert to restore a shape, while this one only chooses an orientation at the moment two trees meet and never moves anything afterwards.',
      },
    ],
  },
};
