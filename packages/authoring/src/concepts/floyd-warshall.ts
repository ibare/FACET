/**
 * floydWarshall 개념 선언.
 *
 * canonical facet 은 `facet:floydWarshall` — 정점 다섯의 거리표가 화면 중심이고,
 * 위쪽 띠가 지금 가운데 세운 정점을, 오른쪽 판이 지금 묻는 셈을 적는다. 가운데
 * 세우기 · 물음 · 고쳐 적기 세 카운터와 코드 패널이 딸린 완결형이다.
 *
 * ── 묶음 안에서 어디에 무게를 두었나
 *
 * 조각 `throughMiddleNode` 가 물음 하나와 그 되풀이를 맡으므로, 이 개념은
 * **표 전체와 그 결과** 로 말한다 — 모든 쌍의 답이 수 하나가 아니라 표 한 장이라는
 * 것, 가운데를 바깥 반복문에 두어야 하는 순서, 다 채운 표를 그 뒤로는 읽기만 하면
 * 된다는 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const floydWarshallConcept: FacetConceptSource = {
  id: 'floydWarshall',
  label: 'Floyd–Warshall (All-Pairs Shortest Paths)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:floydWarshall',

  surface: {
    definition:
      'An all-pairs shortest path method that fills a distance matrix by letting every vertex in turn act as an intermediate, in three nested loops over the pairs.',
    exemplarKeywords: [
      'Floyd-Warshall',
      'all-pairs shortest paths',
      'distance matrix',
      'APSP',
      'cubic time',
      'dense graph',
      'dynamic programming on graphs',
      'transitive closure',
      'precomputed distance table',
      'shortest route between every pair of cities',
    ],
  },

  briefing: {
    observable: [
      'The table is the picture: a row per source and a column per destination, with a legend above reading from down the side and to across the top.',
      'It is laid out first with zero on the diagonal and an infinity sign in every other cell, and only then are the direct edges written into their cells one at a time.',
      'A strip along the top holds the five vertices and lights the one currently standing in the middle; that vertex has its whole row and column washed in a pale tint for the length of its sweep.',
      'Each question lights three cells at once — the pair being asked about, plus the two cells whose sum is the way through the middle — and the panel on the right prints that sum beside the value the cell already holds.',
      'A cell that is rewritten does not merely change colour: the old number slides up and out while the new one rises from below.',
      'Distances that begin as infinity become finite over several sweeps, so a pair with no direct edge ends up with a number assembled from earlier rewrites.',
      'The counters finish at five middles, one hundred questions and twenty rewrites, which puts most of the run in the eighty questions that changed nothing.',
    ],

    screen: {
      affordances: [
        'Nothing runs until Play is pressed. The bar carries play, single step, pause, reset and a speed slider.',
        'The code panel starts empty with a "+ Add language" button; up to two of Python, JavaScript, TypeScript, Java, C++ and C# stand side by side and the running line is highlighted, which is where the loop order can be pointed at.',
        'The graph is fixed at five vertices and nine one-way edges, so the numbers standing in the finished table can be quoted in the article.',
      ],
    },

    useWhen: [
      'The article has to justify why the middle vertex is the outermost loop, and the reader has no reason to believe reordering breaks anything. Following the table across the five sweeps shows what one completed sweep guarantees before the next starts.',
      'The prose separates a route from one starting point from routes between every pair, and the reader needs to see that the second answer is a table filled without ever choosing a start.',
      'A distance is claimed to pass through several intermediates. Here one cell goes from unreachable to a finite number and then shrinks again in a later sweep, so a multi-hop route is assembled in stages rather than found at once.',
    ],

    avoidWhen: [
      'The graph has negative edge weights, or the question is detecting a negative cycle. The diagonal is skipped here, and the diagonal is the cell that would reveal one.',
      'The article needs the route itself rather than its length — which vertices to walk through. Only distances are written and no cell keeps a predecessor.',
      'The subject is a single source: one place to everywhere else, a frontier, a priority queue driving the search.',
      'The graph is large and sparse, where running a single-source search from each vertex is the practical method and a matrix would not even fit.',
    ],

    contrastWith: [
      {
        concept: 'throughMiddleNode',
        note: 'The one question this repeats, held still — with the count of how often the answer is no, which is where the cubic cost comes from.',
      },
      {
        concept: 'dijkstra',
        note: 'Both compute shortest distances, but one settles vertices outward from a chosen start and this fills every pair at once without a start at all.',
      },
      {
        concept: 'bellmanFord',
        note: 'Both improve stored distances by repeated sweeps rather than by expanding a frontier; one sweeps over edges from one source, the other over pairs with a changing intermediate.',
      },
      {
        concept: 'bottomUpTable',
        note: 'The same shape of reasoning as filling a table in order: each sweep here may only read cells that the previous sweeps have already settled.',
      },
    ],
  },
};
