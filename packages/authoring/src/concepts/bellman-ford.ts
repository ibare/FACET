/**
 * bellmanFord 개념 선언.
 *
 * canonical facet 은 `facet:bellmanFord` — 정점 다섯 · 방향 간선 아홉(음수 셋)의
 * 그래프 한 폭과 바퀴 원장 한 폭을 나란히 놓고, 간선 전부를 네 바퀴 편 뒤 검사
 * 바퀴를 한 번 더 도는 완결형이다. 코드 패널이 딸려 있고 셈 셋(바퀴 · 줄어듦 ·
 * 간선 견줌)이 바닥에 달린다.
 *
 * ── 묶음 안에서의 자리 (조각 둘과 갈라 두었다)
 *
 *   bellmanFord         절차 전체와 그 결과 — 무엇을 하는 방법이고 무엇을 내놓는가
 *   repeatRelaxAll      되풀이 횟수가 왜 그 값인가 (한 바퀴에 한 칸)
 *   oneMoreRoundDrops   마지막 한 바퀴가 무엇을 잡아내는가 (음수 고리)
 *
 * 변별어를 붙이지 않았다. "Bellman-Ford" 는 고유명이라 같은 이름을 쓰는 다른
 * 개념이 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bellmanFordConcept: FacetConceptSource = {
  id: 'bellmanFord',
  label: 'Bellman-Ford (Shortest Paths with Negative Edges)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:bellmanFord',

  surface: {
    definition:
      'A single-source shortest path method for graphs with negative edge weights: sweep every edge n-1 times, then one extra sweep to report a negative cycle.',
    exemplarKeywords: [
      'Bellman-Ford',
      'shortest path with negative weights',
      'single-source shortest paths',
      'edge relaxation',
      'negative cycle detection',
      'distance-vector routing',
      'currency arbitrage',
      'O(V*E)',
      'when Dijkstra cannot be used',
    ],
  },

  briefing: {
    observable: [
      'The graph sits on the left and a ledger on the right: one ledger row per pass, with only the cells that dropped during that pass tinted, and a count at the right end of the row.',
      'Vertices start with no number at all and are drawn as unreached until an edge carries a value into them; the source alone starts at 0.',
      'Every edge test is spelled out as arithmetic in the caption — the tail distance plus the weight against the head distance — and the caption says outright whether it drops or nothing changes.',
      'An edge whose tail is still unreached is passed over without a comparison, so a negative weight cannot leak a distance out of nowhere.',
      'The first pass drops six cells at once because a value lowered early in the pass is reused by a later edge in the same pass; the second drops one, and the third and fourth drop none.',
      'The last ledger row is the extra check pass. It stays pale with a count of zero, and that emptiness is what the caption reads as the answer being final.',
      'Three counters run along the bottom: passes, drops and edge tests. Edge tests keep climbing through the passes where nothing drops.',
      'The code panel unfolds one routine into a chosen language and highlights the line matching the current step; the two loops end up with character-for-character identical conditions, one lowering a distance and the other only reporting.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole run on its own: four passes over nine edges, then the check pass, then a closing caption with the final distances.',
        'Play, step, pause, reset and a speed slider. Stepping is how a reader stops on a single edge test and reads the arithmetic in the caption.',
        'The code panel starts empty with a button for adding a language; once one is chosen its lines light up as the animation runs.',
        'The graph and the edge order are fixed, so an article can name the vertex that drops three times and the pass in which it happens.',
      ],
    },

    useWhen: [
      'The article states a bound — n-1 passes — and the reader has no way to feel where the number comes from. The ledger makes the passes countable: six drops, then one, then two rows of nothing, and the run still has to go the full distance.',
      'The article claims the algorithm answers "no shortest path exists" as well as "here are the distances". The extra pass with an identical test, and the pale last ledger row, are where that second answer is actually produced.',
      'A reader is choosing between shortest path methods and needs to see what is paid for allowing negative weights: every edge examined again and again, with no vertex ever declared finished early.',
    ],

    avoidWhen: [
      'All the weights in question are non-negative and the point is the cheaper method that settles one vertex at a time. Nothing here settles anything early.',
      'The subject is distances between every pair of vertices. This has one source and one row of distances.',
      'The article uses "relaxation" for the numerical method of iteratively smoothing a system of equations, or for a relaxed constraint in an optimisation problem.',
      'The topic is a routing protocol as deployed — split horizon, hold-down timers, count-to-infinity between routers. No table is exchanged between anything here.',
      'The point is the single comparison-and-assignment on one edge. Here that test never appears alone; the unit on screen is a whole sweep.',
    ],

    contrastWith: [
      {
        concept: 'repeatRelaxAll',
        note: 'That one isolates why the sweeps must repeat at all; this one runs the full method, including the part that has nothing to do with the repetition count.',
      },
      {
        concept: 'oneMoreRoundDrops',
        note: 'That one stays inside the failure — values falling forever; here the extra pass finds nothing, and the emptiness is the result.',
      },
      {
        concept: 'dijkstra',
        note: 'One picks the nearest unsettled vertex and never revisits it, the other refuses to pick anything and pays for that by sweeping everything repeatedly.',
      },
      {
        concept: 'floydWarshall',
        note: 'Both tolerate negative edges; one answers for a single source and the other fills a table for every pair.',
      },
    ],
  },
};
