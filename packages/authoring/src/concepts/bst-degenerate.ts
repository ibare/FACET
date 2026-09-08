/**
 * bstDegenerate 개념 선언.
 *
 * canonical facet 은 `facet:bstDegenerate` — 같은 값 여섯 개를 두 순서로 넣어
 * 두 나무를 나란히 기르고, 둘 다에서 같은 값을 찾아 실제 비교 횟수를 센다.
 * 열은 값의 순위로 고정하고 행만 실제 깊이를 따르므로 키 차이가 곧 모양 차이다.
 *
 * 스스로 두 나무를 기르고 찾아본 뒤 결론 캡션에서 멈춘다. 독자가 삽입 순서를
 * 정할 자리는 없다.
 *
 * id 에 `degenerate` 를 붙인 이유: "이진 탐색 트리" 는 이미 넓은 개념이 맡고
 * 있고, 이 화면이 말하는 것은 삽입 순서가 만든 편향과 그 비용 하나다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bstDegenerateConcept: FacetConceptSource = {
  id: 'bstDegenerate',
  label: 'Insertion Order Skews the Tree',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:bstDegenerate',

  surface: {
    definition:
      'The order values arrive in decides the height of a binary search tree: sorted input grows a single chain, while interleaved input keeps the tree shallow.',
    exemplarKeywords: [
      'degenerate tree',
      'skewed binary search tree',
      'sorted input worst case',
      'tree becomes a linked list',
      'insertion order matters',
      'height versus number of nodes',
      'worst case O(n) search',
      'why balancing is needed',
      'unbalanced tree cost',
    ],
  },

  briefing: {
    observable: [
      'Two trees are built side by side from the same six values, each panel headed by the order its values arrive in — 10 to 60 in sequence on one side, 40, 20, 60, 10, 30, 50 on the other.',
      'They grow together, one value at a time, each placement preceded by the comparisons that chose its side; nodes swell into existence and edges stretch from parent to child rather than simply appearing.',
      'Columns are pinned to the rank of the value, identical in both panels, so only vertical depth differs — the difference in shape is literally a difference in height and nothing else.',
      'Once both are grown, the same value is searched in each and the comparisons are counted for real: the chain reports height 6 and 6 comparisons, the spread-out tree height 3 and 2.',
      'The closing caption puts both readings in one sentence, so the identical contents and the unequal cost are stated together.',
    ],

    screen: {
      affordances: [
        'The whole demonstration — both trees growing, both searches, the closing comparison — plays through unprompted and ends on the result.',
        'A replay button runs it again and a step button walks it one move at a time, which is how a reader catches the moment the sorted input turns yet another right turn into extra depth.',
        'The two insertion orders are fixed and printed above their trees, so the article can quote them directly.',
      ],
    },

    useWhen: [
      'The article mentions the worst case of a search tree and the reader hears it as an unlikely accident. Two trees holding identical values, searched for the same key, put six comparisons against two.',
      'Something that keeps trees short is about to be introduced, and the reader has to want it before reading how it works — the gap between the two shapes has to arrive as a counted number rather than as a caution.',
    ],

    avoidWhen: [
      'The article is about how a self-balancing tree repairs a skew. Rotations and rebalancing never happen here; the lopsided tree stays lopsided.',
      'The subject is deletion, or how removals unbalance a tree over time. Only insertions and one lookup per tree happen here.',
      'The article is about average-case analysis over random insertion orders. Two chosen orders are shown, not a distribution.',
      'The point is the worst case of hashing or of another structure entirely. What is on screen is specific to where the comparison rule puts an arriving value.',
    ],

    contrastWith: [
      {
        concept: 'avlTree',
        note: 'This shows the damage that insertion order can do; a self-balancing tree is the machinery that refuses to let it accumulate.',
      },
      {
        concept: 'heightStaysLow',
        note: 'Two answers to how tall a tree of n values gets — the chain here is the ceiling, and a balanced tree is the floor.',
      },
      {
        concept: 'bst',
        note: 'The ordering rule is obeyed identically by both trees here, which is exactly why the rule alone says nothing about what a search will cost.',
      },
    ],
  },
};
