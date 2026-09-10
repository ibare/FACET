/**
 * relaxShorterPath 개념 선언.
 *
 * canonical facet 은 `facet:relaxShorterPath` — 정점 넷을 세로 레일 넷으로 세우고,
 * 정점이 인 수를 그 수의 높이에 붙은 패로 그린다. 수가 내려가면 패가 레일을 따라
 * 실제로 미끄러져 내려가고 옛 수는 취소선으로 남는다. 자국이 전부 아래를 향한다는
 * 것이 마지막 화면이 하는 말이다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 묶음 안에서 갈라 둔 자리
 *
 * 이 조각이 지는 것은 **적힌 수를 갈아 끼우는 한 연산** 이다 — 처음 적는 일,
 * 내려가는 일, 더 짧지 않아 그대로 두는 일 셋을 가른다. 어느 정점부터 펴는지는
 * `pickNearestUnsettled` 가, 절차 전체와 산출물은 `dijkstra` 가 맡으므로
 * 여기서는 순서를 주장하지 않는다.
 *
 * 변별어를 붙인 이유: "relaxation" 은 수치해석의 완화법 · 선형계획의 완화 ·
 * 물리의 완화 시간에서도 쓰이는 말이다 (C4 명명 규칙 2).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const relaxShorterPathConcept: FacetConceptSource = {
  id: 'relaxShorterPath',
  label: 'Relaxation (Rewriting a Distance Downward)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:relaxShorterPath',

  surface: {
    definition:
      'Replacing the tentative distance recorded at a vertex with a smaller one reached through another vertex; the recorded number only ever moves down, never back up.',
    exemplarKeywords: [
      'relaxation',
      'relax an edge',
      'edge relaxation',
      'd[v] > d[u] + w',
      'update the distance estimate',
      'the tentative distance drops',
      'improve a known route',
      'distance array update',
      'predecessor is rewritten',
      'the estimate only decreases',
    ],
  },

  briefing: {
    observable: [
      'Each vertex owns a vertical rail and the number it carries is a plate pinned at that height, so a smaller number is literally lower on the screen and the reader compares by eye instead of by reading digits.',
      'The top of every rail is an unwritten band — a vertex with nothing recorded sits there rather than at zero, which keeps "no number yet" apart from "a small number".',
      'Writing for the first time and lowering an existing number look different: the first arrives sideways along the edge and lands on the rail, the second slides straight down the rail from where it was.',
      'A lowered number leaves the old one struck through at the height it used to occupy, and the trail between the two heights stays on screen, so the run accumulates a record of every drop.',
      'A candidate that is not shorter is also drawn — it hangs struck through above the number that stays, which is the only way the condition can be seen holding rather than merely stated.',
      'In this data A is written at 7 and then drops to 5, and C is written at 8 and then drops to 6, while the route through B to C offers 11 and is rejected.',
      'Every trail on the finished screen points downward, and the closing caption says exactly that: each number that changed went down and none went back up.',
    ],

    screen: {
      affordances: [
        'The screen plays one pass on its own and stops on the closing statement about direction.',
        'Two buttons: replay, and a step button. The first press of the step button rewinds and shows the first move in the same press, and each press after that advances one moment.',
        'The four vertices, six edges and the height of the scale are fixed, so the article can name the drop from 7 to 5 and the rejected 11 and count on them being there.',
        'Stepping is how the reader stops on the rejected candidate, which otherwise passes as quickly as a successful one.',
      ],
    },

    useWhen: [
      'The article has written the update as a line of code and the reader reads it as an assignment among many. Seeing the plate physically slide down its rail turns the guarded assignment into a direction.',
      'The reader needs to accept that a number on screen is a working estimate rather than an answer, which is the precondition for anything that improves estimates over time.',
      'The prose glosses first-time writing and improvement as the same operation. Here one arrives sideways and the other slides down, so the two can be named apart before either is reasoned about.',
    ],

    avoidWhen: [
      'The article uses "relaxation" in the numerical sense — iterative solvers, Jacobi or Gauss-Seidel relaxation, over-relaxation factors. The vocabulary matches and the subject does not.',
      'The subject is linear-programming or constraint relaxation, where a requirement is loosened to make a problem tractable.',
      'The point is which vertex to work from next, or in what order the edges get examined. The order is present here only so that a pass can happen at all.',
      'Some weight in the article can be negative. Nothing here goes back up, and that is precisely what negative weights break.',
      'The subject is reconstructing the route itself — following predecessors back to the origin to name the path. Only the numbers move here.',
    ],

    contrastWith: [
      {
        concept: 'pickNearestUnsettled',
        note: 'Two halves of one alternation: this is a number falling, the other is a number being allowed to stop falling.',
      },
      {
        concept: 'dijkstra',
        note: 'The single update seen close up, against the full run in which updates and commitments alternate until every vertex has a final distance.',
      },
      {
        concept: 'repeatRelaxAll',
        note: 'The same operation applied without a selection order — sweeping every edge again and again instead of working outward from a chosen vertex.',
      },
    ],
  },
};
