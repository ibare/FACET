/**
 * pasteTheBody 개념 선언.
 *
 * canonical facet 은 `facet:pasteTheBody` — 여섯 줄 두 함수(`cube(x)` · `volume(side)`)에서 부른 줄
 * `let v = cube(side + 1)` 을 연다. 식인 인자는 `let x = side + 1` 로 한 번 묶이고, 몸 줄 `let sq = x * x` 가
 * 흘러 들어오고, `return sq * x` 의 식이 받는 이름으로 가 `let v = sq * x` 가 된다. `cube` 의 정의는 제자리.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `inliningTradeoff` 은 몸 길이의 한계로 붙일 함수를 고르는 잣대를, 형제 `inlineGrowsCode` 는 붙일 때마다
 * 크기와 실행이 반대로 벌어지는 셈을 맡는다. 이쪽의 한 질문은 "붙여 넣으면 인자와 돌려준 값은 어디로 가는가" 다.
 * 그래서 definition 은 argument · parameter · bound once · returned expression · receiving variable 쪽 낱말을 쥐고,
 * size · executed · threshold · cost 를 쓰지 않는다.
 *
 * 전제 (설명 글 `pasteTheBody.md`): 원시 프로그램은 어느 언어도 아닌 표기다. 이 데이터에는 이름 겹침이 없다 —
 * 겹쳤다면 붙이는 쪽 이름 뒤에 `2` 를 붙였을 것이다. 정의는 지우지 않는다. 한 방식이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pasteTheBodyConcept: FacetConceptSource = {
  id: 'pasteTheBody',
  label: 'Inlining a Call: Where the Argument and Return Value Go',
  canonicalFacet: 'facet:pasteTheBody',

  surface: {
    definition:
      'Inlining substitutes a function body at its call site: an argument that is an expression is bound once to the parameter name in a new line, and the returned expression is assigned straight to the variable that received the call.',
    exemplarKeywords: [
      'function inlining',
      'inline expansion',
      'substitute the function body',
      'what happens to the parameters when inlined',
      'argument evaluated once',
      'beta reduction',
      'macro expansion vs inlining',
      'call replaced by body',
      'how inlining works step by step',
    ],
  },

  briefing: {
    observable: [
      'Two functions stand side by side, "Called function" on the left and "Calling function" on the right: `function cube(x)` with `let sq = x * x` and `return sq * x`, and `function volume(side)` with `let v = cube(side + 1)` and `return v`. The caption names the site: "Call to inline: let v = cube(side + 1)".',
      'Step 1: "The argument is an expression — bound once, before the call: let x = side + 1". The argument leaves the call\'s parentheses and the name `x` leaves the header of `cube`; they meet in a new line above the call, which moves down one row.',
      'Step 2: "A body line flows into the call site: let sq = x * x".',
      'Step 3: "The return value goes to the receiver; the call is gone: let v = sq * x". The expression of `return` crosses into the call line and pushes out `cube(side + 1)`. A last note reads "The definition of cube stays where it was".',
      '`volume` ends as four lines — `let x = side + 1`, `let sq = x * x`, `let v = sq * x`, `return v` — with dotted links from each pasted line to where it came from. `cube` keeps its three lines. The run is four steps counting the start.',
      'The argument is bound once because `x` is used three times in the body; copying `side + 1` into each use would repeat the addition. An argument that was already a name or a number would have been substituted directly, without a new line. `volume(2)` returns 27 before and after, and the operations stay at three.',
      'The names in the two functions do not collide here; if they did, the pasted names would get a `2` suffix. The code is in a small language-neutral notation.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one move per step, and stops once the call has disappeared.',
        'A Replay button and a playback strip sit below it. Dragging back to step 1 holds the moment the argument and the parameter name meet in their own line.',
        'The program is fixed, so every line and caption can be quoted exactly as it appears.',
      ],
    },

    useWhen: [
      'The article explains what inlining does to one call and needs to show that the parameter becomes an ordinary variable holding the argument, not a textual copy of it.',
      'A reader asks where `return` goes once there is no call to return to; the step where its expression becomes the right-hand side of `let v` answers that.',
    ],

    avoidWhen: [
      'The article is about the cost of inlining or deciding which functions to inline. No sizes or instruction counts are compared here.',
      'The subject is textual macro expansion that repeats the argument at every use. The point here is precisely that the argument is evaluated once.',
      'The point is recursion or a function calling itself; the callee here calls nothing.',
    ],

    contrastWith: [
      {
        concept: 'inlineGrowsCode',
        note: 'Substituting a body answers where arguments and results go. Repeating that substitution at every call site raises a different question: how much code it adds against the instructions it saves.',
      },
      {
        concept: 'inliningTradeoff',
        note: 'Substitution is the same for any callee. Which callees are worth substituting is a separate decision, made by weighing body length against a limit.',
      },
      {
        concept: 'returnToCaller',
        note: 'At run time a return sends its value back to the call expression. After inlining there is no call, so the returned expression is written straight into the variable that would have received it.',
      },
      {
        concept: 'passByValueVsReference',
        note: 'Binding the argument to a fresh parameter variable is what passing by value does at run time. Inlining performs that same binding once, in the source, with a plain assignment line.',
      },
    ],
  },
};
