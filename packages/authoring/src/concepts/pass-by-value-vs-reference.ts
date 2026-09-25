/**
 * passByValueVsReference 개념 선언.
 *
 * canonical facet 은 `facet:passByValueVsReference` — 몸이 글자까지 같은 두 함수 `bump(n)` · `bumpRef(ref n)` 를
 * `a = 5` · `b = 5` 에 한 번씩 부른다. `bump(a)` 는 5 를 복사해 틀 안에 새로 선 자리 `n` 에 넣고, 그 복사본만 6 이 되어
 * 틀과 함께 사라진다. `bumpRef(b)` 는 아무것도 복사하지 않고 이름 `n` 을 `b` 의 자리에 붙여, 같은 `n = n + 1` 이 곧장
 * `b` 를 6 으로 만든다. 출력 5 · 6. 걸음 열하나 (시작 포함).
 *
 * ── 묶음 안에서의 자리 (함수 다섯)
 *
 * **부르는 순간 안으로 들어가는 쪽**이다. "copy · by value · by reference · caller's variable" 을 이쪽이 독점한다.
 * 값이 밖으로 나오는 길(return · call expression)은 `returnToCaller`, 틀이 끝난 뒤에도 사는 변수(captured · enclosing)는
 * `closureCaptures` 에 두고 쓰지 않는다. 변수와 타입 서브도메인의 `valueInPlace` · `aliasing` 은 대입의 말이라
 * contrastWith 로만 잇고, definition 에서 alias 라는 낱말을 피한다.
 *
 * 전제: `ref` 는 이 표기의 것이고 정의 쪽에만 붙는다. C# 은 부르는 쪽에도 `ref` 를 적고, C++ 는 `int& n`,
 * 자바 · 파이썬에는 변수의 자리를 넘기는 방법이 없다. 화면은 각주를 달지 않으므로 여기서 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const passByValueVsReferenceConcept: FacetConceptSource = {
  id: 'passByValueVsReference',
  label: 'Pass by Value vs. Pass by Reference',
  canonicalFacet: 'facet:passByValueVsReference',

  surface: {
    definition:
      'Passing by value gives a parameter a fresh copy of the argument, so assignments inside the function never reach the caller\'s variable; passing by reference makes the parameter name that very variable.',
    exemplarKeywords: [
      'pass by value',
      'pass by reference',
      'call by value',
      'call by reference',
      'ref parameter in C#',
      'reference parameter int& in C++',
      'why did my variable not change after the function call',
      'function modifies a copy of the argument',
      'swap function that does not swap',
      'parameter vs argument',
    ],
  },

  briefing: {
    observable: [
      'The code on the left defines `function bump(n)` and `function bumpRef(ref n)`, whose bodies are the identical line `n = n + 1`; the only difference is `ref` in the second header. Then `let a = 5`, `let b = 5`, `bump(a)`, `bumpRef(b)`, `show a`, `show b`.',
      'On the right an "outside" area holds a place for `a` and a place for `b`, both 5; frames for the called functions appear beneath them.',
      'Calling `bump(a)` copies the value: a 5 detaches from `a`\'s place and drops into a new place `n` inside the bump frame, and the caption says a is still 5. The body turns only that copy into 6, and on return the frame folds away and the copy disappears with it.',
      'Calling `bumpRef(b)` copies nothing: the frame\'s name tag `n` rises and attaches to `b`\'s place, and no new place opens in the frame. The same body line now changes the outside place directly — the caption reads "n is the place of b, so b is now 6". On return the tag comes off and b keeps 6.',
      'The two `show` lines print 5 and 6. Eleven steps in all, counting the start; neither function returns a value.',
      'The code is written in a small language-neutral notation. `ref` before a parameter is that notation\'s marker and appears only in the definition; real languages spell it differently (C# writes `ref` at the call site as well, C++ uses `int& n`), and Java and Python have no way to pass a variable\'s place — the screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays both calls by itself and stops once `a` and `b` are printed.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to either call step shows the value dropping down or the name tag rising up.',
        'The two functions and the starting values are fixed.',
      ],
    },

    useWhen: [
      'A reader expects a function to change the variable it was given and it does not. The detached copy of 5 changing to 6 while `a` stays 5 shows where the change went.',
      'The article introduces C# `ref` or C++ reference parameters and needs the same body shown with and without the marker, ending in different outside values.',
    ],

    avoidWhen: [
      'The subject is passing an object or list and mutating its contents — Java or Python "pass by object reference" or call by sharing. Only plain numbers are passed here.',
      'The article is about how a function hands its result back. Neither function here returns a value.',
      'The article needs the exact syntax of one language. The `ref` marker belongs to the notation, and it is written only in the definition.',
    ],

    contrastWith: [
      {
        concept: 'returnToCaller',
        note: 'Parameter passing decides what enters a function at the moment of the call; returning decides where the one result goes when it leaves. A by-reference parameter is a second way for effects to get out, without any return value.',
      },
      {
        concept: 'closureCaptures',
        note: 'Both let code inside a function change a variable that belongs to someone else. A by-reference parameter lends the caller\'s variable for one call; a captured variable is kept by the inner function for as long as that function exists.',
      },
      {
        concept: 'valueInPlace',
        note: 'Passing by value is the same duplication that plain assignment of a number performs, applied at the boundary of a call; a by-reference parameter is the one case where no duplicate is made.',
      },
      {
        concept: 'aliasing',
        note: 'A by-reference parameter is a second name for the caller\'s variable, lasting one call. Aliasing is two names for one list within the same scope, created by ordinary assignment.',
      },
    ],
  },
};
