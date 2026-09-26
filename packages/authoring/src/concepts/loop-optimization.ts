/**
 * loopOptimization 개념 선언.
 *
 * canonical facet 은 `facet:loopOptimization` — 여덟 줄 함수 `weigh(list, rate)` 에 꺼내기(끔 · 켬)와 펼치기
 * (배수 1 · 2 · 4)를 차례로 걸고, 반복 횟수(0 · 1 · 4 · 10)를 바꿔 실행 연산 · 반복 관리 · 코드 줄을 센다.
 * 꺼내기는 반복 10 에서 51 → 42, 반복 1 에서 본전, 반복 0 에서 1 → 2 로 손해. 배수 1 · 2 · 4 는 반복 관리
 * 21 · 11 · 5 · 코드 줄 8 · 9 · 13.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * 조각 `hoistInvariant` 은 불변 판정과 들려 나감의 장면, `unrollLoop` 은 몸이 여러 벌로 펴지고 나머지가 뒤로
 * 떨어지는 장면이다. 이쪽은 두 변환의 **값이 반복 횟수에 걸려 있다**는 것을 손잡이로 맡는다. 그래서 definition 은
 * trip count · pay off · 한 번도 안 도는 반복의 손해 · 배수가 코드 줄과 맞바꾸는 쪽 낱말을 쥐고, 조각이 독점한
 * invariant 판정 · shifted index · leftover · straight-line 을 쓰지 않는다.
 *
 * 전제 (설명 글 `loopOptimization.md`): 원시 프로그램은 어느 언어도 아닌 표기다. 코드 패널은 그 프로그램이 아니라
 * 두 변환의 비용을 셈하는 컴파일러 함수이고 IR 하나를 여섯 언어로 옮긴 것이다. 연산 하나 = 식의 연산 기호 하나
 * (칸 읽기의 `+` 도 센다). 반복 횟수를 컴파일할 때 아는 반복이다. 배수 4 는 예로 정한 값이다. 한 방식이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const loopOptimizationConcept: FacetConceptSource = {
  id: 'loopOptimization',
  label: 'Loop Optimization Payoff vs Trip Count (Hoisting and Unrolling)',
  canonicalFacet: 'facet:loopOptimization',

  surface: {
    definition:
      'Whether hoisting and unrolling pay off depends on the trip count: hoisting saves work from two iterations on but costs an extra operation when the loop never runs, and a larger unroll factor trades loop overhead for code size.',
    exemplarKeywords: [
      'loop optimization',
      'is loop unrolling always faster',
      'when does hoisting hurt',
      'zero-trip loop',
      'trip count',
      'unroll factor',
      'loop overhead vs code size',
      'optimization trade-off',
      '-funroll-loops',
      'LICM and unrolling',
      'compiler cost model for loops',
    ],
  },

  briefing: {
    observable: [
      'The function `weigh(list, rate)` stands in eight lines: `let total = 0`, `let i = 0`, `while i < 10`, and a body of `let w = rate * 2`, `total = total + list[i] * w`, `i = i + 1`, then `return total`. The 10 in the condition is the trip-count handle.',
      'With hoisting on, the body lines are tagged "invariant" or "varies" with the reason ("not changed in the loop: rate", "changed in the loop: total · i"), and `let w = rate * 2` moves above the `while` line: "Hoisted above the loop: let w = rate * 2".',
      'With an unroll factor above 1, the working line is copied beside itself, "copy 2", "copy 3", "copy 4", each reading one index further (`list[i + 1]`, `list[i + 2]`, …). The loop head is then marked "rewritten · was while i < 10" and becomes `while i < 8`, the bump becomes `i = i + 4`, and two "leftover" copies drop out after the loop.',
      'Two bars on the right show Exec ops (with "of which loop overhead" as a separate part) and Code lines, each against a dashed "original" length. At the default (trip count 10, factor 4, hoisting on) the final caption reads "Exec ops: 51 → 33 · loop overhead: 21 → 5 · code lines: 8 → 13".',
      'Hoisting alone (factor 1) across the trip counts: 0 gives 1 → 2, 1 gives 6 → 6, 4 gives 21 → 18, 10 gives 51 → 42. At zero trips the hoisted line runs once even though the body never does, so the Exec ops bar grows past its dashed original.',
      'At trip count 10 with hoisting on, factors 1, 2, 4 give loop overhead 21, 11, 5 and Exec ops 42, 37, 33, while Code lines rise 8, 9, 13. Exec ops falls by less than the overhead does because each copy adds one addition to its index read. At trip count 1 with unrolling, the loop never runs and a single leftover copy does the work.',
      'An operation is one operator in an expression, including the `+` inside `list[i + 1]`; real processors may absorb that into address arithmetic. The trip count is known at compile time, which is why the leftover can be straight lines. The factor 4 is an example value, and this is one way a compiler may apply the two transformations.',
    ],

    screen: {
      affordances: [
        'Playback controls plus three handles: "Trip count" (0, 1, 4, 10; starts at 10), "Unroll factor" (1, 2, 4; starts at 4) and "Hoisting" (Off, On; starts On). Each round starts from the original eight lines, hoists before it unrolls, then waits for a handle to move.',
        'The move that makes the idea land is setting the factor to 1 and stepping the trip count down to 0 with hoisting on: the saving shrinks, disappears at 1, and turns into a loss at 0. Stepping the factor up at trip count 10 then shows overhead falling while code lines grow.',
        'The code panel, labelled "Compiler: cost of hoisting and unrolling", starts empty with a "+ Add language" button; the chosen language shows the compiler function that counts the cost of both transformations, highlighting the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article claims a loop optimization is not free and needs numbers showing exactly when it wins, breaks even and loses as the number of iterations changes.',
      'A reader assumes unrolling more is always better; stepping the factor up shows the overhead it removes and the extra code lines it costs in the same round.',
    ],

    avoidWhen: [
      'The article is about vectorization, SIMD, or instruction scheduling of unrolled code. Only operation counts and line counts are shown.',
      'The subject is a loop whose trip count is unknown until run time and the remainder loop needed for it. The count here is known, so the leftover is written out as plain lines.',
      'The point is a database query optimizer choosing a plan. The optimization here rewrites a loop in a program.',
    ],

    contrastWith: [
      {
        concept: 'hoistInvariant',
        note: 'Deciding which line is invariant and moving it is the transformation itself. Asking what that move saves or costs as the number of iterations changes is a separate question with a different answer at zero.',
      },
      {
        concept: 'unrollLoop',
        note: 'Laying the body out several times and handling the leftover is how unrolling is done. Whether it is worth doing depends on how much overhead it removes against how much code it adds.',
      },
      {
        concept: 'loopBack',
        note: 'Every jump back to the condition is one more test the loop must run. Unrolling reduces how many of those jumps happen; it does not change what one of them does.',
      },
      {
        concept: 'inliningTradeoff',
        note: 'Both rewrite code to run fewer instructions at the price of a larger program. Inlining trades per-call overhead against body copies; loop transformations trade per-iteration overhead against copies of the loop body.',
      },
    ],
  },
};
