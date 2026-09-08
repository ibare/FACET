/**
 * parentTwoChildren 개념 선언.
 *
 * canonical facet 은 `facet:parentTwoChildren` — 자리 하나에서 시작해 아래로
 * 둘씩 갈라지는 것을 보이고, 자식이 하나뿐인 자리에서도 두 칸이 함께 열려
 * 채워지지 않은 쪽이 점선으로 남는 것, 그리고 그 하나뿐인 자식을 빈 칸으로
 * 밀어 보면 되돌아오는 것까지 보이고 멈추는 화면이다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * 변별어를 붙인 이유: "이진 트리" 라는 이름만으로는 탐색 트리 · 균형 트리 ·
 * 순회처럼 그 위에 얹히는 것들과 갈리지 않는다. 이 개념이 다루는 것은 자리의
 * 개수와 이름 하나뿐이다 (C4 명명 규칙 2).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const parentTwoChildrenConcept: FacetConceptSource = {
  id: 'parentTwoChildren',
  label: 'Left and Right: Two Named Child Positions',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:parentTwoChildren',

  surface: {
    definition:
      'A binary tree gives each node at most two children held in two distinct named positions, left and right, which carry identity and cannot be exchanged.',
    exemplarKeywords: [
      'binary tree',
      'left child and right child',
      'branching factor of two',
      'node degree',
      'leaf',
      'tree height',
      'ordered children',
      'empty child slot',
      'null child',
    ],
  },

  briefing: {
    observable: [
      'It starts from a single position and grows: children are not drawn into place but ride outward on branches that extend downward from the parent, so branching reads as an action.',
      'Every position that opens is stamped L or R, and the stamp appears whether or not a value ever arrives there.',
      'One node receives only a single child, and both positions still open — the unfilled one stays behind as a dashed outline, present but empty.',
      'The last step pushes that lone child toward the empty position on the other side and it springs back rather than settling there, so the two sides are shown to be non-interchangeable by attempting the exchange.',
      'The finished picture has six nodes, five branches and three leaves, with the deepest leaf two levels below the top.',
    ],

    screen: {
      affordances: [
        'The screen grows the whole tree on its own and stops with the rejected move already undone.',
        'Two buttons: Replay, and a step control for taking one split at a time, which is the way to stay on the node that gets only one child.',
        'The tree shape is fixed, so the article can refer to the node with a single child by name.',
      ],
    },

    useWhen: [
      'The text says a node has "at most two children" and the reader hears an unordered pair of up to two. The empty position that stays open beside a lone child, and the push toward it that fails, is what makes the two sides count as different places.',
      'A rule that attaches meaning to a side is about to be introduced, and it is meaningless until the reader accepts that a child cannot simply be moved to the other side without producing a different tree.',
    ],

    avoidWhen: [
      'The article is about a structure whose nodes hold many keys and many children at once. The count of two is the claim here.',
      'The subject is which side a value belongs on by comparison. The positions here carry names but no ordering rule, and no values are compared.',
      'The point is the order in which a tree is visited. Nothing here walks the finished tree.',
      'The article is about rebalancing — rotations, recolouring, or keeping the height down. The shape here never changes after it is grown.',
    ],

    contrastWith: [
      {
        concept: 'nodeHoldsMany',
        note: 'Both are about how much fans out from one node; this fixes it at two named positions while the other lets a node carry many keys and many children.',
      },
      {
        concept: 'bstCompareAndGo',
        note: 'This establishes that the two sides are distinct places; the search rule is what later loads those places with meaning.',
      },
      {
        concept: 'depthDoublesCount',
        note: 'Two children per position is the premise; that each level down holds twice as many positions is the arithmetic that follows from it.',
      },
    ],
  },
};
