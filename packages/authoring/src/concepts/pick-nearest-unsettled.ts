/**
 * pickNearestUnsettled 개념 선언.
 *
 * canonical facet 은 `facet:pickNearestUnsettled` — 정점 다섯짜리 작은 그림에서
 * 세 상태를 칠과 움직임으로 가른다. 아직 닿지 않은 것은 점선에 ∞ 로 멎어 있고,
 * 흔들리는 것은 수를 인 채 미세하게 떨며, 굳은 것은 돌로 채워져 완전히 멎는다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 묶음 안에서 갈라 둔 자리
 *
 * 이 조각이 지는 것은 **확정이라는 한 걸음의 정당성** 하나다 — 가장 작은 수를
 * 인 것은 더 내려갈 데가 없으므로 지금 굳혀도 된다, 그리고 굳은 뒤에는 무엇이
 * 닿아도 흔들리지 않는다. 절차 전체와 산출물은 `dijkstra`, 수가 실제로
 * 내려가는 일은 `relaxShorterPath` 의 몫이라 여기서는 말하지 않는다.
 *
 * 변별어를 붙인 이유: "고른다(pick)" 만으로는 무엇 중에서 무엇을 고르는지가
 * 남지 않는다. 확정 대상이 미확정 쪽이라는 것이 이 조각의 전부다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pickNearestUnsettledConcept: FacetConceptSource = {
  id: 'pickNearestUnsettled',
  label: 'Why the Nearest One Can Be Committed To',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:pickNearestUnsettled',

  surface: {
    definition:
      'Among vertices whose distance is still provisional, the one holding the smallest value cannot drop any further, so that value may be committed to permanently.',
    exemplarKeywords: [
      'settle a vertex',
      'finalize a distance',
      'once settled it never changes',
      'tentative versus final',
      'the visited set',
      'greedy choice',
      'why the smallest can be committed',
      'proof by contradiction on the shortest route',
      'closest first',
      'is it safe to commit yet',
    ],
  },

  briefing: {
    observable: [
      'Three states are shown by movement, not by wording: a vertex nothing has reached is still and dotted with an infinity mark, a vertex carrying a number trembles, and a hardened vertex fills in and stops dead.',
      'The trembling runs continuously rather than only on the step being described, so at any frozen moment the reader can tell which vertices are still open just by looking.',
      'Hardening is a distinct movement — a ring folds inward from outside the vertex and locks it — and after that the vertex does not shift by a pixel for the rest of the run.',
      'When a hardened vertex spreads, its number crosses to every neighbour in the same step rather than one at a time, so a rebound and an absorption sit side by side in one frame.',
      'A number arriving at an already hardened neighbour visibly bounces off; a number arriving at a trembling neighbour is taken in and the neighbour drops to it.',
      'A vertex that has just taken a lower number trembles harder for a moment, which separates "something changed here" from "this is merely still open".',
      'By the end every vertex is filled and nothing on the canvas is moving, which is the picture of there being nothing provisional left.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole sequence on its own and stops with every vertex hardened.',
        'Two buttons: replay, and a step button. The first press of the step button rewinds to the bare graph and shows the first move in the same press, and from there each press advances one moment.',
        'The five vertices and six weights are fixed, so the article can name the order in which they harden.',
        'Stepping is the way to pause on a spread and read one rebound against one absorption in the same frame.',
      ],
    },

    useWhen: [
      'The reader accepts the mechanics but not the licence — they can follow the rule and still suspect that some route discovered later will make a committed number wrong. Watching a number arrive at a hardened vertex and rebound is what answers that suspicion.',
      'The article is about to lean on the word "visited" or "done" and the reader hears it as bookkeeping. Here the hardened state is a physical fact on the canvas: the vertex stops moving and refuses what arrives.',
      'The prose needs the reader to hold two kinds of number at once — one that may still fall and one that may not — before any procedure built on that distinction will make sense.',
    ],

    avoidWhen: [
      'Some weight in the article can be negative. The argument shown here is exactly the one that fails then, and the screen never shows it failing.',
      'The subject is how a provisional number gets lowered — where the candidate comes from, what arithmetic produces it. Here numbers arrive already formed.',
      'The article is about extracting the minimum from a heap or priority queue as a data-structure operation. Nothing on screen is a container being popped.',
      'The word "visited" in the article means the mark that stops a traversal from looping, which is a different reason for marking a vertex.',
      'The point is the total cost of the procedure or how many rounds it takes. Nothing here is counted.',
    ],

    contrastWith: [
      {
        concept: 'dijkstra',
        note: 'The single licence to commit, against the full run where committing happens over and over until a ledger of final distances exists.',
      },
      {
        concept: 'relaxShorterPath',
        note: 'Two halves of the same alternation: one is about a number being allowed to stop falling, the other about the falling itself.',
      },
      {
        concept: 'negativeEdgeBreaks',
        note: 'The same argument with its premise removed — there a committed vertex refuses a number that really was shorter, and the wrong value survives.',
      },
      {
        concept: 'takeBestNow',
        note: 'Both take the locally best option and never revisit it, but here the irrevocability is earned by an argument rather than accepted as a gamble.',
      },
    ],
  },
};
