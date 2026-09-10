/**
 * bottomUpTable 개념 선언.
 *
 * canonical facet 은 `facet:bottomUpTable` — 조각이다. 한 줄짜리 표를 왼쪽에서
 * 오른쪽으로 채우고, 칸마다 바로 앞 두 칸에서 화살이 뻗어 온다. 화살은 지워지지
 * 않아 재생이 끝나면 오른쪽만 가리키는 화살 여덟이 남고, 마지막에 창 하나가
 * 마지막 두 칸에 앉는다. 셈은 여섯 칸 · 덧셈 넷 · 재귀 호출 0 이다.
 *
 * ── 묶음 안에서의 자리 (dynamic-programming 묶음)
 *
 * 이 조각은 **순서**만 맡는다 — 작은 쪽부터 계산하면 필요한 값이 이미 적혀 있어
 * 부를 일이 생기지 않는다는 것, 그리고 각 걸음이 실제로 읽은 것이 앞의 둘뿐이라
 * 표를 다 들고 있을 이유가 없다는 것. 저장 동작은 `memoWriteOnce`, 되풀이라는
 * 진단은 `overlappingSubproblems`, 표 전체와 답은 `dynamicProgramming` 의 몫이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bottomUpTableConcept: FacetConceptSource = {
  id: 'bottomUpTable',
  label: 'Bottom-Up Table (Filling in Order Instead of Calling)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:bottomUpTable',

  surface: {
    definition:
      'Computing subproblem answers in increasing order of size so every value a step needs is already written, which replaces the recursive calls with a single forward loop.',
    exemplarKeywords: [
      'tabulation',
      'bottom-up',
      'iterative fibonacci',
      'loop instead of recursion',
      'rolling variables',
      'constant space dynamic programming',
      'base case first',
      'fill left to right',
      'no call stack',
    ],
  },

  briefing: {
    observable: [
      'The table is a single row and the cells fill strictly left to right; the first two are written straight from the definition, with no arrow feeding them.',
      'Filling a cell draws two arcs from the two cells immediately to its left, and copies of those values ride the arcs and meet above the target cell to become its sum.',
      'The arcs are never erased, so the finished row carries eight of them and every single one points rightward — nothing on screen ever leads back to the left.',
      'The closing count names six cells filled in four additions with zero recursive calls, and the zero is a counted result of this run rather than a label.',
      'A window slides in from the left and settles over the last two cells, marking the only cells any step ever needed to have on hand.',
    ],

    screen: {
      affordances: [
        'The row fills itself after mount and stops with all the arrows and the window still in place.',
        'Two buttons: Replay, and a step control that refills the row one cell at a time from empty — the way to stop while a pair of values is still travelling along the arcs.',
        'The row is fixed at six cells, so an article can name the eight arrows, the four additions and the two cells the window lands on.',
      ],
    },

    useWhen: [
      'The article says an iterative version is "the same algorithm without recursion" and the reader wonders where the calls went. Ordering the cells so both operands already exist is the whole substitution, and it shows as arrows that never turn back.',
      'A passage argues that keeping the entire table is unnecessary and two variables suffice. The window closing over the last two cells is the evidence, and it follows from what the steps actually read rather than from a claim about the algorithm.',
      'The reader has to accept that a step\'s inputs are guaranteed to be ready before it runs — the condition that makes this ordering legal in the first place.',
      'The prose contrasts the direction of computation, and the downward direction has already been established; the upward one needs the same concreteness.',
    ],

    avoidWhen: [
      'The recurrence in question reaches back an unbounded or data-dependent distance, where the last two values are not enough and the space argument fails.',
      'The subject is choosing which subproblems to visit at all, in a problem where computing every entry in order would be mostly wasted work.',
      'The article means "bottom-up" in the sense of parsing, testing, budgeting or organisational design.',
      'The point is the space consumed by a call stack, or profiling memory in general. What is measured here is which cells a step read.',
      'The subject is a two-dimensional table where a cell reaches across the previous row by a data-dependent offset; every cell here reads its two immediate neighbours.',
    ],

    contrastWith: [
      {
        concept: 'memoWriteOnce',
        note: 'Both make sure each term is computed once; that one keeps the calls and writes the results down as they resolve, this one arranges the order so no call is ever issued.',
      },
      {
        concept: 'overlappingSubproblems',
        note: 'The same recurrence, opposite directions: expanded downward it repeats terms across branches, computed upward in order the repetition has nowhere to occur.',
      },
      {
        concept: 'dynamicProgramming',
        note: 'The forward fill at full size — one row of two-term additions here, a rectangle of comparisons there, with a choice recorded in each cell.',
      },
    ],
  },
};
