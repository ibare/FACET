/**
 * valueInPlace 개념 선언.
 *
 * canonical facet 은 `facet:valueInPlace` — `let width = 3` · `let height = width` · `height = height * 2` ·
 * `show width` · `show height`. 둘째 줄에서 width 자리의 3 은 제자리에 남고 똑같은 3 하나가 떨어져 나와
 * height 자리로 건너간다. 셋째 줄이 height 만 6 으로 바꾸고 출력은 3 · 6. 걸음 여섯 (시작 포함).
 *
 * ── 묶음 안에서의 자리 (변수와 타입 — 값 · 주소 · 별칭 셋)
 *
 * "primitive · value type · duplicate · independent" 를 이쪽이 독점한다. 주소 · 목록은
 * `referenceHoldsAddress` 에, 이름 둘이 하나를 나눠 쥐는 것은 `aliasing` 에 두고 address · list ·
 * share 를 쓰지 않는다. 함수에 넘길 때의 복사는 `passByValueVsReference` 의 말이라 copy · parameter ·
 * function 도 definition 에서 피한다 (그 개념은 고치지 않고 contrastWith 로만 잇는다).
 *
 * 전제: 자리 주소는 화면에 나오지 않는다. 코드는 어느 한 언어도 아닌 표기(`tasks/pseudo-notation.md`)다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const valueInPlaceConcept: FacetConceptSource = {
  id: 'valueInPlace',
  label: 'Value Types (The Number Sits in the Variable)',
  canonicalFacet: 'facet:valueInPlace',

  surface: {
    definition:
      'A variable of a primitive value type holds the number itself, so assigning it to another variable duplicates the number and later modifying either one leaves the other untouched.',
    exemplarKeywords: [
      'value type',
      'primitive type',
      'primitive variable',
      'int assignment',
      'assignment makes an independent duplicate',
      'changing b does not change a',
      'let b = a with numbers',
      'value semantics',
      'stack-allocated primitive',
      'variables as named boxes',
    ],
  },

  briefing: {
    observable: [
      'The code on the left is five lines: `let width = 3`, `let height = width`, `height = height * 2`, `show width`, `show height`. On the right there is one slot per name under "slots", and an "output" area below.',
      'Line 1 opens a slot for width with 3 inside it.',
      'Line 2 opens a slot for height; the 3 in width stays where it is while an identical 3 detaches from it and crosses into the new slot. The caption says the 3 in width is copied and that slot width still holds 3.',
      'Line 3 changes only height: its 3 sinks away and a 6 settles in. Slot width keeps its 3 throughout — nothing connects the two slots.',
      'The two `show` lines copy the values out to the output without emptying either slot: 3, then 6. Six steps in all, counting the start.',
      'Only numbers appear; there are no lists and no addresses on this screen. The code is written in a small language-neutral notation — `let`, `show`, plain assignment — rather than in any one real language.',
    ],

    screen: {
      affordances: [
        'The screen plays the five lines by itself and stops after the second output.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to the second line holds the moment the duplicate 3 crosses over.',
        'The program and its numbers are fixed.',
      ],
    },

    useWhen: [
      'A beginner reads `let b = a` as tying b to a. The 3 that stays in width while height becomes 6 shows that what crossed over was a number, not a link.',
      'The article introduces primitive or value types (int, double, bool in Java or C#, numbers in JavaScript) before contrasting them with objects.',
    ],

    avoidWhen: [
      'The subject is arrays, objects or lists being assigned. Only numbers are assigned here, and nothing is stored outside the variables.',
      'The article is about passing arguments to a function. Every transfer here is a plain assignment between two variables in one program.',
      'The article discusses C# structs or other compound value types. Only single numbers are shown.',
    ],

    contrastWith: [
      {
        concept: 'referenceHoldsAddress',
        note: 'For a number the variable holds the value itself; for a list it holds only where the list lives. The difference decides whether assignment duplicates the data or just a pointer to it.',
      },
      {
        concept: 'aliasing',
        note: 'Assigning a number leaves two unconnected values, so a change through one name can never be seen through the other. Assigning a list leaves one list under two names, and that is exactly what can be seen.',
      },
      {
        concept: 'passByValueVsReference',
        note: 'The same duplication happens when a number is handed to a function by value. This concept is the plain assignment case, with no function or parameter involved.',
      },
      {
        concept: 'copyVsShare',
        note: 'Assignment duplicating a number is the plain case. Handing a number to a function duplicates it the same way, and the duplicate also ends with the call, so repeated calls never add up.',
      },
    ],
  },
};
