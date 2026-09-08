/**
 * unionFind 개념 선언.
 *
 * canonical facet 은 `facet:unionFind` — 자리 열 개의 가리킴을 나무로 그리고,
 * 규칙 슬라이더(그냥 / 랭크 / 압축 / 둘 다)를 갈아 끼우며 같은 합치기를 되풀이해
 * 값을 견주는 화면이다.
 *
 * 독자 입력을 기다린다. mount 직후 씨앗 짝 다섯을 합쳐 무리를 만들고 멈춘 뒤,
 * 자리 두 개를 넣고 합치기 / 찾기 / 모두 찾기를 누르는 것을 받는다.
 *
 * 변별어를 붙이지 않은 이유: "union-find" 자체가 이미 이 자료구조만 가리키는
 * 이름이라 같은 말을 쓰는 다른 개념이 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const unionFindConcept: FacetConceptSource = {
  id: 'unionFind',
  label: 'Union-Find (Disjoint Sets)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:unionFind',

  surface: {
    definition:
      'A structure that keeps disjoint groups by giving each element one parent pointer, merges two groups by linking their representatives, and answers membership by climbing to that representative.',
    exemplarKeywords: [
      'union-find',
      'disjoint set union',
      'DSU',
      'connected components',
      'Kruskal minimum spanning tree',
      'dynamic connectivity',
      'are these two in the same group',
      'merge two groups',
      'representative of a set',
    ],
  },

  briefing: {
    observable: [
      'Ten slots start out as ten separate groups, then five seeded merges run on mount and leave two chains and three untouched slots.',
      'Vertical position is distance from the root, so the shape of a group is its cost: a slot three levels down is three climbs away from its name.',
      'Each group is drawn in its own colour and each root is outlined thicker and carries a small number beside it — that number is the rank, and it is shown on roots only.',
      'A single find animates the climb slot by slot, and the caption names both ends of each step before moving on.',
      'Two readouts sit under the picture: one reports the hops and finds of the operation just performed, the other the height of the tallest tree. The first one resets at the start of every operation, so it never averages an expensive run together with a cheap one.',
      'The counters in the control bar do the opposite — unions, finds and hops accumulate for as long as the screen is up.',
      'Moving the rule slider replays the same five merges from an empty state under the new rule, and the tallest-tree readout can settle on a different number for input that did not change.',
      'With compression switched on, a find redraws every slot it passed so that each one points straight at the root, and the levels those slots occupied disappear.',
      'Find all sweeps every slot without animating the individual climbs, so what moves is the numbers; with compression on, pressing it a second time comes back far cheaper than the first, and with the rule left on Plain the second sweep costs exactly what the first one did.',
    ],

    screen: {
      affordances: [
        'The reader drives this screen. It merges five seeded pairs on mount, then stops and waits.',
        'The controls are two slot fields, a and b, plus Union, Find a, Find all, a four-position rule slider (Plain, Rank, Compress, Both) and Reset.',
        'Only slot numbers 0 to 9 are accepted, and a union of a slot with itself is ignored.',
        'The slider starts on Plain, so the first thing the reader can build is a long chain; switching rules rebuilds from the seed rather than continuing from the shape already on screen.',
      ],
    },

    useWhen: [
      'The reader has to find out what an optimisation is worth as a number rather than as a promise — the same merges are replayed under each rule and the height and hop readouts are what differ.',
      'The saving being described is one that only shows up across repeated queries, so it takes driving the same sweep twice and reading the second result against the first.',
    ],

    avoidWhen: [
      'The article is about set operations in a language or database — union, intersection, difference of collections. Nothing here combines the contents of two sets; it only records that two groups became one.',
      'The subject is a union type or a tagged union in a type system. The word is the same and the topic is unrelated.',
      'The point is Kruskal or Boruvka as a whole, where the interesting part is sorting edges and rejecting cycles. Only the membership test underneath is on this screen.',
      'The article needs groups to be split again after being merged. Nothing here removes a link once it is made.',
    ],

    contrastWith: [
      {
        concept: 'findRoot',
        note: 'Reaching the representative is the single query this structure is built around; this concept is the whole of it — merging, the choice made while merging, and what those choices cost later.',
      },
      {
        concept: 'unionByRank',
        note: 'One rule about which root goes underneath, against the structure that rule lives in and the other rules it can be combined with.',
      },
      {
        concept: 'pathCompression',
        note: 'Folding the walked path is one of the two optimisations; here it can be switched on and off next to the other one, which is what makes their separate effects measurable.',
      },
    ],
  },
};
