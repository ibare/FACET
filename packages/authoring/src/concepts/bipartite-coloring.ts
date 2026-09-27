/**
 * bipartiteColoring 개념 선언.
 *
 * canonical facet 은 `facet:bipartiteColoring` — 한 주장을 말하는 조각(piece) facet.
 * 정점 일곱 · 간선 아홉의 그래프를 출발 정점 1 에서의 거리 한 겹씩 두 색으로 칠하고, 다 칠하면
 * 같은 색끼리 두 편 {1, 3, 5} · {2, 4, 6, 7} 로 갈라선다. 간선 아홉이 모두 두 편 사이를 건너고 한 편 안의 간선은 0 이다.
 *
 * ── 묶음 안에서의 자리 (가 · 벡터와 그래프 — 완제품 없음, origin graph-theory)
 *
 * 그래프 조각 둘 가운데 이쪽은 **다 지어진 그래프가 두 편으로 풀린다** — 이분 · 두 색 · 거리의 홀짝 ·
 * 두 편 · 건너는 간선 낱말을 독점한다. 차수는 handshakeLemma 의 말이다.
 * 홀수 순환에서 색이 부딪히는 실패 장면은 이웃 분야 twoColorConflict 가 쥐므로 여기는 성공 장면이다.
 *
 * 전제: 그래프는 예로 정한 것이고 홀수 순환이 없다. "홀수 순환이 없으면 두 색으로 칠해진다" 는 일반은
 * 설명 글의 논증이 받치며, 이 한 그래프가 증명하지는 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bipartiteColoringConcept: FacetConceptSource = {
  id: 'bipartiteColoring',
  label: 'Bipartite Graph by Two-Coloring',
  canonicalFacet: 'facet:bipartiteColoring',

  surface: {
    definition:
      'Coloring each vertex by whether its distance from a start vertex is even or odd splits a graph without odd cycles into two sides, and every edge then runs between the sides.',
    exemplarKeywords: [
      'bipartite graph',
      'two-coloring',
      '2-colorable graph',
      'bipartition',
      'two independent sets',
      'no odd cycle',
      'even and odd distance layers',
      'bipartite check with BFS',
      'bipartite matching',
      'König’s theorem background',
    ],
  },

  briefing: {
    observable: [
      'The graph has seven numbered vertices placed around a ring and nine edges drawn from the start, so it is not obvious which vertices belong together. The caption reads "Vertices: 7 · Edges: 9 · Start: 1".',
      'One distance layer is painted per step, with each vertex tagged by its distance: "Distance 0: {1}", "Distance 1: {2, 4, 6}", "Distance 2: {3, 5}", "Distance 3: {7}". Even layers take one color, odd layers the other.',
      'Each painting step reports "Painted: n / 7" and "Same-color edges: 0"; the count of edges with both ends the same color stays 0 throughout.',
      'In the last step the vertices leave the ring and regroup by color into two rows, and the caption reads "Sides: {1, 3, 5} | {2, 4, 6, 7} · Crossing edges: 9 · Edges inside a side: 0".',
      'The graph is an example with only even cycles (lengths 4 and 6). The screen shows one graph that splits cleanly; the general rule that a graph without odd cycles is always two-colorable rests on the distance-parity argument, not on this single case.',
    ],

    screen: {
      affordances: [
        'The screen plays six steps by itself (the first frame counted) and stops once the graph has split into two sides.',
        'A Replay button and a playback strip sit below; comparing the first frame with the last shows the same nine edges, first tangled on a ring and then all running between two rows.',
      ],
    },

    useWhen: [
      'The article defines a bipartite graph and the reader cannot picture "every edge goes between the two groups". The final regrouping, with nine crossing edges and zero inside, is that picture.',
      'The article describes testing bipartiteness by coloring breadth-first by distance parity, and needs a run where the test succeeds before discussing when it fails.',
      'The reader is about to meet a problem that is naturally two-sided — matching workers to jobs, students to classes — and needs to recognise that shape in a graph that does not look two-sided at first.',
    ],

    avoidWhen: [
      'The article is about an odd cycle forcing a coloring conflict. No conflict ever appears here.',
      'The subject is coloring with three or more colors, map coloring, or register allocation by graph coloring. Only two colors and one graph are involved.',
      'The article is about how breadth-first search manages its queue or visiting order. Distances are used only to decide colors; the traversal mechanics are not shown.',
    ],

    contrastWith: [
      {
        concept: 'twoColorConflict',
        note: 'Both color a graph with two colors along its structure. An odd cycle makes two neighbors collide, so the graph is not bipartite; without odd cycles the colors never collide and the vertices separate into two sides.',
      },
      {
        concept: 'bfs',
        note: 'Breadth-first search is the procedure that finds distance layers; bipartiteness uses only the parity of those distances as a property of the graph.',
      },
      {
        concept: 'handshakeLemma',
        note: 'Bipartiteness is about how the vertices can be split, independent of any counting; the handshake lemma is a count that holds for every undirected graph whatever its shape.',
      },
    ],
  },
};
