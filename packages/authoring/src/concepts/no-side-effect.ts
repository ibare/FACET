/**
 * noSideEffect 개념 선언.
 *
 * canonical facet 은 `facet:noSideEffect` — `add(a, b)` 와, 몸 첫 줄에서 바깥 `calls` 를 하나 올리는 `addTracked(a, b)`
 * 를 번갈아 두 번씩 부른다. 네 번 모두 5 를 돌려준다. add 뒤의 바깥은 `calls 0 → 0` · `calls 1 → 1`, addTracked 뒤는
 * `calls 0 → 1` · `calls 1 → 2`. 마지막 `show calls` 가 2 — 어느 함수도 돌려준 적 없는 값이다. 걸음 일곱 (시작 포함).
 *
 * ── 묶음 안에서의 자리 (순수 함수 둘 — 같은 origin `pure-function`)
 *
 * **바깥 쪽**만 본다. "side effect · outside · assigns · after the call · return value" 를 이쪽이 독점한다.
 * 같은 인자로 여러 번 불러 출력이 같은가(referential transparency · identical arguments · output · reads)는
 * `pureSameOutput` 에 두고 definition 에서 쓰지 않는다.
 *
 * 전제: 몸의 `calls = calls + 1` 에 `let` 이 없으므로 바깥 이름에 넣는다 — 이 표기의 선언 규칙이다
 * (`tasks/pseudo-notation.md`). 파이썬이라면 `global calls` 가 있어야 같은 일이 된다. `show` 가 화면에 찍는 것은
 * 이 화면이 세는 바깥 쓰기가 아니다. 화면은 각주를 달지 않으므로 여기서 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const noSideEffectConcept: FacetConceptSource = {
  id: 'noSideEffect',
  label: 'Side Effects (Does a Call Change the Outside?)',
  canonicalFacet: 'facet:noSideEffect',

  surface: {
    definition:
      'A function is free of side effects when calling it leaves every variable outside its body as it was; one that assigns to an enclosing variable leaves a lasting change behind, though its return value never differs.',
    exemplarKeywords: [
      'side effect',
      'side-effect free',
      'pure function',
      'mutating global state',
      'global variable modified inside a function',
      'call counter',
      'hidden state change',
      'global keyword in Python',
      'why order of calls matters',
      'impure function',
    ],
  },

  briefing: {
    observable: [
      'The program defines `let calls = 0`, `function add(a, b)` returning `a + b`, and `function addTracked(a, b)` whose first line is `calls = calls + 1` before returning `a + b`. It then calls add(2, 3), addTracked(2, 3), add(2, 3), addTracked(2, 3), and finally `show calls`.',
      'An "Outside" area holds the name `calls`; an "Output" column collects what each line prints.',
      'All four calls return 5, so the Output column shows 5 four times.',
      'After each call the outside is recorded before and after: add leaves `calls 0 → 0` and `calls 1 → 1`; addTracked moves it `calls 0 → 1` and `calls 1 → 2`, and its caption reads "Its body wrote to the outside". The write is drawn as a line reaching from inside the function\'s body out to the `calls` cell, and it stays drawn.',
      'The last line prints 2 — a value neither function ever returned. The final caption counts "Calls that marked the outside: 2 · calls that did not: 2".',
      'A step is one top-level line, and a call includes running the whole body — seven steps in all, counting the start.',
      'In this notation an assignment without `let` inside a body writes to the existing outer name; in Python the same line would need `global calls`. The code is written in a small language-neutral notation — `function`, `let`, `return`, `show`, indentation for bodies — rather than any one real language.',
    ],

    screen: {
      affordances: [
        'The screen plays the four calls and the final print by itself and stops on `calls` at 2.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to the first addTracked shows `calls` just after that call moved it from 0 to 1.',
        'The functions, the arguments and the call order are fixed.',
      ],
    },

    useWhen: [
      'The reader judges a function only by what it returns. Two functions that both return 5 every time, one of which quietly counts its own calls outside, show that the return value hides what the call left behind.',
      'The article defines a side effect and needs the smallest case — one assignment to an outer variable — before moving to I/O or shared data.',
      'The article argues that calling a function one more or one fewer time should not change the rest of the program, and needs a counter that does.',
    ],

    avoidWhen: [
      'The point is that a function gives different answers for the same arguments. Every call here returns the same 5; only the outside changes.',
      'The side effect in question is printing, network or file I/O. Printing here is not counted as a write to the outside; the only effect drawn is an assignment to one variable.',
      'The subject is mutating an argument passed in, such as a list parameter. The variable written here is an outer name, not a parameter.',
    ],

    contrastWith: [
      {
        concept: 'pureSameOutput',
        note: 'Both are halves of purity. This half asks what a call leaves changed; the other asks whether the answer depends only on the arguments. A function that counts its calls passes the other test and fails this one.',
      },
      {
        concept: 'passByValueVsReference',
        note: 'Both concern whether a function\'s work reaches past its own body. There the route is a parameter bound to the caller\'s variable; here it is a direct assignment to a variable defined outside, with no parameter involved.',
      },
      {
        concept: 'closureCaptures',
        note: 'A closure that updates its captured variable is also changing state that outlives the call, but the state is private to that closure. Here the changed variable is visible to the whole program.',
      },
      {
        concept: 'immutableCopy',
        note: 'Never modifying existing data is one way to avoid side effects on shared structures; this concept names the effect itself, whatever kind of variable it lands on.',
      },
    ],
  },
};
