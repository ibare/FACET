/**
 * pureSameOutput 개념 선언.
 *
 * canonical facet 은 `facet:pureSameOutput` — 인자만 쓰는 `double(x)` 와 맨 위의 `factor` 를 읽는 `scale(x)` 에
 * 같은 인자 3 을 세 번씩 넣는다. 부르기 사이에 맨 위의 줄이 `factor` 를 2 → 5 → 1 로 바꾼다. `double(3)` 은
 * 6 · 6 · 6 (서로 다른 출력 1), `scale(3)` 은 6 · 15 · 3 (서로 다른 출력 3). 첫 번째 부르기는 둘 다 6 이라 한 번으로는
 * 가를 수 없다. 걸음 열 (시작 포함).
 *
 * ── 묶음 안에서의 자리 (순수 함수 둘 — 같은 origin `pure-function`)
 *
 * **출력 쪽**만 본다. "referential transparency · identical arguments · repeated calls · output · reads" 를 이쪽이
 * 독점한다. 부른 뒤 바깥이 바뀌는가(side effect · outside · assigns · return value)는 `noSideEffect` 에 두고
 * definition 에서 쓰지 않는다. 이 화면에서 `factor` 를 바꾸는 것은 함수가 아니라 맨 위의 줄이다.
 * 바깥 변수를 붙잡아 들고 다니는 것은 `closureCaptures` 의 말이다 — 여기는 부를 때마다 새로 읽는다.
 *
 * 전제: 인자 3 과 factor 값 2 · 5 · 1 은 예로 정한 값이다. 코드는 어느 한 언어도 아닌 표기다
 * (`tasks/pseudo-notation.md`). 화면은 각주를 달지 않으므로 여기서 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pureSameOutputConcept: FacetConceptSource = {
  id: 'pureSameOutput',
  label: 'Referential Transparency (Same Input, Same Output)',
  canonicalFacet: 'facet:pureSameOutput',

  surface: {
    definition:
      'A function is referentially transparent when repeated calls with identical arguments always yield an identical output; a body that reads a variable beyond its parameters can produce different results for the same input.',
    exemplarKeywords: [
      'referential transparency',
      'deterministic function',
      'same input same output',
      'pure function',
      'function depends on a global variable',
      'hidden input',
      'result depends on external state',
      'why a function returns different results with the same arguments',
      'replace a call with its value',
      'memoization safety',
      'testable functions',
    ],
  },

  briefing: {
    observable: [
      'The program on the left defines `let factor = 2`, `function double(x)` returning `x * 2`, and `function scale(x)` returning `x * factor`, then alternates `show double(3)` and `show scale(3)` three times. Between the rounds, top-level lines set `factor = 5` and then `factor = 1`.',
      'The right side has one box and one output axis per function. Each call sends the argument 3 into the box, and the output leaves the box and sits on the axis at the position of its value, stacking one row up per call.',
      'A dashed line runs from the outside cell `factor` down to the `scale` box; on each call a copy of the current value travels down it. The `double` box has no such line. Captions say "The body read nothing from outside" for double and "The body read from outside: factor = 5" (and so on) for scale.',
      '`double(3)` gives 6, 6, 6 — its three outputs form one tower, and its counter reads "different outputs: 1". `scale(3)` gives 6, 15, 3 as factor is 2, 5, 1 — its outputs step sideways, and its counter ends at "different outputs: 3".',
      'On the first call both functions output 6; one call alone cannot tell them apart.',
      'The changes to `factor` are made by top-level lines, announced as "A top-level line changes an outside value: factor = 2 → 5". Neither function modifies anything.',
      'A step is one top-level line, and a line with a call includes entering the body and getting the result back — ten steps in all, counting the start.',
      'The argument 3 and the values of factor are example values. The code is written in a small language-neutral notation — `function`, `let`, `return`, `show` to print, indentation for bodies — rather than any one real language.',
    ],

    screen: {
      affordances: [
        'The screen plays all six calls and the two changes to factor by itself and stops with both towers built.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to the second round holds scale\'s 15 beside its earlier 6.',
        'The functions, the argument and the factor values are fixed.',
      ],
    },

    useWhen: [
      'The reader thinks a function that gave the right answer once will always give it. Three calls with the same argument, one function landing in one place and the other drifting, show why a single call proves nothing.',
      'The article defines referential transparency or determinism and needs a function whose only fault is reading a global — it changes nothing itself, yet its answer cannot be predicted from its arguments.',
      'The article argues that a result depending on hidden inputs makes caching or testing a function unsafe.',
    ],

    avoidWhen: [
      'The point is a function that changes state outside itself when called. Here neither function changes anything; only its output is examined.',
      'The subject is a closure keeping a captured variable alive. Here the outside name is simply read fresh at each call.',
      'The article is about randomness, time or I/O as sources of non-determinism. The only varying input here is one outside number reassigned by the program.',
    ],

    contrastWith: [
      {
        concept: 'noSideEffect',
        note: 'Both are halves of purity. This half asks whether the answer depends only on the arguments; the other asks whether calling leaves anything changed. A function can fail either one while passing the other.',
      },
      {
        concept: 'closureCaptures',
        note: 'Both involve a function using a variable it did not declare. A closure keeps a particular variable alive and owns it across calls; here the function simply looks up an outside name each time, so whoever reassigns it changes the answer.',
      },
      {
        concept: 'functionAsValue',
        note: 'Treating functions as values is safest when calling them has no hidden inputs; this concept is that condition, independent of how the function is passed around.',
      },
    ],
  },
};
