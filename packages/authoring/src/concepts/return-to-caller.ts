/**
 * returnToCaller 개념 선언.
 *
 * canonical facet 은 `facet:returnToCaller` — `let total = square(3) + square(4)` 한 줄에 부르기가 둘이다. 왼쪽
 * 부르기가 먼저 불려 `return n * n` 이 9 를 돌려주면, 9 가 글자 `square(3)` 이 적혀 있던 바로 그 자리에 끼워진다.
 * 같은 몸이 돌려준 16 은 오른쪽 자리로 간다. 두 자리가 값이 된 뒤에야 `9 + 16` 을 셈해 `total` 에 25. 걸음 아홉
 * (시작 포함), 가장 깊이 1 — 재귀가 아니다.
 *
 * ── 묶음 안에서의 자리 (함수 다섯)
 *
 * **값이 밖으로 나와 앉는 자리**를 맡는다. "return statement · call site · replaced by the result" 을
 * 이쪽이 독점한다. 인자가 들어가는 방식(copy · by reference)은 `passByValueVsReference` 에 두고 쓰지 않는다.
 * `callStackUnwind` 와는 "돌려준 값" 이 겹치므로 frame · stack · pop · unwind · pending 을 쓰지 않는다 —
 * 그쪽은 재귀 안에서 틀이 거꾸로 걷히는 차례, 이쪽은 재귀 없이 값이 식의 어느 글자 자리로 가는가다.
 *
 * 전제: 호출식 글자가 값으로 바뀌어 찍히는 것은 교육용 그림이다. 실제 실행기는 소스 글자를 고쳐 쓰지 않고,
 * 식을 셈하는 중간에 그 자리의 값으로 쓴다. 화면은 각주를 달지 않으므로 여기서 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const returnToCallerConcept: FacetConceptSource = {
  id: 'returnToCaller',
  label: 'Return Value (Back to the Call Site)',
  canonicalFacet: 'facet:returnToCaller',

  surface: {
    definition:
      'A return statement sends its result back to the exact call site in the line that invoked the function; the call is replaced by that result, and the rest of the line computes only then.',
    exemplarKeywords: [
      'return statement',
      'return value',
      'what does return do',
      'where does the returned value go',
      'function call inside an expression',
      'call site',
      'evaluating square(3) + square(4)',
      'left-to-right evaluation of function calls',
      'return vs print',
    ],
  },

  briefing: {
    observable: [
      'The program is four lines: `function square(n)`, `return n * n`, `let total = square(3) + square(4)`, `show total`. Each call expression on the third line has its own color.',
      'The left call runs first. Its step shows `n = 3`; the `return` line hands back 9, and the 9 flies from the return line into the spot where `square(3)` was written. The line now reads `let total = 9 + square(4)`, with the original call text kept small above the 9.',
      'The right call then runs the same body with `n = 4`, and 16 lands in the right-hand spot, making the line `let total = 9 + 16`.',
      'Only after both spots hold values does a separate step add them: "9 + 16 = 25, into total". The last line prints 25.',
      'Nine steps in all, counting the start: the third line is visited five times (two calls, two arrivals, the final addition) and the `return` line twice. No call goes deeper than one level; nothing here is recursive.',
      'Replacing the call text with its value is a way of drawing it; a real runtime does not rewrite source code but uses the value in that position of the expression. The code uses a small language-neutral notation (`function`, `let`, `return`, `show`). The screen does not footnote either point.',
    ],

    screen: {
      affordances: [
        'The screen plays both calls and the addition by itself and stops after printing 25.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to an arrival step holds a value on its way into its call\'s spot.',
        'The function and both arguments are fixed.',
      ],
    },

    useWhen: [
      'A beginner treats `return` as printing something or as sending a value to an unspecified place. The 9 settling exactly where `square(3)` was typed answers where it goes.',
      'The article explains that an expression containing two calls waits for both results before combining them, and that each result goes to its own call.',
    ],

    avoidWhen: [
      'The article is about recursion or how nested calls finish in reverse order. There is one level of calls here.',
      'The subject is how arguments are passed in — copies versus references. The arguments here are plain literals.',
      'The article discusses returning several values, early returns, or functions without a return. The single body here always returns one number.',
    ],

    contrastWith: [
      {
        concept: 'callStackUnwind',
        note: 'Both follow a returned value to where it is used. Unwinding is about the order in which nested recursive calls finish and hand results inward; this is about a single level, where the result simply takes the place of the call that asked for it.',
      },
      {
        concept: 'passByValueVsReference',
        note: 'Returning is the way out of a function, parameter passing the way in. One concerns where the single result lands; the other concerns whether the function received its own copy or the caller\'s variable.',
      },
      {
        concept: 'exceptionPropagate',
        note: 'A return always goes to the call that invoked the function, carrying a value that the expression then uses. A thrown exception skips that call\'s remaining work and keeps climbing until something catches it.',
      },
      {
        concept: 'loopVsRecursion',
        note: 'Here a result takes the place of one call. When a recursion is weighed against a loop, that same hand-back happens once per level, while an iterative version keeps its running total in one variable.',
      },
    ],
  },
};
