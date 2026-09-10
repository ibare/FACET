/**
 * branchAndBound 개념 선언.
 *
 * canonical facet 은 `facet:branchAndBound` — 완결형이다. 물건 띠 · 한계 자 ·
 * 갈래 나무 세 켜에 카운터 셋(연 갈래 · 자른 갈래 · 무게 초과)과 여섯 언어로
 * 펼쳐지는 코드 패널(`ir:knapsack-bound`)이 붙는다. 물건 넷, 한도 10, 답 90 을
 * 갈래 아홉으로 얻는다 (전수는 열여섯).
 *
 * ── 묶음 안에서의 자리
 *
 * 짝인 조각 `boundAndCut` 과 갈리는 지점을 definition 에 박았다.
 *
 *   여기         **탐색 절차 전체** — 결정마다 갈래를 뻗고, 재고, 못 이기는
 *                갈래를 접어 최적을 확정한다. 정확성과 걸음 수 절감이 주어다.
 *   boundAndCut  그중 **자르는 판정 한 걸음** — 조건을 어기지 않은 갈래를 왜
 *                접는가, 그리고 기준이 재생 도중 올라간다는 것.
 *
 * keywords 도 갈랐다 — 여기는 exact algorithm · 정수 계획 · 탐색 나무 같은
 * 절차 이름을, 조각은 pruning · incumbent · 낙관적 추정 같은 판정 어휘를 맡는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const branchAndBoundConcept: FacetConceptSource = {
  id: 'branchAndBound',
  label: 'Branch and Bound (Exact Search Without a Table)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:branchAndBound',

  surface: {
    definition:
      'An exact search that branches on each decision and abandons a branch as soon as an optimistic estimate of its best reachable value fails to beat the best complete solution so far.',
    exemplarKeywords: [
      'branch and bound',
      'exact algorithm',
      'search tree',
      'integer programming',
      'knapsack without a table',
      'enumeration with pruning',
      'fractional relaxation',
      'upper bound function',
      'solve optimally but skip most of the space',
    ],
  },

  briefing: {
    observable: [
      'Three layers stack in one frame: a strip of the four items ordered by value per weight together with the limit and the current best, a ruler where the estimate for the branch being examined is built up, and a tree recording the branches actually opened.',
      'The ruler assembles the estimate in stages — whole remaining items are stacked on top of what is already packed, and the last one that does not fit is added as a hatched slice, which is the fraction of it that the room allows.',
      'In the tree a solid link means the item was packed and a dashed link means it was left behind; the branches that were cut or that overflowed simply stop with no children, so everything never explored stays visible as absence.',
      'Three counters run along the bottom — branches opened, branches cut, branches too heavy — and the closing caption puts nine opened branches against sixteen possible packings for the same answer, 90.',
      'The code panel highlights the line matching the current step, including the line inside the estimate routine where the slice is computed by dividing the remaining room by the item\'s weight.',
      'The strip dims the items already decided and rings the one currently at a fork, so the depth in the tree and the position in the item order are readable at once.',
    ],

    screen: {
      affordances: [
        'Playback controls: play, step, pause, reset and a speed selector. Stepping through the estimate routine is how a reader can watch the ruler grow item by item before the comparison happens.',
        'The four items, the limit of 10 and their order are fixed, and the order is deliberate — the items are sorted by value per weight because the estimate is only an upper bound under that order.',
        'The code panel starts empty with a button for adding a language; one or two of the six can be shown at once, side by side.',
      ],
    },

    useWhen: [
      'The article states that an exact method need not enumerate everything and the claim needs a number. Nine opened branches against sixteen possible packings, on the same data and with the same answer, is that number.',
      'A passage turns on the requirement that an estimate must never fall below the truth. The hatched slice is where that requirement lives, and the code panel shows the division that has to be real rather than integer for it to hold.',
      'The reader is weighing a search against a table for the same problem and the search side has to be concrete about what it skips and why skipping is safe.',
      'The prose needs the two different reasons a branch can end kept apart: one where the weight overflows the limit, one where nothing is violated and only the ceiling is too low. Both are counted separately here.',
    ],

    avoidWhen: [
      'The subject is an approximation, a heuristic, or a search stopped by a time budget. Every cut here is justified and the answer returned is the optimum.',
      'The point is constraint propagation or feasibility checking in a problem with no objective to compare branches against.',
      'The article means "branch" in the sense of version control, or a conditional jump in a processor.',
      'The topic is cutting-plane methods that add inequalities to a relaxation, which share the vocabulary but not the mechanism shown here.',
      'The reader needs the running time or the worst case as an analysis; this shows one run on one data set, where a different data set could open every branch.',
    ],

    contrastWith: [
      {
        concept: 'boundAndCut',
        note: 'The whole search against the single test inside it: here branches are opened one at a time by a depth-first walk with the measuring embedded, there the measuring itself is the subject.',
      },
      {
        concept: 'backtracking',
        note: 'Both walk a tree of choices and turn back, but backtracking turns back where a constraint is broken, and this also turns back on arithmetic about what a branch could still reach.',
      },
      {
        concept: 'dynamicProgramming',
        note: 'The same knapsack from two directions: a table whose size fixes the work in advance, or a search whose work depends entirely on how sharp the estimate is.',
      },
      {
        concept: 'greedyCanFail',
        note: 'Packing by value per weight does not give the optimum, yet that very order is what makes the estimate here a valid ceiling — the greedy rule fails as an answer and works as a bound.',
      },
    ],
  },
};
