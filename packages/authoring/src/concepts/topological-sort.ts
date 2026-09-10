/**
 * topologicalSort 개념 선언.
 *
 * canonical facet 은 `facet:topologicalSort` — 정점 여섯 · 화살 일곱짜리 방향
 * 그래프를 위에 두고, 그 아래 줄(배열 + head · tail)과 차례를 층으로 쌓은
 * 완결형이다. 정점 조각 하나가 그래프에서 줄로, 줄에서 차례로 두 번 떨어진다.
 * 누적 카운터 셋과 여섯 언어로 펼쳐지는 코드 패널이 딸려 있다.
 *
 * ── 묶음 안에서 갈라 둔 자리
 *
 * 이 완제품이 지는 것은 **절차 전체와 그 산출물** 이다 — 세고, 줄에 담고,
 * 꺼내 차례에 적고, 마지막에 꺼낸 수를 정점 수와 견주는 데까지. 줄이 배열
 * 하나와 색인 둘이라는 것, 그래서 일의 총량이 정점 수 + 간선 수라는 것도
 * 여기서만 볼 수 있다 (코드 패널이 그것을 그대로 보인다).
 *
 * 꺼낼 자격이 왜 "들어오는 화살 0" 인가는 `indegreeZeroFirst`, 고리가 있으면
 * 왜 멈추는가는 `cycleBlocksOrder` 의 몫이라 여기서는 결과 판정 한 줄로만
 * 스친다.
 *
 * 변별어를 붙이지 않았다. "topological sort" 는 그 자체로 한 가지를 가리키는
 * 말이고, 같은 이름을 다투는 형제가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const topologicalSortConcept: FacetConceptSource = {
  id: 'topologicalSort',
  label: 'Topological Sort (Kahn)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:topologicalSort',

  surface: {
    definition:
      'A linear arrangement of a directed graph that respects every edge direction, produced by repeatedly taking a vertex nothing points at and queueing whatever that frees.',
    exemplarKeywords: [
      'topological sort',
      "Kahn's algorithm",
      'build order',
      'dependency resolution',
      'course prerequisites',
      'task scheduling with prerequisites',
      'package install order',
      'makefile target order',
      'spreadsheet recalculation order',
      'directed acyclic graph',
      'linear extension of a partial order',
      'V plus E',
    ],
  },

  briefing: {
    observable: [
      'Each vertex wears a small number that counts the arrows still pointing at it, and the first pass through the graph is nothing but putting those numbers on.',
      'A vertex whose number reaches zero falls out of the graph into a row below, and the same piece falls a second time from that row into the order at the bottom — the shapes move rather than being redrawn, and an empty outline stays where each one used to sit.',
      'The middle row is drawn as a plain array with two markers under it, head and tail, so the queue is visible as storage rather than as an operation.',
      'Each arrow dims exactly once, at the moment its source is taken, and the number on its target drops by one in the same step.',
      'Three counters run along the bottom — taken out, into queue, arrows cleared — and the last one ends at seven, one per arrow.',
      'The closing step compares the number taken against the number of vertices, and the tally reads six of six before the final caption states the order.',
      'The code panel carries the same routine in several languages with the queue written out as an array plus two indices, and the line matching the current step is highlighted as the animation runs.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole run from counting to the final order, with play, pause, single step, reset and a speed slider.',
        'The graph is fixed at six vertices and seven arrows, so an article can name a vertex and the place it lands in the order.',
        'Stepping is what makes the drop into the queue and the drop into the order legible as two separate events rather than one motion.',
        'A language is chosen in the code panel, and stepping then walks the highlight through the two index assignments that push and pop.',
      ],
    },

    useWhen: [
      'The article claims that a build system, an installer or a course catalogue can compute an execution order on its own, and the reader needs to see that the whole trick is a per-item counter and a row to park the freed items in.',
      'The prose asserts the whole run costs no more than the vertices plus the edges. Watching each arrow fade exactly once, with the cleared-arrows counter ending at the number of arrows, is where that bound stops being a formula.',
      'The reader thinks of a queue as a library object. Here the queue is an array with a head and a tail written out in the code panel, and head doubles as the count of what has come out.',
    ],

    avoidWhen: [
      'The subject is sorting values into ascending order. Nothing here compares two values; the arrangement comes from edge directions.',
      'The article is about tree traversal orders — preorder, inorder, postorder, or a level-by-level walk.',
      'The point is which of several valid orders a system should prefer — smallest identifier first, longest chain first, critical path. This run fixes one tie-breaking rule and never varies it.',
      'The subject is CPU or job scheduling in an operating system, where the ordering question is about time slices and priorities rather than prerequisites.',
      'The article is about detecting a cycle rather than producing an order, and needs the cycle itself named.',
    ],

    contrastWith: [
      {
        concept: 'indegreeZeroFirst',
        note: 'That isolates the admission rule and the cascade it sets off; this runs the rule to the end and hands back a finished order plus the tally that judges it.',
      },
      {
        concept: 'cycleBlocksOrder',
        note: 'That dwells on the run that stalls; here the stall is reduced to one comparison at the close — fewer taken than exist means no order exists.',
      },
      {
        concept: 'bfs',
        note: 'Both drain a queue over a graph, but a breadth-first walk enqueues a vertex the moment it is first reached and this one waits until every arrow into it is gone.',
      },
      {
        concept: 'queueFifo',
        note: 'The queue here is the same first-in-first-out discipline, laid out as one array with a head and a tail rather than studied as a structure in its own right.',
      },
    ],
  },
};
