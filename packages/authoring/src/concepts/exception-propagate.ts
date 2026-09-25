/**
 * exceptionPropagate 개념 선언.
 *
 * canonical facet 은 `facet:exceptionPropagate` — 맨 바깥의 `try` 안에서 `load(-3)` 을 부르고,
 * `load` 가 `check(v)` 를 부른다. `check` 가 `BadValue` 를 던지면(`throw`) 그 틀을 떠나 load 의 부른
 * 자리(줄 6)로, load 에는 try 가 없어 다시 맨 바깥의 줄 9 로 오르고, 거기가 try 몸 안이라
 * `catch BadValue` 로 떨어진다. 줄 4 · 7 · 10 은 밟히지 않고 `x` · `y` 에는 끝내 값이 들어가지 않는다.
 * 코드는 어느 한 언어도 아닌 표기(`tasks/pseudo-notation.md`)다.
 *
 * ── 묶음 안에서의 자리
 *
 * 서브도메인 안에서 유일하게 예외를 다룬다. `callStackUnwind` 와 틀이 거꾸로 걷히는 모양이
 * 겹치므로 definition 에 unwind · return value · frame 같은 말을 쓰지 않고, throw · caller ·
 * try · catch 를 독점한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const exceptionPropagateConcept: FacetConceptSource = {
  id: 'exceptionPropagate',
  label: 'Exception Propagation Up the Callers',
  canonicalFacet: 'facet:exceptionPropagate',

  surface: {
    definition:
      'A thrown exception climbs from the failing function to its caller, then that caller\'s caller, skipping the rest of every function lacking a try, until an enclosing catch handles it.',
    exemplarKeywords: [
      'exception propagation',
      'throw',
      'try catch',
      'raise and try except',
      'catching an exception in a caller',
      'error bubbles up',
      'uncaught exception in a helper function',
      'where should I handle the error',
      'lines after throw are skipped',
    ],
  },

  briefing: {
    observable: [
      'Thirteen numbered lines: `function check(v)` does `throw BadValue` when `v < 0`, `function load(v)` runs `let x = check(v)` and `return x * 2`, and the top level runs `let y = load(-3)` and `show y` inside `try`, with `catch BadValue` → `show "bad value"`, then `show "done"`.',
      'The code is split into blocks stacked in call order — top level at the top, each call one tier lower and one step to the right — with a link running from the call line down to the new block as its frame stands.',
      'Line 2 tests true and line 3 throws BadValue inside check. A red pill leaves that line and rides the link back up to line 6 in load; check\'s block keeps only a dashed outline tagged "skipped", and its remaining line 4 is dimmed and struck through.',
      'The caption reads "No try here — the rest of load is skipped as well", and the pill climbs again to line 9 at the top level, striking through line 7.',
      'Line 9 is inside try, so the pill drops to line 11, `catch BadValue`, which catches it. Line 10 `show y`, left behind in the try body, is dimmed and struck through as well. Neither `x` nor `y` ever receives a value.',
      'The caption "Frames skipped without catching: 2" follows, and the output ends as `bad value` then `done`. The run is eleven steps after the start.',
      'The code is written in a small language-neutral notation — `function`, `let`, `show`, `throw` / `try` / `catch`, indentation for bodies — rather than in any one real language; `BadValue` is an error name chosen for its meaning, not a built-in of any language.',
    ],

    screen: {
      affordances: [
        'The screen plays the program by itself and stops after `show "done"`.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to the first climb holds the pill between check and load with line 4 already struck.',
        'The program and the argument −3 are fixed.',
      ],
    },

    useWhen: [
      'The reader thinks an error must be handled in the function that throws it. The pill passing through `load`, which has no try, shows that any caller up the chain can be the one to catch it.',
      'The article explains why statements after a failing call never run — `return v`, `return x * 2` and `show y` are all struck through on the way up.',
    ],

    avoidWhen: [
      'The article is about `finally`, resource cleanup, rethrowing or exception chaining. None of those appear.',
      'The subject is return values passing back through normal calls. No function here returns a value to its caller.',
      'The article is about error codes or result types rather than exceptions.',
    ],

    contrastWith: [
      {
        concept: 'callStackUnwind',
        note: 'Both remove call levels newest first. A normal return finishes the level and hands a value to the one below; an exception abandons the remaining lines of each level it passes and carries no value until it is caught.',
      },
      {
        concept: 'baseCase',
        note: 'A recursion that never stops ends by raising an error, which then climbs out like any other. That concept is about why the error arises; this one is about the path any error takes afterwards and where a try can end it.',
      },
      {
        concept: 'branchTakeOnePath',
        note: 'Both leave written lines unexecuted. A test chooses between two bodies before either starts, whereas an exception cuts off lines that were already next in line to run.',
      },
    ],
  },
};
