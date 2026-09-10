/**
 * kruskalMst 개념 선언.
 *
 * canonical facet 은 `facet:kruskalMst` — 왼쪽에 간선 열하나가 무게 순으로 줄을
 * 서고, 오른쪽 정점 일곱이 무리 색으로 물들며 하나가 되는 완결형이다. 이은 것 ·
 * 버린 것 · 무게 합 세 카운터와 `ir:kruskal-union` 코드 패널(kruskal · find ·
 * unite)을 갖췄다.
 *
 * ── 묶음 안에서의 자리 (조각 `sortEdgesAvoidCycle` 과 어떻게 갈랐는가)
 *
 * 조각은 **판정 하나** 를 진다 — 집은 간선이 왜 버려지는가. 완제품은 **절차
 * 전체와 그 산출물** 을 진다 — 무엇을 만들려는 것인가(최소 신장 트리), 무리를
 * 무엇으로 세는가(부모 화살표와 뿌리 찾기), 답의 크기는 얼마인가(정점 수 − 1
 * 개의 간선과 무게 합). exemplarKeywords 도 그렇게 갈랐다: 여기에는 이름과
 * 산출물(Kruskal · MST · union-find · 그리디)만 두고, 조각에는 이름 없이
 * "왜 이 간선을 건너뛰는가" 쪽 구어만 둔다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const kruskalMstConcept: FacetConceptSource = {
  id: 'kruskalMst',
  label: "Kruskal's Minimum Spanning Tree",
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:kruskalMst',

  surface: {
    definition:
      'A minimum spanning tree built by ordering every edge by weight and taking them from the lightest, keeping each one unless its two ends already belong to the same component.',
    exemplarKeywords: [
      "Kruskal's algorithm",
      'minimum spanning tree',
      'MST',
      'greedy algorithm',
      'union-find',
      'disjoint set',
      'cheapest way to connect everything',
      'laying cable between towns',
      'sparse graph',
      'total weight of the tree',
      'spanning forest',
      'V minus 1 edges',
    ],
  },

  briefing: {
    observable: [
      'The edges begin in the order they were written and sort themselves into the queue by weight, and because only neighbours trade places, two edges of equal weight keep the order they were written in — which is what decides the shape of the tree when weights tie.',
      'Once the queue is in order the cursor only ever moves downward, so no edge is reconsidered after it has been passed.',
      'Each vertex starts in its own colour, and the colour is the group: joining two vertices spreads one colour across both, and by the end all seven share one.',
      'For every edge taken, the climb from each end up the parent arrows is shown before the verdict, and the two roots it lands on are named.',
      'A discarded edge is pushed out of the queue and fades, so discarding looks like leaving the line rather than merely being unmarked.',
      'For a long stretch several separate coloured groups exist at once and only meet late, so the tree is assembled from pieces scattered across the graph rather than grown outward from one place.',
      'Three counters run in the control bar — how many were joined, how many dropped, and the running total weight — and the joined count comes to rest at one less than the number of vertices.',
      'The code panel starts empty with an Add language button; once a language is picked, the line matching the current step is highlighted, and it holds three routines together — the main loop, climbing to a root, and hanging one root under another.',
      'The climb is never shortened: a vertex keeps pointing where it pointed, so the same walk is made again on the next edge that touches it.',
    ],

    screen: {
      affordances: [
        'Playback controls — play, single step, pause, reset and a speed setting.',
        'It runs on its own from mount; stepping is how to stop between the two roots being named and the verdict that follows, which is the moment the whole algorithm turns on.',
        'The graph is fixed at seven vertices and eleven edges, so an article can name a particular edge, the weight it carries, and whether it survived.',
      ],
    },

    useWhen: [
      'The reader needs to be convinced that a rule this short produces an optimal answer — take the cheapest, skip what is already connected — and wants to watch it apply eleven times without ever reconsidering an earlier choice.',
      'The article claims that the hard part is not choosing edges but knowing whether two vertices are already connected. Watching the climb to a root happen before every verdict is what moves that from a footnote to the centre.',
      'Someone is looking at a finished spanning tree and asking why it has exactly the edges it has; replaying the order in which they were taken, with the discarded ones leaving the queue, is the account of it.',
      'Equal weights are in play and the reader assumes the tree is unique. The stable ordering here shows the tie being broken by something outside the weights.',
    ],

    avoidWhen: [
      'The subject is shortest paths between two vertices. A minimum spanning tree minimises the total of the edges kept, and the route it leaves between two particular vertices can be far from the cheapest one.',
      'The article is about shortening the climb to a root — path compression, ranks, or the near-constant cost that follows. The climb here is deliberately left long so the code panel keeps its subject.',
      'The point is a directed graph, flows, or edges that must be traversed one way. Every edge here is undirected and is either kept or dropped.',
      'The subject is a spanning tree protocol in networking, or a tree data structure being searched. The words overlap and the problem does not.',
      'The article needs a disconnected graph and the forest that results. This one is connected and ends as a single group.',
    ],

    contrastWith: [
      {
        concept: 'sortEdgesAvoidCycle',
        note: 'The accept-or-reject test on its own, against the whole procedure it sits inside — where the ordering comes from, how membership is actually recorded, and what the finished tree weighs.',
      },
      {
        concept: 'primMst',
        note: 'Both end with the same total weight on the same graph, but one grows a single blob outward from a starting vertex while this one collects scattered fragments and merges them.',
      },
      {
        concept: 'unionFind',
        note: 'The structure that answers "already connected?" is used here at its plainest — no ranks, no shortened climbs — because here it is a means and there it is the subject.',
      },
      {
        concept: 'takeBestNow',
        note: 'Taking the cheapest thing available and never revisiting it is the pattern; this is the case where that pattern provably reaches the optimum.',
      },
      {
        concept: 'greedyCanFail',
        note: 'The same short-sighted rule that goes wrong elsewhere is exactly right here, which is what makes the difference between the two worth stating.',
      },
    ],
  },
};
