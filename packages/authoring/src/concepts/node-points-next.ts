/**
 * nodePointsNext 개념 선언.
 *
 * canonical facet 은 `facet:nodePointsNext` — 주소 축 위에 흩어진 노드 셋을 놓고,
 * 각 노드가 값 옆에 쥔 주소를 따라가면 순서가 드러나는 것을 보이는 stage view.
 *
 * 스스로 재생하고 멈춘다. mount 즉시 여덟 걸음을 자동으로 밟고, 그 뒤에는 곱씹는
 * 사람만 한 걸음씩 되짚는다. 누르지 않아도 화면은 할 말을 마친다.
 *
 * 변별어를 붙인 이유: "노드" 는 트리·그래프·리스트가 모두 쓰는 말이라 id 를
 * `node` 로 두면 봉투가 그 넓이를 물려받는다. 여기서 말하는 것은 노드 하나가
 * **다음 노드의 주소를 값 옆에 함께 담는다** 는 사실 하나다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const nodePointsNextConcept: FacetConceptSource = {
  id: 'nodePointsNext',
  label: 'What a Node Holds Beside Its Value',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:nodePointsNext',

  surface: {
    definition:
      'A node stores the address of the next node alongside its own value, so the sequence comes from those stored addresses rather than from where the nodes sit.',
    exemplarKeywords: [
      'next pointer',
      'node structure',
      'what a node stores',
      'pointer field',
      'address of the next node',
      'null terminator',
      'head pointer',
      'per-node overhead',
      'scattered in memory',
      'reference field',
    ],
  },

  briefing: {
    observable: [
      'The three nodes are laid on an address axis at 0x0100, 0x0180 and 0x0240, and the empty distance between them is written out in bytes — so the left-to-right arrangement on screen is address order, which turns out not to be reading order.',
      'Each box is cut into two named compartments, value and next. The next compartment of the last node holds null, and the compartment widths are drawn to the declared split of the eight bytes: four for the value, four for the address.',
      'head arrives from outside the row carrying an address and settles above the first node — the entry point is a held address, not one of the boxes.',
      'Following a link is drawn as a copy of the address flying out of the next compartment and landing on the node it names, while the original stays written in the compartment.',
      'The last node\'s null slides sideways and stops against a short wall, and the values then drop one by one into a labelled order lane, arriving 12, 5, 8 — which is not the left-to-right order of the boxes above.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole sequence on its own and stops. Nothing has to be clicked for it to finish what it is saying.',
        'Two buttons: Replay, and Step for walking the same sequence one beat at a time. Step is worth offering because the gap between the address order on the axis and the order the values arrive in is easy to miss at speed.',
        'The addresses and the byte gaps are consistent with the declared node size, so a reader who checks the arithmetic on screen will find it holds.',
      ],
    },

    useWhen: [
      'The prose has stated that a linked list keeps its order in the links, and the reader still pictures the nodes sitting next to each other in memory. Putting real addresses under the boxes and then arriving at a different order is what dislodges that picture.',
      'The reader is about to be told what a node costs to keep, and needs to see that the address stored beside the value occupies room of its own.',
    ],

    avoidWhen: [
      'The article is about a doubly linked list. Every node here carries one address and there is nothing pointing backwards.',
      'The subject is pointer arithmetic, allocation, or how a heap hands out addresses. The addresses here are fixed data used to show ordering, and nothing is allocated or freed.',
      'The point is walking a list to reach a particular element, or what that walking costs. The links are followed here only to reveal that an order exists.',
      'The article is about tree or graph nodes. A node here holds exactly one outgoing address and the chain ends.',
    ],

    contrastWith: [
      {
        concept: 'linkedListSingly',
        note: 'Both are about a chain held together by stored references; this one stops at what a single node contains, before any operation is performed on the chain.',
      },
      {
        concept: 'indexAddressCalc',
        note: 'Two ways of knowing where an element is: computed from a base and an index, or read out of the previous element.',
      },
      {
        concept: 'array',
        note: 'An array pays nothing per element for ordering because position carries it; here every node pays for an address so that position does not have to.',
      },
    ],
  },
};
