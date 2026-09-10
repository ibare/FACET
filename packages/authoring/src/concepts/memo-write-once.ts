/**
 * memoWriteOnce 개념 선언.
 *
 * canonical facet 은 `facet:memoWriteOnce` — 조각이다. 왼쪽은 정의대로 뻗는 가지,
 * 오른쪽은 표. 답이 나오면 값의 복제본이 오른쪽으로 건너가 적히고, 이미 적힌 항을
 * 다시 만나면 값이 왼쪽으로 되돌아 나오며 그 아래로는 아무것도 뻗지 않는다.
 * `f(5)` 기준 방문 아홉 · 푼 항 여섯 · 읽은 것 셋.
 *
 * ── 묶음 안에서의 자리 (dynamic-programming 묶음)
 *
 * 이 조각은 **저장 동작**만 맡는다 — 처음 한 번 적고 그 뒤로는 읽는다는 것, 그리고
 * 읽는 순간 뻗을 뻔한 부분 나무가 통째로 사라진다는 것. 재귀는 그대로 남아 있다는
 * 점에서 `bottomUpTable`(호출을 없앤다) 과 갈리고, 되풀이가 생긴다는 진단은
 * `overlappingSubproblems` 의 몫이라 여기서 다시 말하지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const memoWriteOnceConcept: FacetConceptSource = {
  id: 'memoWriteOnce',
  label: 'Memoization (Write Once, Read Afterwards)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:memoWriteOnce',

  surface: {
    definition:
      'Storing a subproblem result the first time it is computed and returning the stored value on every later encounter, so no term is ever expanded twice.',
    exemplarKeywords: [
      'memoization',
      'top-down dynamic programming',
      'memo table',
      'lru_cache decorator',
      'remember the result',
      'recursion with a dictionary',
      'first call computes, later calls look up',
      'the subtree never opens',
    ],
  },

  briefing: {
    observable: [
      'The frame is split: the recursion branches downward on the left, and a table with one cell per term stands on the right.',
      'When a term resolves, a copy of its value travels rightward into its cell in the table while the original stays on the node — the value is duplicated, not moved away.',
      'Meeting a term that is already written sends the value leftward out of the table into the waiting node, and that node grows no children at all; the space below it stays empty for the rest of the run.',
      'The table fills from its bottom cell upward, because small terms resolve first, so the direction the branches descend and the direction the table fills line up on screen.',
      'The final caption separates the two counts instead of adding them: six terms solved and three read back, for f(5) = 5.',
    ],

    screen: {
      affordances: [
        'The whole expansion plays on mount and stops with the table full and the empty space under the read nodes still showing.',
        'Two buttons: Replay, and a step control for taking the recursion one call at a time — the way to stop exactly on the step where a read replaces a subtree.',
        'The term is fixed at f(5), so an article can name the nine nodes, the six writes and the three reads and expect them to match.',
      ],
    },

    useWhen: [
      'The article says a store "saves time" and the reader pictures a small constant saved per call. What disappears here is an entire subtree, and that only convinces when the emptiness under a read node is on screen.',
      'The reader needs to see that each term is written exactly once — the value leaves for the table on the first resolution and is never rewritten, however often the term comes back.',
      'A passage keeps the recursive shape of the code deliberately and has to justify that the shape costs nothing once results are kept.',
      'The prose is about the direction values travel: out to the store when something is learned, back from the store when something is asked again. Both movements happen on the same axis here, pointing opposite ways.',
    ],

    avoidWhen: [
      'The subject is a store with a capacity and an eviction policy. Nothing here is ever thrown out and the table is sized to the terms it will hold.',
      'The article means caching between machines, requests or processes — HTTP caches, CDN edges, database query caches, invalidation.',
      'The point is removing the recursion altogether rather than keeping it and making repeat encounters cheap.',
      'The problem has no repeated subproblems, so the store would be written on every call and read on none.',
      'The subject is memory profiling or the space the store costs. The cells here are drawn but not measured.',
    ],

    contrastWith: [
      {
        concept: 'overlappingSubproblems',
        note: 'The reason and the remedy: every repeated term drawn out in full there is a term that becomes a single read here, taking its whole subtree with it.',
      },
      {
        concept: 'bottomUpTable',
        note: 'Both stop the recomputation; this one keeps the calls and writes their results down, the other orders the work so the calls never occur.',
      },
      {
        concept: 'dynamicProgramming',
        note: 'The same saving arranged differently — filling every entry of a table in advance, against writing only the terms the recursion actually reaches.',
      },
      {
        concept: 'lruCache',
        note: 'Both hand back a stored answer instead of recomputing it, but a bounded cache must decide what to discard, and this table keeps everything it writes.',
      },
    ],
  },
};
