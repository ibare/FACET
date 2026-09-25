/**
 * functionAsValue 개념 선언.
 *
 * canonical facet 은 `facet:functionAsValue` — 이름 없는 함수 `x => x + 3` 한 벌이 `addThree` 에 담기고,
 * `twice(addThree, 1)` 로 인자 `f` 에 건너간다 (부른 결과가 아니라 함수 그 자체). `twice` 안의 `f(v)` · `f(once)` 는
 * `f` 라는 이름을 따라 4번 줄의 그 몸으로 가서 1 + 3 = 4, 4 + 3 = 7 을 셈한다. 함수가 만들어진 것은 한 번,
 * 몸이 돈 것은 두 번, 출력 7. 걸음 열하나 (시작 포함).
 *
 * ── 묶음 안에서의 자리 (함수 다섯)
 *
 * **함수 한 벌이 이름 사이를 옮겨 다니고 새로 생기지 않는다**를 맡는다. "first-class · higher-order · same single body ·
 * name" 을 이쪽이 독점한다. 바깥 변수를 붙잡아 틀보다 오래 사는 일(closure · captured)은 `closureCaptures`,
 * 받을 것이 줄어드는 모양(remaining · parameter)은 `curryingPartial` 에 두고 definition 에서 쓰지 않는다.
 * `x => x + 3` 은 바깥 이름을 쓰지 않으므로 이 화면의 함수는 아무것도 붙잡지 않는다.
 *
 * 전제: 코드는 어느 한 언어도 아닌 표기다. 이름 없는 함수를 적는 법은 언어마다 다르다 (파이썬 `lambda x: x + 3`,
 * 자바 · C# · 자바스크립트는 화살표). 화면은 각주를 달지 않으므로 여기서 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const functionAsValueConcept: FacetConceptSource = {
  id: 'functionAsValue',
  label: 'First-Class Functions (Passing a Function Like a Value)',
  canonicalFacet: 'facet:functionAsValue',

  surface: {
    definition:
      'Functions are first-class values: one function can be bound to a name and handed to a higher-order function, and invoking it through whichever name now holds it runs that same single body.',
    exemplarKeywords: [
      'first-class function',
      'higher-order function',
      'function as an argument',
      'callback',
      'lambda expression',
      'arrow function',
      'anonymous function',
      'passing a function without calling it',
      'f vs f()',
      'function reference',
    ],
  },

  briefing: {
    observable: [
      'The code has numbered lines: 1 `function twice(f, v)`, 2 `let once = f(v)`, 3 `return f(once)`, 4 `let addThree = x => x + 3`, 5 `let result = twice(addThree, 1)`, 6 `show result`. Beside it sit a column of live frames (name → value) and, on the right, the place for function cards.',
      'Line 4 makes the function without running it: a card `x => x + 3` lifts off the line and goes beside `addThree`, with a counter "body ran: 0".',
      'Calling twice moves the card to the parameter `f` — the caption says "The function in addThree itself goes into f." Every name holding the card has a wire to it; there are two names and still one card.',
      'Inside twice, `f(v)` sends the flow to "the body written on line 4": x = 1 goes into the card and it computes 1 + 3 = 4; then `f(once)` runs the same body with x = 4 to get 7. The counter reaches "body ran: 2".',
      'twice returns 7, `result` becomes 7 and 7 is printed. The function was created once (step 1) and its body ran twice (steps 4 and 7). Eleven steps, counting the start.',
      'The function captures nothing — `x => x + 3` uses only its own parameter. The code is a small language-neutral notation; how an anonymous function is written varies by language (Python `lambda x: x + 3`, arrows in JavaScript, Java and C#). The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole program by itself and stops after printing 7.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to the call of twice shows the one card moving from addThree to f.',
        'The program and the argument 1 are fixed.',
      ],
    },

    useWhen: [
      'A reader confuses passing `addThree` with passing `addThree(1)`. The card changing hands before any arithmetic happens shows that the function itself went over.',
      'The article introduces callbacks or higher-order functions and needs to show that calling a parameter name runs code written elsewhere, and that no copy of the function is made.',
    ],

    avoidWhen: [
      'The subject is closures or functions that remember outer variables. The function here uses nothing but its own parameter.',
      'The article is about map, filter or reduce over a list. There is no list; one function is applied twice to a single number.',
      'The article needs function pointers or delegates with their exact typing rules in C, C++ or C#. The notation has no types.',
    ],

    contrastWith: [
      {
        concept: 'closureCaptures',
        note: 'Being a value is what lets a function be stored and handed on; capturing is what a function may carry when it goes. A function that refers only to its own parameters travels without carrying anything.',
      },
      {
        concept: 'curryingPartial',
        note: 'Both treat functions as things that are held in names. Currying makes a new function each time an input is supplied; here a single function passes between names and is never remade.',
      },
      {
        concept: 'returnToCaller',
        note: 'Handing over a function sends code to run later; handing back a result sends a finished value to the call that asked for it. Calling a received function combines the two: its result returns to the call made through the new name.',
      },
      {
        concept: 'mapFilterReduce',
        note: 'A function handed over as a value is the shared ingredient; a chain of list stages is one large use of it, where each stage receives a different function and passes its result to the next.',
      },
    ],
  },
};
