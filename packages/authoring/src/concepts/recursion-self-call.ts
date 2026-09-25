/**
 * recursionSelfCall 개념 선언.
 *
 * canonical facet 은 `facet:recursionSelfCall` — `countdown(3)` 을 부르면 원본의 몸이 한 장
 * 베껴져 떨어져 나오고, 흐름이 호를 타고 새 몸의 첫 줄로 들어간다. 몸 안의 `countdown(n - 1)`
 * 마다 같은 일이 되풀이되어 n = 3 · 2 · 1 · 0 네 몸이 겹쳐 선다. 가장 깊은 몸의 조건이 거짓인
 * 걸음에서 멈추고, 되돌아 나가는 길은 그리지 않는다.
 *
 * ── 묶음 안에서의 자리 (재귀 셋)
 *
 * 이쪽은 **들어가는 쪽**만 — 흐름이 같은 코드의 첫 줄로 다시 들어가고, 새 호출은 제 인자를
 * 들며, 앞 호출은 부르는 줄에서 기다린다. `callStackUnwind` 가 "unwind · return value" 를,
 * `baseCase` 가 "base case · overflow · stop condition" 을 독점하므로 여기서는 쓰지 않는다.
 * frame · stack 도 저 둘에 남겨 두고 invocation 이라고 쓴다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const recursionSelfCallConcept: FacetConceptSource = {
  id: 'recursionSelfCall',
  label: 'Recursion: A Function Calling Itself',
  canonicalFacet: 'facet:recursionSelfCall',

  surface: {
    definition:
      'When a function calls its own name, execution re-enters the first line of that same code as a new invocation carrying its own argument, while every invocation before it stays paused at its call line.',
    exemplarKeywords: [
      'recursion',
      'recursive function',
      'a function that calls itself',
      'self-referential call',
      'countdown recursion',
      'each call gets its own parameters',
      'local variables per call',
      'recursive call does not overwrite n',
      'how recursion works step by step',
    ],
  },

  briefing: {
    observable: [
      'The program `function countdown(n)` with its three body lines stays at the top left as the original.',
      'When `countdown(3)` runs, a copy of the body peels off, and the flow travels along an arc from the value pill at the end of the call line to the new copy\'s first line `if n > 0`, where the value sits as `n = 3`.',
      'Each `countdown(n - 1)` inside a body repeats this, copying the calling body itself, with the value one smaller each time: `n = 2`, `n = 1`, `n = 0`.',
      'As each new copy stands, the earlier one falls behind with a pause mark on its `countdown(n - 1)` line and still holds its own `n`; the caption lists how many bodies are paused.',
      'In the fourth copy `0 > 0` is false — "no deeper call" — and the picture stops there at depth 4, with 3, 2, 1 in the output and three bodies paused. The way back out of those bodies is not drawn.',
      'The run is twelve steps: one per line stepped on, and the next step after a call is always the first line of the new copy. The code is written in a small language-neutral notation — `function`, `if`, `show`, indentation for bodies — rather than in any one real language.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself and stops on the deepest copy.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to any "Enters the first line" step holds the arc and the value landing in the new copy.',
        'The function and the starting argument 3 are fixed.',
      ],
    },

    useWhen: [
      'The reader thinks a recursive call jumps back into the same running function and overwrites `n`. The stacked copies, each holding its own value while the earlier ones wait, separate "same code" from "same invocation".',
      'The article introduces recursion and needs to show where control goes at the moment of the self-call, before any talk of results coming back.',
    ],

    avoidWhen: [
      'The article is about what happens after the deepest call — values coming back, or the order in which calls finish. The picture stops before any of that.',
      'The point is a recursion that never stops or crashes. Here the argument reaches 0 and no deeper call is made.',
      'The subject is mutual recursion or recursion on data structures such as trees; only a single function counting down is shown.',
    ],

    contrastWith: [
      {
        concept: 'callStackUnwind',
        note: 'Going in and coming out are two halves of one recursion. This is the descent — where control goes and what each invocation holds; the other is the order of finishing and where each result goes.',
      },
      {
        concept: 'baseCase',
        note: 'Entering the same code again is what recursion does; reaching a call that stops entering is what lets it end. This one takes the ending for granted and looks at the entering.',
      },
      {
        concept: 'loopBack',
        note: 'Both send control back to an earlier line of the same code. A loop keeps one set of variables across passes; a self-call starts a fresh invocation with its own argument while the caller keeps its own.',
      },
    ],
  },
};
