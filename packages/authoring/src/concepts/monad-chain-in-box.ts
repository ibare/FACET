/**
 * monadChainInBox 개념 선언.
 *
 * canonical facet 은 `facet:monadChainInBox` — `half(n)` 은 홀수면 `empty`, 짝수면 `box(n div 2)`. `box(20)` 을 `then` 으로
 * `half` 에 네 번 잇는다. box(20) → box(10) → box(5) → empty(5 가 홀수) → empty. 넷째 이음에서 `half` 는 불리지
 * 않는다 ("not called"). 출력 `empty` · "half called: 3 · then links: 4". 걸음 일곱 (시작 포함).
 *
 * ── 서브도메인 안에서의 자리 (함수형 일곱)
 *
 * "monad · optional · container · unwrap · empty · chain · short-circuit" 을 이쪽이 독점한다. 함수를 다른 함수에
 * 넘기는 일(first-class · higher-order · name · body)은 `functionAsValue` 의 말이라 definition 에서 쓰지 않는다.
 * 예외가 틀을 건너뛰는 것과 닮았으므로 `exceptionPropagate` 의 skip · climbs · catch 도 쓰지 않는다.
 *
 * 전제: `box` · `empty` · `then` 은 이 표기의 이름이다 — 하스켈 `Maybe`(`Just` · `Nothing` · `>>=`), 러스트
 * `Option`(`Some` · `None` · `and_then`), 자바 `Optional`(`of` · `empty` · `flatMap`). `empty` 는 상자이며 표기의 `null` 과
 * 다르다. 화면이 보이는 것은 모나드 가운데 값이 없을 수도 있는 상자 하나뿐이다. 모나드 법칙은 다루지 않는다.
 * 화면은 각주를 달지 않으므로 여기서 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const monadChainInBoxConcept: FacetConceptSource = {
  id: 'monadChainInBox',
  label: 'Monadic Chaining of an Optional (Maybe / Option)',
  canonicalFacet: 'facet:monadChainInBox',

  surface: {
    definition:
      'Monadic chaining threads an optional container through functions that each return a container: a full one is unwrapped and handed on, while an empty one short-circuits so no later function runs.',
    exemplarKeywords: [
      'monad',
      'Maybe monad',
      'Option type',
      'Optional',
      'bind',
      'flatMap',
      'and_then',
      '>>=',
      'Just and Nothing',
      'Some and None',
      'null-safe chaining',
      'avoid repeated null checks',
      'railway-oriented programming',
    ],
  },

  briefing: {
    observable: [
      'The code defines `function half(n)`: `if n mod 2 == 1` → `return empty`, otherwise `return box(n div 2)`. Then `let a = box(20)` and four links `let b = then(a, half)` … `let e = then(d, half)`, and `show e`.',
      'Each link passes a box to the next slot. For a full box the caption reads "then opens a and hands 20 to half. A new box comes back: b = box(10)"; the link loops out to the `half` area, where the test is logged as `half(20) · false`.',
      'The boxes run box(20) → box(10) → box(5). Then half(5) finds 5 odd (`half(5) · true`) and returns empty, so d is empty.',
      'At the fourth link the caption reads "d is empty, so then skips half. The empty box passes on: e = empty"; the link bends short without reaching `half`, and the log shows "not called".',
      'A value is never left outside a box: whatever goes into `half` comes back already boxed, and `then` does not box it again.',
      'The output is `empty`, and the final line counts "half called: 3 · then links: 4".',
      'A step is one top-level line, a link including the call into `half` — seven steps in all, counting the start.',
      '`box`, `empty` and `then` are names of this notation. Haskell calls them `Just`, `Nothing` and `>>=` on `Maybe`; Rust `Some`, `None` and `and_then` on `Option`; Java `Optional.of`, `Optional.empty()` and `flatMap`. `empty` is itself a box and differs from `null`. Only the may-be-empty container is shown, not other monads such as lists or promises.',
    ],

    screen: {
      affordances: [
        'The screen plays the boxing and all four links by itself and stops on the printed `empty`.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to the fourth link shows the empty box passing on with `half` marked "not called".',
        'The function, the starting value and the number of links are fixed.',
      ],
    },

    useWhen: [
      'The reader is tired of writing "if the value is missing, stop" after every step and needs to see the check moved into the link itself — one empty box and every later function is simply not called.',
      'The article introduces Maybe, Option or Optional chaining with `>>=`, `and_then` or `flatMap` and wants the call count to prove that the steps after an empty result never run.',
      'The reader wonders why the chaining function must return a box; each `half` result arriving already boxed, never nested, shows it.',
    ],

    avoidWhen: [
      'The article is about monad laws, category theory, or monads other than an optional value, such as lists, promises, IO or state. Only a may-be-empty box is drawn.',
      'The point is an error that carries a message, as with Result or Either. The empty box here carries no reason for being empty.',
      'The subject is the optional-chaining operator `?.` on object properties. There are no objects or properties here, only a function applied through a box.',
    ],

    contrastWith: [
      {
        concept: 'functionAsValue',
        note: 'Passing a function to another function is the prerequisite; this concept is one specific use of it, where the receiver decides whether to call the function at all depending on what the box holds.',
      },
      {
        concept: 'exceptionPropagate',
        note: 'Both abandon the remaining work once something goes wrong. An exception leaves the normal flow and climbs through callers; an empty box stays an ordinary return value that flows through every remaining link to the end.',
      },
      {
        concept: 'mapOneByOne',
        note: 'Applying a function inside a container is mapping. When the function itself returns a container, mapping would nest one box in another; chaining flattens that, which is why it is also called flatMap.',
      },
    ],
  },
};
