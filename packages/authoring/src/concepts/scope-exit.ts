/**
 * scopeExit 개념 선언.
 *
 * canonical facet 은 `facet:scopeExit` — `let price = 40` · `if price > 30` · (몸) `let discount = 5` ·
 * `price = price - discount` · (몸 밖) `show price` · `show discount`. 몸을 벗어나는 것을 한 걸음으로 세고,
 * 그때 discount 가 이름째 자리째 걷힌다. 바깥 price 만 35 로 남고, `show discount` 는 찾을 이름이 없어 멈춘다.
 * 출력 35 하나. 걸음 여덟 (시작 포함).
 *
 * ── 묶음 안에서의 자리 (변수와 타입 — 몸 · 틀 셋)
 *
 * "block · declared inside · no longer exists · undefined name error" 를 이쪽이 독점한다. 같은 이름이 가리는
 * 것은 `shadowing` 에, 주소가 걷힌 자리를 가리키는 것은 `danglingReference` 에 두고 same name · hide ·
 * reappear · pointer · address · frame 을 definition 에서 쓰지 않는다.
 *
 * 전제: 화면은 멈춤을 실행 중에 이름을 못 찾는 것으로 그렸다. 실제 언어 대부분(자바 · C# · C · 러스트 ·
 * 타입스크립트)은 이 줄을 실행 전에 거절한다. 자바스크립트 `let` 은 실행 중 ReferenceError, 파이썬 · 자바스크립트
 * `var` 는 블록 스코프가 없어 이 프로그램이 멈추지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const scopeExitConcept: FacetConceptSource = {
  id: 'scopeExit',
  label: 'Block Scope Ends (The Variable Is Gone)',
  canonicalFacet: 'facet:scopeExit',

  surface: {
    definition:
      'A variable declared within a block exists only until that block ends; afterward the name is found nowhere, so a later line using it is an undefined-name error.',
    exemplarKeywords: [
      'block scope',
      'local variable scope',
      'variable is not defined outside the if block',
      'cannot find symbol',
      'ReferenceError: x is not defined',
      'use of undeclared identifier',
      'declare the variable before the block',
      'let vs var scope',
      'scope of a variable declared in a loop or if',
      'variable lifetime ends at closing brace',
    ],
  },

  briefing: {
    observable: [
      'The program is six numbered lines: `let price = 40`, `if price > 30` with a body of `let discount = 5` and `price = price - discount`, then `show price` and `show discount`. On the right is the "outside" frame where names live, with an "output" area.',
      '`let price = 40` opens a slot for price in the outside frame. `if price > 30` is true (40 > 30), flow enters the body, and a "body" frame opens inside the outside frame at the height of the body\'s two lines.',
      '`let discount = 5` opens its slot inside the body frame. `price = price - discount` takes discount\'s 5 and changes the outside price from 40 to 35.',
      'Leaving the body is counted as a step of its own: the body frame folds up toward the `if` line and disappears, taking discount with it — name and slot.',
      '`show price` prints 35. `show discount` searches the outside frame, finds only price, and the program stops there, marked "stopped" with `discount ?`. That line prints nothing.',
      'Output is 35 alone. Eight steps in all: the start, six lines, and the step for leaving the body.',
      'The screen draws the failure as a stop during execution. Most real languages (Java, C#, C, Rust, TypeScript) reject this line before the program runs; JavaScript `let` fails at run time with a ReferenceError; Python and JavaScript `var` have no block scope and would not stop here. The code is written in a small language-neutral notation rather than in any one real language.',
    ],

    screen: {
      affordances: [
        'The screen plays the program by itself and stops on the line that cannot find discount.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to the step after line 4 holds the body frame folding away with discount inside.',
        'The program and its values are fixed.',
      ],
    },

    useWhen: [
      'A reader gets "cannot find symbol" or "is not defined" for a variable they can plainly see a few lines above. The body frame folding away with discount inside shows why it is no longer there.',
      'The article advises declaring a variable before an if or loop when it is needed afterwards, and wants both kinds side by side: price survives the body, discount does not.',
    ],

    avoidWhen: [
      'The subject is Python or JavaScript `var`, where a variable assigned inside an if remains usable after it.',
      'The article is about an outer variable with the same name coming back into view after a block. No outer discount exists here.',
      'The point is a function\'s locals disappearing when it returns, or memory being released. Only a block inside one program is drawn, and no function is called.',
    ],

    contrastWith: [
      {
        concept: 'shadowing',
        note: 'An inner declaration ends with its body either way. With no outer variable of the same name, the name ceases to resolve; with one, the name quietly resolves to the outer variable instead.',
      },
      {
        concept: 'danglingReference',
        note: 'Using a variable after its lifetime has ended is caught as an error when done by name, but not when done through a stored location, which reads whatever now occupies that storage without complaint.',
      },
      {
        concept: 'closureCaptures',
        note: 'Normally a local variable ends with the code that declared it. Capture by an inner function is the case where it is kept past that point.',
      },
    ],
  },
};
