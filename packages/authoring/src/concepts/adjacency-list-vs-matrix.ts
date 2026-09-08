/**
 * adjacencyListVsMatrix 개념 선언.
 *
 * canonical facet 은 `facet:adjacencyListVsMatrix` — 한 주장을 말하고 멈추는 조각(piece)
 * facet. 왼쪽 인접 리스트 패널 + 오른쪽 인접 행렬 패널 + 커서 + 비용 배지 둘로 이루어지며,
 * 코드 패널도 메트릭도 없다. 조각은 누구의 하위도 아니므로 `aspects` 없이 canonicalFacet 은
 * 자기 자신이다.
 *
 * 마운트 직후 다섯 간선을 두 그릇에 동시에 채우고 두 물음("A 와 E 는 이웃인가" /
 * "A 의 이웃을 모두 대라")을 이어 재생한 뒤 멈춘다. 다시 보기와 한 걸음 외에는
 * 조작을 받지 않으며, 아무것도 누르지 않아도 화면은 할 말을 마친다.
 *
 * 변별어를 붙인 이유: 이 개념은 그래프를 **어떻게 저장하는가** 하나만 다룬다. id 를
 * `graphRepresentation` 처럼 넓게 두면 순회 · 최단 경로 · 그래프 그리기 글이 모두
 * 이 봉투를 쓰게 된다. 두 표현을 이름으로 못 박아 그 넓이를 잘라 냈다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const adjacencyListVsMatrixConcept: FacetConceptSource = {
  id: 'adjacencyListVsMatrix',
  label: 'Adjacency List vs. Adjacency Matrix',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:adjacencyListVsMatrix',

  surface: {
    definition:
      'Two ways to store the edges of a graph: a per-vertex list of neighbors that grows as edges arrive, or a vertex-by-vertex table of cells reserved in advance.',
    exemplarKeywords: [
      'adjacency list',
      'adjacency matrix',
      'how to store a graph',
      'graph representation',
      'sparse versus dense graph',
      'is there an edge between u and v',
      'iterating over neighbors',
      'V squared memory',
      'edge lookup cost',
    ],
  },

  briefing: {
    observable: [
      'Both containers hold the same five vertices and start in opposite states: the list side has one empty row per vertex, while the table side already shows all twenty-five cells filled with 0, and the opening caption counts those reserved cells out loud.',
      'Each edge lands on both sides at once — on the list side a cell grows sideways into the rows of both endpoints, on the table side two symmetric cells flip from 0 to 1. Five edges leave ten list cells and twenty-five table cells of which ten hold a 1.',
      'The first question, whether the first and last vertex are neighbors, is answered by a cursor stepping through the whole of that vertex\'s list row while a running count climbs above it, then by a single stop on one table cell. The closing caption reads two touches against one, and the table\'s badge is the highlighted one.',
      'The second question, name all neighbors of the same vertex, reverses it: the list side stops after its two cells while the cursor crosses every cell of that table row including the zeros. Two touches against five, and the highlighted badge switches to the list.',
      'The cursor changes color only where the cell it stands on is really a neighbor, so on the first question — whose answer is no — it never changes, and the walk that ends in nothing is still the price of asking.',
    ],

    screen: {
      affordances: [
        'The screen fills both containers and plays both questions on its own, then stops. Nothing has to be clicked for it to reach the point where the cheaper side has swapped.',
        'Two buttons: Replay, and Step. Pressing Step after the run returns both containers to their starting state and then walks the same moments one at a time, which is how a single cursor stop can be looked at.',
        'The graph is the same five vertices and five edges on every run, so the numbers the badges report are the same ones every reader sees.',
      ],
    },

    useWhen: [
      'The prose has introduced both representations and the reader takes the choice for a matter of taste. Here the same two questions are asked of both containers and counted, and the cheaper side changes between the questions rather than settling on one.',
      'The article is about to argue from how many edges a graph has, and that argument rests on one thing the reader has to see first: the table claims all of its cells before a single edge exists, while the list only ever holds as many as were added.',
    ],

    avoidWhen: [
      'The article is about traversing a graph — breadth-first, depth-first, visiting order, marking visited vertices. Nothing here traverses; the cursor only walks one vertex\'s neighbors to price the two questions.',
      'The subject is shortest paths or weighted edges (Dijkstra, A*, minimum spanning trees). The cells hold nothing but 0 and 1, and no path is ever assembled.',
      'The article draws the graph itself — vertices, edges, layout, planarity. Neither panel pictures the graph; both are the containers it is kept in.',
      'The point turns on direction, as in a directed graph or a dependency graph. Every edge here is written into both endpoints and into both symmetric table cells, which is the opposite of what a directed representation turns on.',
    ],

    contrastWith: [
      {
        concept: 'bfs',
        note: 'A traversal is the customer of this choice: every neighbor lookup a search makes is one of the two questions priced here, so the representation decides what its inner loop costs.',
      },
      {
        concept: 'array',
        note: 'One row of the table is an array indexed by vertex number — reaching a known position in one step is exactly what it buys, and reserving the whole block whether or not it is used is exactly what it costs.',
      },
      {
        concept: 'linkedListSingly',
        note: 'The neighbors of a vertex are held as a sequence that has to be walked to be answered from, which is the same trade a linked list makes: cheap to extend, but no way to check membership without going through it.',
      },
    ],
  },
};
