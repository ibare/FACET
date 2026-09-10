/**
 * maxFlow 개념 선언.
 *
 * canonical facet 은 `facet:maxFlow` — 정점 여섯 · 방향 간선 열짜리 관망 위에
 * 에드몬즈-카프를 끝까지 돌리고, 너비 우선 큐를 배열 그대로 깔고, 카운터 셋
 * (살펴본 관 · 찾은 길 · 총 유량) 과 코드 패널을 갖춘 완결형이다.
 *
 * ── 묶음 안에서 갈라 둔 자리
 *
 * 이 개념이 지는 것은 **되풀이 전체와 그 산출물** 이다 — 길을 찾고 흘리기를
 * 더 찾을 길이 없을 때까지 되풀이해 나온 하나의 수(23), 그리고 그것이 왜
 * 최대인가.
 *
 * 한 길에서 얼마를 흘리는가는 `bottleneckSetsFlow`, 되돌릴 폭이 왜 있어야
 * 하는가는 `undoByBackEdge` 가 맡는다. 셋 다 같은 알고리즘을 다루므로
 * definition 의 무게중심을 서로 다른 데 두었다 — 이쪽은 절차와 총량,
 * 조각 둘은 한 걸음의 규칙과 한 줄의 근거다.
 *
 * 변별어를 붙이지 않았다. "max flow" 는 이 문제 하나를 가리키는 이름이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const maxFlowConcept: FacetConceptSource = {
  id: 'maxFlow',
  label: 'Maximum Flow (Edmonds-Karp)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:maxFlow',

  surface: {
    definition:
      'Finding the greatest amount that can travel from a source to a sink through edges of fixed capacity, by filling routes that still have room until none remain.',
    exemplarKeywords: [
      'maximum flow',
      'Edmonds-Karp',
      'Ford-Fulkerson',
      'network flow problem',
      'source and sink',
      'augmenting path',
      'max-flow min-cut theorem',
      'residual graph',
      'bipartite matching as a flow',
      'how much can this pipeline carry',
      'capacity of a road network',
    ],
  },

  briefing: {
    observable: [
      'Every pair of nodes is one band whose total thickness never changes for the whole run; the band is split lengthwise into the room left in each direction, so sending flow slides the border between the two lanes instead of filling a container.',
      'The share of the reverse lane that was created by sending flow is painted in a separate highlight, which keeps it apart from capacity that was declared in that direction from the start.',
      'That highlighted share only ever grows here — three routes are used and not one of them travels back through it — so the reader watches the undo room accumulate without ever being spent.',
      'The breadth-first queue is laid out below the graph as a flat array with the head and tail indices marked, so the order in which nodes are taken out is readable rather than implied.',
      'After a route is found the run walks it backwards edge by edge, announcing the narrowest pipe so far, and only then does any flow move.',
      'Three counters sit along the bottom — pipes checked, routes found, total flow — and the run ends with routes found at three and total flow at 23.',
      'The closing caption states the stopping condition itself: no route with room is left, so the flow cannot grow.',
      'The code panel begins empty behind an Add language button; once a language is chosen the line matching the current step lights up, and the pair that subtracts from one direction and adds to the other stands there as two adjacent statements rather than inside a helper.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider. Stepping is how a reader stops on one pipe being examined.',
        'The code panel starts empty. The reader presses "+ Add language" and picks from Python, JavaScript, TypeScript, Java, C++ and C#; two can sit side by side.',
        'The network, its ten capacities, the source and the sink are all fixed, so an article can name the three routes and the number 23 and rely on the reader seeing them.',
        'Reading the pipes-checked counter after the run is how the cost of searching over and over becomes a number instead of a claim.',
      ],
    },

    useWhen: [
      'The prose has given the rule — find a route with room, send the narrowest amount, repeat — and the reader cannot tell why running out of routes means the answer is the largest possible. Watching the last search fail and the caption name that as the stopping condition is what closes the argument.',
      'The article claims that the two lines updating opposite directions are the whole method, and the reader suspects they are bookkeeping. Seeing the border of a band slide, with the undo share building up in its own colour, makes the pair a visible mechanism.',
      'The reader needs to accept that breadth-first search is a choice here rather than a habit: the route with the fewest pipes is taken first, and the queue with its head and tail on screen shows what would change if the ends were swapped.',
    ],

    avoidWhen: [
      'The article uses "flow" for the order in which a program executes, for a data pipeline between services, or for a stream of events. None of that meaning is present here.',
      'The subject is flow control or congestion control in a transport protocol — windows, backpressure, rate limits. Those borrow the vocabulary and share none of the mechanism.',
      'Edges in the article carry a price per unit as well as a capacity, or several commodities travel at once. Every edge here has one number and one kind of stuff moves.',
      'The point is the shortest or cheapest route between two places. Breadth-first search appears here only to find a route with room left, and what comes out is a total, not a distance.',
      'The article needs a modern implementation and its complexity — Dinic, push-relabel, blocking flows. The screen runs the plain repeated-search version.',
    ],

    contrastWith: [
      {
        concept: 'bottleneckSetsFlow',
        note: 'One route and the single rule that fixes what it carries, against that decision repeated until the network is saturated and the totals become the answer.',
      },
      {
        concept: 'undoByBackEdge',
        note: 'This network builds up the room to push flow back and never uses it, so the two together show the rule being made here and being needed there.',
      },
      {
        concept: 'bfs',
        note: 'The same breadth-first sweep put to a different job: there it measures how many hops away things are, here it only has to reach the sink through pipes that still have room.',
      },
      {
        concept: 'greedyCanFail',
        note: 'Choices that are never revisited can come out worse; here every earlier choice stays revisable, which is why the order routes are picked in cannot spoil the result.',
      },
    ],
  },
};
