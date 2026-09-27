/**
 * handshakeLemma 개념 선언.
 *
 * canonical facet 은 `facet:handshakeLemma` — 한 주장을 말하는 조각(piece) facet.
 * 정점 여섯에 간선 일곱을 하나씩 놓는다. 간선이 놓일 때마다 두 끝 정점의 차수가 하나씩 오르고,
 * 여섯 차수를 그대로 더한 합이 0 → 2 → … → 14 로 2 씩, 간선 수는 1 씩 오른다.
 *
 * ── 묶음 안에서의 자리 (가 · 벡터와 그래프 — 완제품 없음, origin graph-theory)
 *
 * 그래프 조각 둘 가운데 이쪽은 **그래프가 자라며 차수를 센다** — 차수 · 차수의 합 · 간선 수의 두 배 ·
 * 두 끝 낱말을 독점한다. bipartiteColoring 은 다 지어진 그래프를 색으로 가르고 차수를 세지 않는다.
 *
 * 전제: 그래프는 예로 정한 무향 · 단순 그래프다. 한 그래프의 사례가 정리를 증명하지는 않는다 —
 * 까닭(간선 하나는 늘 두 끝을 가진다)이 일반을 받친다. 홀수 차수 정점이 짝수 개라는 따름 정리는 화면이 세지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const handshakeLemmaConcept: FacetConceptSource = {
  id: 'handshakeLemma',
  label: 'Handshake Lemma: Degree Sum Is Twice the Edges',
  canonicalFacet: 'facet:handshakeLemma',

  surface: {
    definition:
      'In an undirected graph every edge adds one to the degree of each of its two endpoints, so the sum of all vertex degrees is always exactly twice the number of edges.',
    exemplarKeywords: [
      'handshake lemma',
      'handshaking lemma',
      'degree sum formula',
      'sum of degrees equals 2|E|',
      'vertex degree',
      'number of odd-degree vertices is even',
      'degree of a vertex in an undirected graph',
      'counting edges by degrees',
      'graph theory basics',
      'double counting',
    ],
  },

  briefing: {
    observable: [
      'Six numbered vertices start with no edges; each shows degree 0, and a "Degree sum" line below reads `1 0 + 2 0 + … + 6 0 = 0`. The caption reads "Vertices: 6 · No edges yet · Degree sum: 0 · Edges: 0".',
      'Seven edges are placed one per step in the order 1–2, 2–3, 1–3, 3–4, 4–5, 3–5, 5–6. As each lands, a token at its middle splits in two and travels to both ends, and the caption names the two changes, for example "Edge 3–4 · degree of 3: 2 → 3 · degree of 4: 0 → 1".',
      'The sum line adds the six current degrees term by term, and "Degree sum" climbs 0, 2, 4, 6, 8, 10, 12, 14 while "Edges" climbs 0 through 7.',
      'Vertex 3 is touched by four edges and its degree alone piles up 1 → 2 → 3 → 4; however the edges bunch, each one still adds exactly two to the sum.',
      'At the end the degrees are 2, 2, 4, 2, 3, 1 and their sum 14 is twice the 7 edges. The graph is an example chosen as undirected with no loops or repeated edges; one example illustrates the lemma, and the reason it always holds is that every edge has two ends.',
    ],

    screen: {
      affordances: [
        'The screen plays eight steps by itself (the first frame counted) and stops after the seventh edge.',
        'A Replay button and a playback strip sit below; dragging through the steps shows the degree sum and the edge count moving in lockstep, one by two and the other by one.',
      ],
    },

    useWhen: [
      'The article states that the degrees add up to twice the number of edges and the reader wants to see why, not just check it. Watching each edge split into two degree increments is the reason in motion.',
      'The article uses the corollary that the number of odd-degree vertices is even, or counts edges from a degree list, and needs the underlying double count established first.',
    ],

    avoidWhen: [
      'The graph is directed and the article is about in-degree or out-degree. Edges here have no direction.',
      'The subject is the TCP or TLS handshake. This is the graph-theory lemma named after people shaking hands.',
      'The article is about coloring, bipartite graphs or traversal order. No colors or visiting order appear.',
    ],

    contrastWith: [
      {
        concept: 'indegreeZeroFirst',
        note: 'In a directed graph an edge raises one in-degree and one out-degree, and a vertex with in-degree zero may go first; in an undirected graph an edge raises two degrees and the claim is about their total.',
      },
      {
        concept: 'bipartiteColoring',
        note: 'Both are about a small undirected graph. The lemma counts how edges attach to vertices, whatever the shape; bipartiteness is a property of the shape — whether the vertices split into two sides.',
      },
      {
        concept: 'inclusionExclusion',
        note: 'Both hinge on something being counted twice. Inclusion–exclusion subtracts the double count to get the true size; the handshake lemma keeps the double count, because each edge genuinely belongs to two degrees.',
      },
    ],
  },
};
