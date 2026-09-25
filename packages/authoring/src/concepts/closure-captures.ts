/**
 * closureCaptures 개념 선언.
 *
 * canonical facet 은 `facet:closureCaptures` — `makeCounter()` 의 틀 안에 `count` 자리가 0 으로 서고, 그 줄에서
 * 만들어진 `next` 가 그 자리를 붙잡는다. `makeCounter` 가 `next` 를 돌려주며 틀이 걷혀도 `count` 자리는 `next` 에
 * 매인 채 바깥으로 따라 나와 `tick` 곁에 남는다. `tick()` 두 번이 그 **같은 자리**를 1 · 2 로 키우고 출력 1 · 2.
 * 걸음 열넷 (시작 포함).
 *
 * ── 묶음 안에서의 자리 (함수 다섯)
 *
 * **틀보다 오래 사는 변수**를 맡는다. "closure · captured · enclosing · alive after" 를 이쪽이 독점한다.
 * 함수를 이름 사이로 건네는 일(first-class · higher-order)은 `functionAsValue`, 받을 것이 하나씩 줄어드는 모양
 * (remaining · one at a time)은 `curryingPartial` 에 두고 definition 에서 쓰지 않는다.
 *
 * 전제: 이 표기는 안쪽 함수가 붙잡은 변수에 곧장 넣을 수 있다 (자바스크립트와 같다). 파이썬은 `nonlocal count`
 * 가 있어야 하고, 자바 람다는 붙잡은 지역 변수에 다시 넣을 수 없다. 자리가 실제로 어디에 놓이는지(힙 · 환경
 * 레코드)는 화면이 그리지 않는다. 화면은 각주를 달지 않으므로 여기서 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const closureCapturesConcept: FacetConceptSource = {
  id: 'closureCaptures',
  label: 'Closure (A Captured Variable Outlives Its Scope)',
  canonicalFacet: 'facet:closureCaptures',

  surface: {
    definition:
      'A closure is a nested function that keeps a local variable of its enclosing function alive after that enclosing call has ended, so every later use updates the same captured variable.',
    exemplarKeywords: [
      'closure',
      'lexical scope',
      'captured variable',
      'counter function with closure',
      'makeCounter',
      'inner function remembers outer variable',
      'nonlocal in Python',
      'function factory',
      'private state without a class',
      'why does the counter keep its value between calls',
    ],
  },

  briefing: {
    observable: [
      'The code is `function makeCounter()` containing `let count = 0`, an inner `function next()` whose body is `count = count + 1` and `return count`, and `return next`; below it `let tick = makeCounter()` and two `show tick()` lines.',
      'Calling makeCounter opens a "frame of makeCounter" where a slot `count` holds 0. The inner `function next()` line is itself a step: the caption says next "is made here and holds on to the slot: count".',
      'When makeCounter hands back next, its frame shrinks away, but the caption says the slot count "does not vanish — it leaves attached to next, and tick now holds next". The slot moves outside and hangs under the function.',
      'Each `tick()` opens a new frame labelled "called as tick" that contains no count slot of its own; a dashed line reaches the carried slot and the new value flies into it — 0 → 1, then 1 → 2 — with the older values left crossed out beside it.',
      'The shown values are 1 and 2. All three values 0, 1, 2 went into one slot, and two of them arrived after the frame that created it was gone. Fourteen steps, counting the start.',
      'The code is a small language-neutral notation in which the inner function may assign to the outer variable directly, as in JavaScript; Python needs `nonlocal count`, and a Java lambda cannot reassign a captured local. Where the slot is actually stored is not drawn. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the one makeCounter call and both tick() calls by itself and stops after showing 2.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to the step where makeCounter comes back shows the slot leaving its disappearing frame.',
        'The program is fixed.',
      ],
    },

    useWhen: [
      'The reader has learned that local variables die when their function returns and needs to see the one exception: a variable an escaping inner function refers to stays alive.',
      'The article builds a counter or factory with a closure and must show that repeated calls share one variable instead of starting from 0 each time.',
    ],

    avoidWhen: [
      'The article is about the classic loop-variable bug (closures created in a loop all seeing the final value). Only one closure is made here.',
      'The subject is passing functions around or storing them in variables in general. The function here uses outer state; the point is that state, not the handing over.',
      'The article needs Python or Java capture rules. The notation lets the inner function assign to the captured variable with no extra keyword.',
    ],

    contrastWith: [
      {
        concept: 'functionAsValue',
        note: 'Treating functions as values is what lets an inner function leave its creator; a closure is what that function takes with it. A function that refers to no outer variable can be passed around freely without capturing anything.',
      },
      {
        concept: 'curryingPartial',
        note: 'A curried function remembers the inputs it has already received, which in practice is done with closures. The emphasis there is on how many inputs are still missing; here it is on one variable that keeps changing across calls after its scope ended.',
      },
      {
        concept: 'passByValueVsReference',
        note: 'A reference parameter lets a function touch the caller\'s variable only during one call. A captured variable belongs to no caller at all once its scope ends, and is reached every time the inner function runs.',
      },
    ],
  },
};
