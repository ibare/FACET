/**
 * fewerHopsNotShorter 개념 선언.
 *
 * canonical facet 은 `facet:fewerHopsNotShorter` — 같은 두 정점을 잇는 길 둘을
 * 같은 출발선에 눕히고, 가로 길이가 곧 재고 있는 값이 되게 하는 조각(piece)이다.
 * 먼저 간선 수로만 재어 두 간선짜리 길이 짧아 보이는 것을 보이고, 그 다음 간선마다
 * 무게를 재면 순위가 뒤집힌다 (18 대 11).
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * 묶음 안에서의 자리 — 그래프 조각 넷 가운데 이것만 **무게가 붙은** 그래프를
 * 다룬다. 나머지 셋(방향 · 덩어리 · 두 색)은 간선에 수가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const fewerHopsNotShorterConcept: FacetConceptSource = {
  id: 'fewerHopsNotShorter',
  label: 'Fewer Hops Is Not the Shorter Path',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:fewerHopsNotShorter',

  surface: {
    definition:
      'In a weighted graph the route crossing the fewest edges need not carry the smallest total weight, so hop count and path cost rank routes differently.',
    exemplarKeywords: [
      'fewest hops',
      'hop count versus distance',
      'weighted edges',
      'edge weight',
      'shortest path is not fewest edges',
      'why breadth-first search is not enough',
      'travel time versus number of transfers',
      'toll road versus back roads',
      'latency per link',
      'cost of a route',
    ],
  },

  briefing: {
    observable: [
      'Two routes joining the same pair of vertices are laid on separate lanes leaving one shared vertical start bar, and horizontal length on screen is the quantity currently being measured.',
      'In the first measurement every edge is drawn the same length, so the two-edge route finishes far to the left of the four-edge route, and a dashed vertical verdict line stands at that finishing point.',
      'Then each edge stretches or shrinks to its own weight and the vertices behind it slide along with it, the finishing points trade places, and the verdict line jumps to the other lane.',
      'Readings sit beside each finishing point: first the edge count of each route, then a running weight total that grows as the edges are weighed one at a time.',
      'The two-edge route comes to 18 and the four-edge route to 11, so the route that looked shorter is the heavier one.',
      'The destination is drawn as two circles, one at the end of each lane, because the two lanes have to finish at different places for their lengths to be comparable; the source is a bar rather than a circle so both lanes begin at exactly the same x.',
    ],

    screen: {
      affordances: [
        'The screen measures both routes on its own and stops on the reversal, with both lanes left on screen at their weighted lengths.',
        'Two buttons: Replay, and a step control that walks the same argument from the start one move at a time, which is how a reader can hold on the moment a single edge stretches.',
        'The graph is fixed at six vertices and six edges with one two-edge route and one four-edge route, so the article can quote both totals.',
      ],
    },

    useWhen: [
      'The prose says a traversal finds "the shortest path" and the reader hears edge count and distance as one measure. Re-measuring the same two routes by weight and watching the ranking flip is what splits them into two questions.',
      'The article is about to introduce a cost-aware routing method and needs the reader to want it — the reversal is the failure that makes counting edges insufficient.',
      'The reader has to accept that what counts as "short" is a choice of what the weights mean, and the screen measures the identical picture twice under two different units.',
    ],

    avoidWhen: [
      'Every edge in the article costs the same, or the graph is unweighted. Then edge count is the distance and this screen argues against a belief the reader does not hold.',
      'The subject is how a shortest-path algorithm settles vertices, orders its frontier, or relaxes an edge. Nothing is settled or relaxed here — two finished routes are simply measured twice.',
      'The goal really is the fewest transfers, stops or layovers rather than distance. That is a legitimate objective and this screen would read as arguing against it.',
      'The article uses "hop" for a network packet forwarding count where each hop genuinely is the unit of cost.',
    ],

    contrastWith: [
      {
        concept: 'bfs',
        note: 'The measurement that counts edges is exactly what a layered traversal computes, which is why its answer is only the shortest one when every edge weighs the same.',
      },
      {
        concept: 'dijkstra',
        note: 'This is the failure that motivates settling vertices by accumulated weight; there the ranking is maintained as the search grows instead of being discovered at the end.',
      },
      {
        concept: 'negativeEdgeBreaks',
        note: 'Both break an intuition about weights — here that fewer edges means less weight, there that a route already settled stays best once negative weights exist.',
      },
    ],
  },
};
