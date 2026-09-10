/**
 * overlappingSubproblems 개념 선언.
 *
 * canonical facet 은 `facet:overlappingSubproblems` — 조각이다. `f(5)` 를 정의
 * 그대로 펼친 호출 나무가 걸음마다 한 가지씩 자라고, 그 아래 선반에 항마다 더미가
 * 쌓인다. 끝나면 호출 열다섯 · 서로 다른 항 여섯 · `f(1)` 혼자 다섯 번이 남는다.
 *
 * ── 묶음 안에서의 자리 (dynamic-programming 묶음)
 *
 * 이 조각만 **문제 쪽**을 맡는다. 저장도 순서도 다루지 않고, 되풀이가 실제로
 * 생긴다는 성질 하나만 말한다. 그래서 definition 의 주어가 방법이 아니라
 * "property" 이고, 표 · 메모 · 상향식이라는 낱말을 definition 에 넣지 않았다 —
 * 넣으면 나머지 셋과 벡터가 붙는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const overlappingSubproblemsConcept: FacetConceptSource = {
  id: 'overlappingSubproblems',
  label: 'Overlapping Subproblems (Why Plain Recursion Repeats Itself)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:overlappingSubproblems',

  surface: {
    definition:
      'The property that expanding a recursive definition literally makes the same subproblem reappear on separate branches, so the number of calls grows far past the number of distinct terms.',
    exemplarKeywords: [
      'overlapping subproblems',
      'exponential recursion',
      'naive fibonacci',
      'recursion tree',
      'redundant recomputation',
      'why is recursive fib so slow',
      'repeated calls',
      'call count blows up',
      'the same term solved again',
    ],
  },

  briefing: {
    observable: [
      'The call tree grows one node at a time in the order the calls actually happen, each new branch sliding down out of its parent\'s position into its own place.',
      'A term met for the first time is drawn faintly and a term already solved on another branch is drawn dark, with a number in the corner saying how many times that term has now turned up.',
      'Every node that sprouts drops a copy of itself onto a shelf below, where each distinct term owns exactly one pile — the piles on the left grow tall and the ones on the right stay short.',
      'A repeated term is expanded again in full, down to its own leaves, so the duplicated work is drawn rather than summarised.',
      'The closing count is three numbers at once: fifteen calls to reach the value 5, six distinct terms, and f(1) alone solved five times.',
    ],

    screen: {
      affordances: [
        'The tree expands on its own after mount and stops on the summary, with the shelf left standing so the piles can be compared afterwards.',
        'Two buttons: Replay, and a step control that re-walks the expansion one call at a time — the way to watch a repeat count tick from 1 to 2 on a term that was already solved.',
        'The term is fixed at f(5), close to the largest tree that fits in one view, so the counts named in prose stay true.',
      ],
    },

    useWhen: [
      'The prose asserts that the plain recursive definition is exponential and the reader takes it on faith. Fifteen calls standing against six distinct terms, with the shelf showing where the extra nine went, turns the assertion into something to look at.',
      'A section is about to introduce a store or a table and the reader has no reason to want one yet. The waste has to be visible before the remedy reads as anything but extra machinery.',
      'The reader believes recursion is slow because it is recursion. Here the depth is small and it is the width — the same small terms demanded by many branches — that grows.',
      'An argument turns on which terms suffer most: the piles rise towards the small end, because the smaller a term is the more branches need it.',
    ],

    avoidWhen: [
      'The article is about recursion depth, stack overflow, or tail-call elimination. The cost shown here is width, and the deepest path is only five nodes long.',
      'The subject is a split whose parts never coincide, where each subproblem is met exactly once and there is nothing to overlap.',
      'The article already assumes a memo and needs the mechanics of writing and reading it, not the reason for keeping one.',
      'The topic is duplicated work between processes, repeated network requests, or cache hit rates. "Overlapping" here means identical subproblem instances inside a single expansion.',
      'The prose needs the running time derived as a recurrence relation. This counts one concrete expansion and does not generalise on screen.',
    ],

    contrastWith: [
      {
        concept: 'memoWriteOnce',
        note: 'The complaint and its answer: the dark repeated nodes here are exactly the ones that a memo table turns into a single read, taking their subtrees with them.',
      },
      {
        concept: 'bottomUpTable',
        note: 'The same recurrence from the other end — expanded downward it repeats itself, computed upward in increasing order it never can.',
      },
      {
        concept: 'dynamicProgramming',
        note: 'This is the property that makes a table worth filling; without terms recurring across branches the table would be built, read once, and never repay itself.',
      },
      {
        concept: 'divideConquerCombine',
        note: 'Both cut a problem into smaller ones, but the parts of a divide-and-conquer split are disjoint, and here the parts of different branches are literally the same term.',
      },
    ],
  },
};
