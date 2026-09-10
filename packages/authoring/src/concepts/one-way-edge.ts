/**
 * oneWayEdge 개념 선언.
 *
 * canonical facet 은 `facet:oneWayEdge` — 정점 다섯이 이룬 고리에서, 화살이 없을
 * 때 다섯 모두에 닿던 답사가 같은 다섯 선에 방향이 붙자 넷에서 멈추는 것을 보이는
 * 조각(piece)이다. 닿지 못한 C 는 고리 밖으로 밀려나되 나가는 화살은 남는다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩만 딸려 있다.
 *
 * 묶음 안에서의 자리 — 그래프 조각 넷 가운데 이것만 **간선의 방향**을 다룬다.
 * separateComponents 도 닿지 못하는 정점을 보이지만 그쪽 원인은 간선의 부재다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const oneWayEdgeConcept: FacetConceptSource = {
  id: 'oneWayEdge',
  label: 'Directed Edge (One-Way Reachability)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:oneWayEdge',

  surface: {
    definition:
      'An edge that permits travel in one direction only, which makes reachability asymmetric: a vertex may still reach the source that can no longer reach it.',
    exemplarKeywords: [
      'directed graph',
      'digraph',
      'arrow on an edge',
      'one-way street',
      'reachability',
      'asymmetric relation',
      'follower is not a friend',
      'who links to whom',
      'dependency points one way',
      'incoming versus outgoing edges',
      'in-degree zero',
    ],
  },

  briefing: {
    observable: [
      'Five vertices sit on a ring and every line between them is drawn as two parallel lanes, one running each way, so a line is visibly two permissions rather than one.',
      'With no arrows, a walk from the source reaches all five vertices and the caption counts them.',
      'When direction is applied, one lane of each line slides outward and drops away while the surviving lane moves to the centre — no colour changes, a lane simply leaves the picture.',
      'The second walk crosses the same five lines and reaches four vertices; the vertex it misses has both of its lines pointing away from it, and the caption says so before the count is given.',
      'The stranded vertex is pushed outside the ring, and its outgoing arrows stretch to follow it — it can still leave, only nothing arrives.',
      'The vertex count and the line count are identical in both halves of the run; the closing caption reports four of five reached.',
    ],

    screen: {
      affordances: [
        'The screen walks the graph twice on its own — once without arrows, once with them — and stops with the stranded vertex sitting outside the ring.',
        'Two buttons: Replay, and a step control that repeats the whole sequence one move at a time, which is how the lanes can be watched dropping away one line at a time.',
        'The graph is fixed at five vertices and five lines, and exactly one vertex ends up stranded, so the article can name it.',
      ],
    },

    useWhen: [
      'The article moves from undirected graphs to directed ones and the reader takes the arrowheads as a drawing convention. The same five lines losing a lane and one vertex falling out of reach is what makes direction consequential.',
      'The prose needs "A reaches B" to stop implying "B reaches A" — a follower graph, a link graph, a build dependency, a one-way street network.',
      'The reader treats an unreachable vertex as an isolated one. Here the stranded vertex keeps both of its lines and can still travel out, which separates "isolated" from "not reachable from here".',
    ],

    avoidWhen: [
      'The article is about edge weights, costs or distances. Every line here is either passable or not and carries no number.',
      'The subject is cycles, an ordering of a directed graph, or its strongly connected parts. This stops at the moment one vertex becomes unreachable.',
      'The point is how a graph is stored — adjacency lists, matrices, or how an arrow is recorded in memory.',
      'The article uses "directed" in the sense of a directed study, directed acyclic pipeline tooling, or a UI navigation flow rather than a graph edge.',
    ],

    contrastWith: [
      {
        concept: 'separateComponents',
        note: 'Both leave a vertex the search never reaches, but there the cause is a missing edge and here the edge is present and merely points the wrong way.',
      },
      {
        concept: 'mutuallyReachable',
        note: 'This shows reachability failing in one direction; that one groups the vertices where it holds in both directions, which only becomes a question once edges carry arrows.',
      },
      {
        concept: 'indegreeZeroFirst',
        note: 'Both turn on what arrives at a vertex rather than what leaves it — here nothing arriving means unreachable, there nothing arriving means ready to go first.',
      },
    ],
  },
};
