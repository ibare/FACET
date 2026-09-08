/**
 * avlTree 개념 선언.
 *
 * canonical facet 은 `facet:avlTree` — 트리 무대 + 캡션 줄 + 높이 칸 + 마지막
 * 경우 칸 + 네 개의 계수기 + 코드 패널.
 *
 * mount 직후 여덟 키를 넣는 자동 시연을 돌린 뒤 멈추고 입력을 기다린다. 독자는
 * 키를 적어 넣기 · 찾기 · 빼기를 몰아 걸 수 있다. 그래서 이 화면의 몫은 한 주장을
 * 매듭짓는 것이 아니라 균형을 지키는 값 — 회전이 몇 번 드는지, 넣기와 빼기가 왜
 * 다른지 — 을 실제로 만들어 보이는 것이다.
 *
 * 코드 패널은 재균형 함수를 보이지만 재생에 맞춰 줄을 짚지는 않는다. 붙박이
 * 참조로 읽어야 하므로 affordances 에 그대로 적었다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const avlTreeConcept: FacetConceptSource = {
  id: 'avlTree',
  label: 'AVL Tree',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:avlTree',

  surface: {
    definition:
      'A binary search tree that measures the height difference at each node on the way back from an insertion or a deletion and rotates wherever that difference exceeds one.',
    exemplarKeywords: [
      'AVL tree',
      'self-balancing binary search tree',
      'balance factor',
      'LL LR RL RR cases',
      'single rotation and double rotation',
      'rebalance after insert',
      'rebalance after delete',
      'height-balanced tree',
      'guaranteed logarithmic height',
      'AVL versus red-black',
    ],
  },

  briefing: {
    observable: [
      'Descending, each comparison flashes the node being weighed and the caption under the tree says which way it sends the key.',
      'Nothing is measured on the way down. Only after the new key settles at a leaf do the h and Δ badges appear one node at a time, following the path back upward — the order of those badges is the argument that measuring happens on the return.',
      'A node whose Δ leaves the range turns to the alert colour and the caption names the situation by its letters, LL, LR, RL or RR, together with the reason: the same lean twice takes one turn, a bent lean takes two.',
      'When it takes two, the inner turn happens first and is captioned separately from the outer one, so a double rotation is visibly one repair made of two moves rather than two repairs.',
      'Horizontal positions are fixed by key order, so every turn moves nodes up and down but never sideways.',
      'The Last case panel keeps the letters of the most recent situation after the caption has moved on, and the Height panel reports the current height beside the lowest a tree with that many keys could have.',
      'Four counters run along: Keys, Single, Double and Compares. Single and double turns are counted apart, and a double turn adds one to Double rather than two to Single.',
      'Removing a key measures at every node on the way back to the root rather than stopping at the first repair, so a single removal can spend more turns than any single insertion did.',
    ],

    screen: {
      affordances: [
        'The reader drives this one. Eight keys are inserted on mount in an order that runs into both a single turn and a double turn, and then it waits.',
        'The controls are one key field plus Insert, Search, Remove and Reset. Reset replays the same eight-key demonstration rather than emptying the tree.',
        'The way to produce a chosen situation is to type keys that lean: an ascending run forces a same-side lean, while a key that lands between the last two forces a bent one.',
        'The code panel starts empty. The reader clicks "+ Add language" and picks from Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side. It holds the rebalance function as a fixed reference — the code stays still while the tree animates.',
      ],
    },

    useWhen: [
      'The price of staying low is the thing the reader has to see for themselves: keys typed in a leaning order make insertions pay for a repair as they go, and removing keys from the same tree charges again at each level on the way back to the root.',
      'The article has claimed that a same-side lean takes one turn and a bent lean takes two. Producing each situation from typed keys is what turns those four letter pairs from a table into something the reader can predict before pressing Insert.',
    ],

    avoidWhen: [
      'The article is about red-black trees. The invariant there is a colour rule and the repair often changes colours instead of turning; nothing on this screen carries a colour standing for that.',
      'The subject is a B-tree or another multi-way balanced structure. Every node here holds one key and at most two children, and balance is repaired by turning rather than by splitting.',
      'The article uses "balanced tree" to mean a completely filled shape — a heap, or a tree packed into an array by index. That balance is about the shape being full, not about a height difference maintained by rotation.',
      'The point is a plain binary search tree, including how badly it degrades on sorted input. Here the degradation is repaired as it appears, so the long chain never gets to form.',
    ],

    contrastWith: [
      {
        concept: 'bst',
        note: 'The same ordering and the same descent; the difference is that this one measures on the way back up and repairs, so the shape it reaches does not depend on the order keys arrived in.',
      },
      {
        concept: 'redBlackTree',
        note: 'Two ways to keep a search tree low: a height difference checked at every node and repaired strictly, against a colour rule that tolerates a taller tree in exchange for fewer repairs.',
      },
      {
        concept: 'heightStaysLow',
        note: 'One is the bound itself — why a balanced tree cannot get tall — and this is the machinery that pays for the bound on every insertion and deletion.',
      },
    ],
  },
};
