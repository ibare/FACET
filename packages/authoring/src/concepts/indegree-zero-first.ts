/**
 * indegreeZeroFirst 개념 선언.
 *
 * canonical facet 은 `facet:indegreeZeroFirst` — 정점 다섯(a~e)에 화살 다섯인
 * 작은 그림. 정점마다 머리 위에 "이고 있는 화살의 수" 배지가 얹혀 있고, 그 수가
 * 0 이 되어야 아래 줄로 **떨어진다.** 화살이 사라질 때도 꺼지지 않고 떨어져
 * 나가며 옛 숫자도 함께 떨어진다 — 화면의 모든 소멸이 낙하다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 묶음 안에서 갈라 둔 자리
 *
 * 이 조각이 지는 것은 **꺼낼 자격 하나** 다 — 들어오는 화살이 하나도 없으면
 * 지금 해도 되고, 하나를 빼면 그것이 걸어 두었던 화살이 떨어져 다음 것이 0 이
 * 된다. 그 연쇄 하나만 말하고 멈춘다.
 *
 * 절차 전체와 산출물, 줄의 구현, 일의 총량은 `topologicalSort` 의 몫이고
 * (여기에는 줄도 카운터도 코드 패널도 없다), 0 이 끝내 나오지 않는 경우는
 * `cycleBlocksOrder` 가 진다. 그래서 여기서는 다섯이 모두 떨어진다.
 *
 * 변별어를 붙인 이유: "in-degree" 만으로는 그것을 세어 무엇을 하는지가 남지
 * 않는다. 0 인 것이 먼저 간다는 판정이 이 조각의 전부다 (C4 명명 규칙 2).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const indegreeZeroFirstConcept: FacetConceptSource = {
  id: 'indegreeZeroFirst',
  label: 'Why a Vertex With Nothing Pointing At It May Go First',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:indegreeZeroFirst',

  surface: {
    definition:
      'The eligibility rule for one step: a vertex may be taken only while no arrow still points at it, and taking it removes the arrows it held from its successors.',
    exemplarKeywords: [
      'in-degree',
      'incoming edges count',
      'zero in-degree',
      'what can start right now',
      'the ready set',
      'unblocking the next task',
      'prerequisites all satisfied',
      'decrement the counter when a dependency finishes',
      'a wavefront of things that became available together',
      'blocked until its predecessors finish',
    ],
  },

  briefing: {
    observable: [
      'Every vertex carries a badge above its head holding the number of arrows aimed at it, and the opening step is the counting itself — the badges appear before anything moves.',
      'Only the two vertices whose badge reads zero are named as takeable at the start, and the caption names them together rather than picking one.',
      'Taking a vertex is a fall: it leaves the graph and lands in the row of slots at the bottom, filling them left to right.',
      'When a vertex leaves, the arrows it held detach and fall away, and the old number on each affected badge drops off as the new, lower number takes its place.',
      'Removing the first of the two zero vertices lowers a badge from two to one without freeing it — the vertex stays put, so the reader sees that partial progress is not eligibility.',
      'A badge that reaches zero is called out in its own step before that vertex falls, separating the moment something becomes available from the moment it is taken.',
      'Vertices sit in columns by how deep they are, and within a column the alphabetically earlier one is placed lower so nothing falls through anything else.',
      'All five reach the bottom row, and the closing caption reads the order left to right.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole cascade on its own and stops with all five vertices in the bottom row.',
        'Two buttons: Replay, and a step control that advances one event at a time — which is how a reader can hold still on a badge going from two to one and see that nothing moved.',
        'The graph is fixed at five vertices and five arrows, so an article can name a vertex and the badge value it waits on.',
        'Ties are broken alphabetically, so the same run repeats identically and the article can quote the order it produces.',
      ],
    },

    useWhen: [
      'The prose says a task is ready when its dependencies are done, and the reader has no picture of how readiness is decided without rescanning everything. One number per vertex, adjusted only when a neighbour leaves, is the whole mechanism.',
      'The reader assumes work becomes available one item at a time. Two badges sit at zero from the very first step here, which is where the idea of a batch that became available together lands.',
      'An article needs to justify the counter rather than merely introduce it: watching a badge fall from two to one and the vertex still not move is what separates "a dependency finished" from "all dependencies finished".',
    ],

    avoidWhen: [
      'The article is about degree in the network-analysis sense — hubs, degree distributions, how many connections a node has.',
      'The subject is a graph traversal that visits neighbours as soon as it reaches them, where arriving at a vertex is enough and nothing waits for a count to empty.',
      'The point is what to do when no vertex ever reaches zero. Every vertex is taken here, so the picture cannot carry that case.',
      'The article is about a scheduler choosing among several ready tasks by priority, cost or deadline. Ties here are settled alphabetically as a presentation choice, not as a policy worth reading into.',
      'The subject is an undirected graph, where an edge imposes no before-and-after and no count can decide who goes first.',
    ],

    contrastWith: [
      {
        concept: 'topologicalSort',
        note: 'Same rule seen at full length: there it is carried by an explicit queue to a finished order and a cost argument, here it is stripped to the counter and the cascade it sets off.',
      },
      {
        concept: 'cycleBlocksOrder',
        note: 'The other half of the same rule — this shows the counters emptying one after another, that shows a run where three of them stop above zero forever.',
      },
      {
        concept: 'oneWayEdge',
        note: 'The direction of an arrow is what makes a count of incoming arrows meaningful; that concept establishes the asymmetry this one turns into an admission test.',
      },
      {
        concept: 'markVisitedOrLoop',
        note: 'Both keep bookkeeping per vertex to decide whether it is due, but a visited mark answers "have I been here" and this counter answers "is everything before me done".',
      },
    ],
  },
};
