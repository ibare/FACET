/**
 * foldAtCompile 개념 선언.
 *
 * canonical facet 은 `facet:foldAtCompile` — 네 줄 함수 `timeout(n)` 의 연산 마디 여섯을 하나씩 본다.
 * 두 쪽이 다 수인 넷은 접히고(`60 * 60` → 3600 → 3600000 · `2 + 3` → 5 → 20), 이름이 걸린 둘(`20 - n` ·
 * `ms * tries`)은 그대로 남는다. 실행 때 셈하는 연산은 6 → 2. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `foldAndSweep` 은 전파 + 폴딩과 죽은 코드 제거를 잇달아 돌려 두 패스의 몫이 얽히는 것을 보이고,
 * 형제 `unusedIsRemoved` 는 줄을 지우는 쪽이다. 이쪽의 한 동사는 "안쪽부터 접히다가 이름에서 멈춘다" 다 —
 * 줄은 하나도 없어지지 않고 이름을 수로 바꿔 넣지도 않는다. 그래서 definition 은 compile time · literal operands ·
 * innermost · 이름이 위로의 접힘을 막는다는 쪽 낱말을 쥐고, pass · propagation · delete 를 쓰지 않는다.
 *
 * 전제 (설명 글 `foldAtCompile.md`): 원시 프로그램은 어느 언어도 아닌 표기다. 상수 전파는 하지 않는다 —
 * L4 의 `ms` 는 위에서 수로 정해졌어도 이름이라 접지 않는다. 폴딩 한 가지를 한 번 돌린 모습이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const foldAtCompileConcept: FacetConceptSource = {
  id: 'foldAtCompile',
  label: 'Constant Folding at Compile Time',
  canonicalFacet: 'facet:foldAtCompile',

  surface: {
    definition:
      'Constant folding evaluates an operator at compile time when both its operands are literal numbers, working outward from the innermost; one variable operand leaves that operator, and every operator above it, for run time.',
    exemplarKeywords: [
      'constant folding',
      'compile-time evaluation',
      'constant expression',
      'evaluate at compile time instead of run time',
      '60 * 60 * 1000 becomes 3600000',
      'constexpr',
      'expression tree evaluation',
      'post-order traversal of an expression',
      'what the compiler precomputes',
    ],
  },

  briefing: {
    observable: [
      'Four lines of one function stand as L1 to L4: `function timeout(n)`, `let ms = 60 * 60 * 1000`, `let tries = (2 + 3) * 4 - n`, `return ms * tries`. Under each expression a bracket marks one operation node; multiplication binds before addition and subtraction, and equal levels group from the left, so `60 * 60 * 1000` is `(60 * 60) * 1000`.',
      'The compiler visits nodes line by line, and inside a line from the innermost out. When both sides of a node are numbers, the two operands and the operator draw together and shrink into one highlighted number: "L2 · 60 * 60 — both sides are numbers. Folded: 3600", then "3600 * 1000 … Folded: 3600000".',
      'On L3, `2 + 3` folds to 5 (the parentheses disappear with it) and `5 * 4` folds to 20. The next node, `20 - n`, pulls inward and springs back with a border on the blocking side: "the right side is not a number: n. Kept."',
      'On L4, "ms * tries — neither side is a number. Kept." `ms` was fixed to 3600000 one line above, but it is still a name here, and this compiler does not substitute names with their values.',
      'Two counters, Folded and Kept, end at 4 and 2, and "Operations at run time" moves from 6 → 6 to 6 → 2. No line disappears. The run is seven steps counting the start, one per operation node.',
      'The folded function returns the same result for every `n` (61200000 when `n` is 3). The code is written in a small language-neutral notation, not in any one real language.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one operation node per step, and stops after the last node on L4.',
        'A Replay button and a playback strip sit below it. Dragging back to the `20 - n` step holds the moment a name stops the folding while the numbers to its left have already collapsed.',
        'The program is fixed, so every line, caption and count can be quoted exactly as it appears.',
      ],
    },

    useWhen: [
      'The article explains that an expression such as `60 * 60 * 1000` costs nothing at run time because the compiler has already turned it into one number.',
      'A reader asks why `(2 + 3) * 4 - n` is only partly simplified; the step where `n` blocks the subtraction, and therefore everything above it, answers that directly.',
    ],

    avoidWhen: [
      'The article is about constant propagation, replacing a variable by its known value. That is deliberately not done here: `ms` stays a name.',
      'The subject is `fold` or `reduce` on collections. Folding here is arithmetic done by a compiler on source code.',
      'The point is floating-point rounding or overflow during folding. Only small integer addition, subtraction and multiplication appear.',
    ],

    contrastWith: [
      {
        concept: 'foldAndSweep',
        note: 'Folding on its own ends at the first name. Adding propagation lets numbers flow into names further down, and a following deletion pass then removes the lines that became unused.',
      },
      {
        concept: 'unusedIsRemoved',
        note: 'Folding rewrites an expression but keeps every line; removing dead code deletes whole lines whose names nobody reads. One shrinks work inside a line, the other shrinks the program.',
      },
      {
        concept: 'typeFlowsUp',
        note: 'Both work bottom-up on an expression tree. Type checking computes a type for every node regardless of what is known at compile time; folding computes a value only where both children are already numbers.',
      },
      {
        concept: 'reduceFold',
        note: 'Reduce combines values at run time with an accumulator. Constant folding combines numbers written in the source before the program runs, and stops wherever a value is unknown.',
      },
    ],
  },
};
