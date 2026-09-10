/**
 * dynamicProgramming 개념 선언.
 *
 * canonical facet 은 `facet:dynamicProgramming` — 0/1 배낭을 물건 넷 × 한도 열의
 * 2차원 표로 푸는 완결형이다. 표 · 화살 · 자국을 그리는 stage, 카운터 셋
 * (채운 칸 · 견줌 · 너무 무거움), 그리고 여섯 언어로 펼쳐지는 코드 패널을 갖췄다.
 *
 * ── 묶음 안에서의 자리
 *
 * 이 묶음은 완제품 하나(여기)와 조각 셋(`overlappingSubproblems` ·
 * `memoWriteOnce` · `bottomUpTable`)이다. 넷 다 같은 낭비를 이야기하므로
 * definition 의 무게중심을 서로 다른 데 둔다.
 *
 *   여기            **표 전체와 그것이 내는 답** — 최적화 문제를 표 하나로 풀되
 *                   칸마다 이미 적힌 칸 몇을 견주어 정한다.
 *   overlapping*    되풀이가 생긴다는 **성질** (문제 진단).
 *   memoWriteOnce   한 번 적고 그 뒤로는 읽는다는 **저장 동작**.
 *   bottomUpTable   호출이 아예 생기지 않게 하는 **순서**.
 *
 * exemplarKeywords 도 겹치지 않게 갈랐다 — 여기는 배낭 · 최적 부분 구조 · 편집
 * 거리 같은 응용 이름을 맡고, 조각들은 각자의 구어(재귀 트리 · 메모이제이션 ·
 * 타뷸레이션)를 맡는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const dynamicProgrammingConcept: FacetConceptSource = {
  id: 'dynamicProgramming',
  label: 'Dynamic Programming (Table Method)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:dynamicProgramming',

  surface: {
    definition:
      'Solving an optimization problem by filling a table of subproblem answers once, where each entry is decided by comparing a small fixed number of entries already written.',
    exemplarKeywords: [
      'dynamic programming',
      '0/1 knapsack',
      'optimal substructure',
      'DP table',
      'tabulation',
      'edit distance',
      'longest common subsequence',
      'coin change',
      'take it or leave it',
      'combinatorial optimization',
    ],
  },

  briefing: {
    observable: [
      'The empty table appears in full before any value does — five rows for how many items may be used and eleven columns for the weight limit — and row 0 is filled with zeros as the floor every other row stands on.',
      'Two arrows reach into a cell from the row above through a gap cut between the rows: a straight grey one from the same column, and a curved yellow one from the column that is left after the item\'s weight is subtracted.',
      'When the item outweighs the current limit only the straight arrow arrives and the value above is copied down unchanged, and the caption names the weight and the limit that made it impossible.',
      'A cell that won by taking the item keeps a small dot beside its number, so after the run the choices are still on screen and can be traced backwards from the last cell.',
      'Row 3 ends up almost identical to row 2 — a heavy, low-value item loses at nearly every limit — and the row is still filled out cell by cell, because losing is only established by filling it.',
      'Three counters run along the bottom: cells filled, comparisons made, and cells where the item was too heavy. The first stops at 44, which is exactly the number of cells the table has to fill.',
      'The code panel highlights the line that matches the current step, so the caption and the source move together through the same nested loops.',
    ],

    screen: {
      affordances: [
        'Playback controls: play, step, pause, reset and a speed selector. Stepping is how a reader can stop on one cell and read the two arrows feeding it before the value lands.',
        'The data is fixed — four items, a limit of 10, and 90 as the answer in the bottom-right cell — so an article can name those numbers and expect them on screen.',
        'The code panel starts empty with a button for adding a language; one or two of the six languages can be shown at a time, and the highlighted line follows the animation.',
      ],
    },

    useWhen: [
      'The article claims a table replaces recursion and the reader cannot see where the recursion went. Every cell here is settled by reading two cells already written above it, and no cell is ever computed a second time.',
      'The reader accepts the final number but not how the chosen items are recovered from it. The dots left on cells that took the item are the trail, and following them backwards from the last cell is a thing to point at.',
      'A passage needs the cost of the method stated as a size rather than an impression: the cell counter ends at exactly the number of cells, so the work is the table and nothing more.',
      'The prose asserts that a heavy, low-value option is simply dominated. Watching an entire row be filled and come out nearly unchanged is what shows that domination is a result of the sweep, not an assumption before it.',
    ],

    avoidWhen: [
      'The article means dynamically typed or dynamically dispatched code, runtime code generation, or dynamic memory — unrelated senses of the word that share nothing with this method.',
      'The subject is a rule that commits to one choice per step and never reconsiders it. Nothing here is decided without comparing two stored answers.',
      'The problem in question has no repeated subproblems, so a table would be filled once, read once, and paid for twice.',
      'The point is a recursive implementation that caches its results, or the call tree that motivates caching. This screen starts with the table already laid out and calls nothing.',
      'The subject is a continuous optimum found by calculus or linear programming rather than a discrete choice per item.',
    ],

    contrastWith: [
      {
        concept: 'overlappingSubproblems',
        note: 'That names the waste this method removes — one term solved again and again across branches — while this shows the table that keeps each answer exactly once.',
      },
      {
        concept: 'memoWriteOnce',
        note: 'Two routes to the same saving: one keeps the recursion and writes each result down as it resolves, this one settles the order in advance so no call is ever made.',
      },
      {
        concept: 'bottomUpTable',
        note: 'The same forward filling reduced to one row where a cell needs only its two predecessors; here the table is two-dimensional and a cell reaches into a column chosen by the item\'s weight.',
      },
      {
        concept: 'branchAndBound',
        note: 'The same knapsack answered two ways: filling every cell of a table whose size is known in advance, or opening a few branches and proving the rest cannot win.',
      },
      {
        concept: 'greedy',
        note: 'Both build an answer step by step, but a greedy rule keeps only what looks best now while this keeps the best answer for every limit and lets the winner appear at the end.',
      },
    ],
  },
};
