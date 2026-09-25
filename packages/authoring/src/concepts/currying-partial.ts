/**
 * curryingPartial 개념 선언.
 *
 * canonical facet 은 `facet:curryingPartial` — `add = a => b => c => a + b + c` 는 칸 셋이 열린 함수다. `add(5)` 가
 * 칸 a 를 닫아 칸 둘짜리 `b => c => 5 + b + c` 가 `add5` 에, `add5(2)` 가 칸 하나짜리 `c => 5 + 2 + c` 가 `add7` 에,
 * `add7(10)` 이 마지막 칸을 닫아 함수가 아닌 값 17 이 `total` 에 담긴다. 남은 칸 3 · 2 · 1 · 0. 끝에도 `add` 는
 * 칸 셋 그대로다. 걸음 여섯 (시작 포함) — 줄 하나가 한 걸음이다.
 *
 * ── 묶음 안에서의 자리 (함수 다섯)
 *
 * **받을 것이 하나씩 줄어드는 모양**을 맡는다. "currying · partial application · one at a time · remaining parameters" 를
 * 이쪽이 독점한다. 붙잡은 변수의 수명(closure · captured · alive)은 `closureCaptures`, 한 벌이 이름을 옮겨 다니는 일
 * (first-class · higher-order · same body)은 `functionAsValue` 에 두고 definition 에서 쓰지 않는다.
 *
 * 전제: 남은 함수를 `c => 5 + 2 + c` 처럼 받은 값을 채운 글자로 보이는 것은 교육용 표기다. 실제 런타임은 받은
 * 값을 쥐고 있을 뿐 (사실상 클로저) 함수 글자를 다시 쓰지 않는다. 화면은 각주를 달지 않으므로 여기서 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const curryingPartialConcept: FacetConceptSource = {
  id: 'curryingPartial',
  label: 'Currying and Partial Application',
  canonicalFacet: 'facet:curryingPartial',

  surface: {
    definition:
      'Currying rewrites a multi-parameter function as a chain taking one input at a time; each supplied input fixes a parameter and yields a new function awaiting the remaining ones, until none remain.',
    exemplarKeywords: [
      'currying',
      'curried function',
      'partial application',
      'a => b => c',
      'add(5)(2)(10)',
      'arity',
      'functools.partial',
      'fix the first argument',
      'function that returns a function',
      'Haskell functions take one argument',
    ],
  },

  briefing: {
    observable: [
      'The program sits on top: `let add = a => b => c => a + b + c`, `let add5 = add(5)`, `let add7 = add5(2)`, `let total = add7(10)`, `show total`. Below it each name gets a row: the name, input slots in aligned columns a · b · c, the remaining function text, and a count like "3 left".',
      '`add` appears with three open slots — "Open slots: 3."',
      'For `add(5)` a copy of add\'s row drops to a new row while the original stays; 5 flies from the line into slot a and closes it, and `add5` holds `b => c => 5 + b + c`, "2 left". `add5(2)` closes b and `add7` holds `c => 5 + 2 + c`, "1 left".',
      '`add7(10)` closes the last slot: "Open slots: 0. So total holds no function but the value 17." The rows form a staircase of open slots, 3 · 2 · 1 · 0, and 17 is printed.',
      'The final caption notes "add is unchanged. Open slots: still 3." Supplying an input never alters the function it was given to. Six steps, counting the start: one per line.',
      'Printing the remaining function with received values filled in (`c => 5 + 2 + c`) is a teaching notation; a real runtime keeps the received values alongside the function and never rewrites its text. The code is a small language-neutral notation. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen applies the three inputs one per step by itself and stops after printing 17.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to any application step shows an input flying into the next open slot.',
        'The function and the three inputs are fixed.',
      ],
    },

    useWhen: [
      'A reader sees `add(5)` return something that is not a number and does not know what it is. The row with two open slots answers: a function still waiting for b and c.',
      'The article explains partial application — prefilling some inputs to get a reusable specialized function — and needs to show that the original function is left intact.',
    ],

    avoidWhen: [
      'The article is about closures and how long captured variables live. The internal mechanism that holds the received values is not drawn.',
      'The subject is default parameters or optional arguments. Every input here must be supplied, one at a time, in order.',
      'The article needs a library helper such as `functools.partial` or `bind` that fixes several inputs at once. Here exactly one input is given per call.',
    ],

    contrastWith: [
      {
        concept: 'closureCaptures',
        note: 'A curried function holds on to the inputs already supplied, which is typically implemented as a closure. The claim here is about the count of missing inputs falling to zero; closure is about a remembered variable living beyond the call that made it.',
      },
      {
        concept: 'functionAsValue',
        note: 'Currying depends on functions being values, since each step returns one. The difference is that every supplied input produces a new, smaller function, while passing a function between names never creates one.',
      },
    ],
  },
};
