/**
 * inliningTradeoff 개념 선언.
 *
 * canonical facet 은 `facet:inliningTradeoff` — 세 주소 코드 한 벌(피호출 inc · mix · big 과 `main` 열 줄)에
 * 몸 길이의 한계(0 · 1 · 4 · 8, 처음 4)를 걸어, 몸이 한계 이하인 함수의 부른 자리를 모두 붙인다. 한계를 올리면
 * 크기 26 · 26 · 35 · 49, 실행 49 · 43 · 37 · 33. 자리마다 실행에서 빠지는 것은 늘 둘인데 크기가 느는 폭은
 * 몸 길이를 따라 0 · 3 · 7 로 커진다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * 조각 `pasteTheBody` 는 인자와 돌려준 값이 어디로 가는지 한 자리를 붙이는 장면, `inlineGrowsCode` 는 한 함수를
 * 세 자리에 붙이며 크기와 실행이 반대로 벌어지는 장면이다. 이쪽은 **어느 함수를 붙이고 어느 함수는 그대로
 * 부르는가를 정하는 잣대**와 그 잣대를 올릴 때의 값을 맡는다. 그래서 definition 은 threshold · body length ·
 * which callees · 문턱을 올릴수록 값이 비싸진다는 쪽 낱말을 쥐고, 조각이 독점한 argument · parameter · receiving
 * name · three call sites 를 쓰지 않는다.
 *
 * 전제 (설명 글 `inliningTradeoff.md`): 화면의 프로그램은 세 주소 코드다 — 특정 CPU 가 아닌 교과서 표기. 코드 패널은
 * 그 프로그램이 아니라 한계로 고르고 비용을 셈하는 컴파일러 함수이며 IR 하나를 여섯 언어로 옮긴 것이다. 명령 하나 =
 * 비용 하나. 실제 한계는 몸 길이 하나가 아니다. 정의는 지우지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const inliningTradeoffConcept: FacetConceptSource = {
  id: 'inliningTradeoff',
  label: 'Inlining Threshold: Which Functions Get Inlined',
  canonicalFacet: 'facet:inliningTradeoff',

  surface: {
    definition:
      'An inliner admits only callees no longer than a length threshold; raising the threshold admits bigger functions, each buying the same speed-up per expansion at a steeper price in binary growth than the one before.',
    exemplarKeywords: [
      'inlining heuristic',
      'inline threshold',
      'which functions does the compiler inline',
      'small functions get inlined',
      'inline keyword is only a hint',
      '-finline-limit',
      'LLVM inline cost',
      'always_inline',
      'speed vs code size trade-off',
      '-O2 vs -Os',
    ],
  },

  briefing: {
    observable: [
      'The program is written in three-address code: callees `inc` (body 1 instruction), `mix` (4) and `big` (8), each ending in `return`, and a caller `main(a, b)` of ten instructions that calls inc, mix, big, inc, mix, big, inc, mix in turn. Columns are headed "Callees" and "Caller".',
      'A gauge headed "Body length vs limit" shows the three body lengths against a "limit 4" mark on a 0 · 1 · 4 · 8 scale. The callees are weighed in definition order: "Callees are weighed against the limit in definition order".',
      'At limit 4: "inc — body 1 ≤ limit 4 · sites opened: 3 · Size +0 · executed −6", then "mix — body 4 ≤ limit 4 · sites opened: 3 · Size +9 · executed −6", then "big — body 8 > limit 4 · calls kept: 2 · Size +0 · executed +0". Each callee is tagged "inlined" or "called", and the opened call lines in `main` turn into body instructions with fresh temporaries (`t23` onward).',
      'A second gauge headed "Size and executed" tracks both numbers, ending the round with "Total — size 35 · executed 37 · pasted sites 6 · Instructions in main: 19". Readouts under the controls carry Size, Executed and Pasted sites.',
      'Across the handle: limit 0 gives size 26, executed 49, 0 sites; limit 1 gives 26, 43, 3; limit 4 gives 35, 37, 6; limit 8 gives 49, 33, 8. From 0 to 1 size does not change and executed drops by 6; from 1 to 4 size rises by 9 for a drop of 6; from 4 to 8 size rises by 14 for a drop of 4.',
      'Every pasted site removes the same two instructions (the `call` and the `return`) from execution and adds body length minus one to the size. `main(1, 2)` returns 186659 at every limit. Definitions are never deleted, and a body equal to the limit is still pasted.',
      'Each instruction is counted as cost 1; a real call also sets up a stack frame and saves registers, so the true saving is larger. Real inliners weigh more than body length — call counts, loops, cache fit — and interleave with other passes; this is one way of choosing.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: "Inline limit" with positions 0, 1, 4 and 8, starting at 4. Each round starts again from the original ten-instruction `main`, takes one step per callee and one for the total, then waits for the handle.',
        'The move that makes the idea land is stepping the limit up from 0 to 8: each step pastes one more callee, Executed falls a little less each time, and Size jumps by more each time.',
        'The code panel, labelled "Inliner cost", starts empty with a "+ Add language" button; the chosen language shows the compiler function that picks callees by the limit and totals the cost, highlighting the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why compilers inline small functions but not large ones and needs the diminishing return laid out: the same saving per site bought at a rising price in size.',
      'A reader asks what an inlining limit or threshold option actually controls; sweeping the limit shows which functions cross it and what each crossing does to size and run length.',
    ],

    avoidWhen: [
      'The article is about how a single call is replaced, where the argument goes and what happens to `return`. The choice of which callee to paste is the subject here, not the substitution.',
      'The subject is inline functions in C++ for the one-definition rule or header linkage. Inlining here is an optimization decision measured in instruction counts.',
      'The point is CSS inline styles or inline HTML elements. Nothing here concerns markup.',
    ],

    contrastWith: [
      {
        concept: 'pasteTheBody',
        note: 'Pasting a body is the mechanical substitution at one call site. Deciding which callees deserve that substitution is a policy that weighs the result across the whole program.',
      },
      {
        concept: 'inlineGrowsCode',
        note: 'Pasting one function everywhere it is called makes size and run length move in opposite directions. Admitting function after function by a threshold means each further admission buys less for more.',
      },
      {
        concept: 'loopOptimization',
        note: 'Both trade a larger program for fewer executed instructions. Inlining removes per-call overhead; loop transformations remove per-iteration overhead.',
      },
      {
        concept: 'returnToCaller',
        note: 'A return hands a result back to the call expression at run time. Inlining removes that hand-back altogether for the functions it admits, which is exactly the instruction it saves.',
      },
    ],
  },
};
