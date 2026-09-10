/**
 * dijkstra 개념 선언.
 *
 * canonical facet 은 `facet:dijkstra` — 정점 여섯과 무방향 간선 아홉짜리 그림
 * 왼쪽, 굳은 차례를 한 줄씩 적는 기록판 오른쪽, 훑기 · 굳힘 · 줄인 값 세 카운터,
 * 그리고 여섯 언어로 펼쳐지는 코드 패널을 갖춘 완결형이다.
 *
 * ── 묶음 안에서 갈라 둔 자리
 *
 * 이 개념이 지는 것은 **한 출발점에서 모든 정점까지의 답이 나오기까지의 절차
 * 전체와 그 산출물** 이다 — 확정된 거리, 부모를 따라 생기는 최단 경로 나무,
 * 그리고 고르는 일을 펼쳐 쓴 대가인 O(V²).
 *
 * 굳혀도 되는 까닭 하나는 `pickNearestUnsettled`, 적힌 수가 내려가는 일은
 * `relaxShorterPath`, 그 전제가 깨지는 자리는 `negativeEdgeBreaks` 가 맡는다.
 * 넷이 같은 알고리즘을 다루므로 definition 의 무게중심을 서로 다른 데 두었다.
 *
 * 변별어를 붙이지 않았다. "Dijkstra" 는 이 알고리즘 하나만 가리키는 이름이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const dijkstraConcept: FacetConceptSource = {
  id: 'dijkstra',
  label: 'Dijkstra (Single-Source Shortest Paths)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:dijkstra',

  surface: {
    definition:
      'Single-source shortest paths over a graph with non-negative weights, producing a final distance and a predecessor route for every vertex from one starting point.',
    exemplarKeywords: [
      'Dijkstra',
      "Dijkstra's algorithm",
      'single-source shortest path',
      'SSSP',
      'shortest route on a weighted graph',
      'shortest path tree',
      'route planning and travel time',
      'network latency routing',
      'link-state routing',
      'priority queue versus a linear scan',
      'O(V^2) shortest path',
    ],
  },

  briefing: {
    observable: [
      'The graph sits on the left and a ledger on the right; a vertex only reaches the ledger the moment it is fixed, and from then to the end of the run its number never changes again.',
      'Numbers on the left do change while a vertex is still outside the ledger — vertex 3 reads 22 after vertex 1 is fixed and then drops to 20 after vertex 2 is fixed.',
      'The two states are told apart by paint rather than by caption: an outline-only circle is still provisional, a filled circle is fixed, and the route edges follow the same rule with dashes and solid strokes.',
      'A vertex nothing has reached yet carries an infinity mark instead of a number, so the reader can see the difference between "no route known" and "a long route known".',
      'The shortest route to vertex 4 is 0−2−5−4 at 20 and it uses three edges, while the two-edge route 0−2−3−4 comes to 26 — the picture makes fewer hops and shorter distance visibly different things.',
      'The Scans counter ends at 36 for six vertices, which is six sweeps of six, so the cost of finding the nearest one is a number on screen rather than a claim.',
      'The Shortened counter ends at seven: most of the edges that get examined confirm the existing number instead of lowering it.',
      'The code panel holds an explicit loop over every unfixed vertex to find the smallest, and the highlighted line tracks whichever step the picture is playing.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset, and a speed slider. Stepping is how the reader catches one edge being examined.',
        'The code panel starts empty. The reader clicks "+ Add language" and picks from Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side.',
        'The graph, the source vertex and the nine weights are fixed, so the article can name vertex 3 dropping from 22 to 20 and count on the reader seeing it.',
        'The Scans counter is the place to point when the article turns to cost — it is read after the run, against the six vertices in the picture.',
      ],
    },

    useWhen: [
      'The prose has stated the rule — fix the nearest one that is not fixed yet, then loosen its neighbours — and the reader needs to see that the two halves alternate rather than happen in separate passes, because the ledger grows one line at a time while the left side keeps shifting.',
      'The article claims the number of edges on a route is the wrong thing to count once edges carry weights. Vertex 4 being reached faster by three edges than by two settles that without an argument.',
      'The reader believes the selection is done by some machinery they have not been told about. The loop that walks all remaining vertices, with its sweep count ending at thirty-six, shows the selection is plain work and not a black box.',
    ],

    avoidWhen: [
      'Any weight in the article can be negative — a refund, a discount, a reversed currency leg. The whole run here assumes the fixed number is final.',
      'The subject is distances between every pair of vertices rather than from one origin. Everything on screen hangs off a single source.',
      'The article is about an estimate of the remaining distance steering the search toward a goal. Nothing here looks ahead; the choice is made from what is already known.',
      'The graph in the article is unweighted and the answer is a number of hops. Weights are the reason this screen exists.',
      'The subject is the heap that a fast implementation uses — its layout, its decrease-key, its complexity. The selection here is written out as a sweep instead.',
    ],

    contrastWith: [
      {
        concept: 'pickNearestUnsettled',
        note: 'That one argues why a single vertex may be committed to; this one runs the commitments to the end and shows what they add up to.',
      },
      {
        concept: 'relaxShorterPath',
        note: 'The update of one recorded number seen close up, against the whole alternation of choosing and updating until nothing is left.',
      },
      {
        concept: 'negativeEdgeBreaks',
        note: 'The same procedure with its assumption removed — useful right after this, when the reader asks what the non-negative requirement is actually protecting.',
      },
      {
        concept: 'bfs',
        note: 'Both spread outward from one origin, but one measures in hops and the other in accumulated weight, and only the weighted one has to reorder its frontier.',
      },
    ],
  },
};
