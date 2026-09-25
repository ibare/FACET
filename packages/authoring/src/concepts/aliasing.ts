/**
 * aliasing 개념 선언.
 *
 * canonical facet 은 `facet:aliasing` — `let prices = [4, 8, 15]` · `let backup = prices` · `prices[1] = 0` ·
 * `show backup[1]`. 둘째 줄은 주소 @1000 만 backup 의 새 자리(@101)에 베낀다. prices 로 1 번 칸을 8 → 0 으로
 * 고치고 backup 으로 같은 칸을 읽으면 0 이 나온다. 끝에 이름 둘 · 자리 둘 · 목록 하나. 걸음 다섯 (시작 포함).
 *
 * ── 묶음 안에서의 자리 (변수와 타입 — 값 · 주소 · 별칭 셋)
 *
 * "two names · same list · alias · change through one, read through the other" 를 이쪽이 독점한다.
 * 자리 안에 무엇이 드는가(address · fixed size · reassignment)는 `referenceHoldsAddress` 에, 값이 베껴지는
 * 것은 `valueInPlace` 에 두고 address · reassign · duplicate · primitive 를 쓰지 않는다. 함수에 목록을 넘겨
 * 같은 일이 생기는 것은 `passByValueVsReference` 의 avoidWhen 이 막고 있어 여기서도 avoidWhen 으로 가른다.
 *
 * 전제: 주소 @100 · @101 · @1000 은 예로 정한 값이다. 코드는 어느 한 언어도 아닌 표기다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const aliasingConcept: FacetConceptSource = {
  id: 'aliasing',
  label: 'Aliasing (Two Names, One List)',
  canonicalFacet: 'facet:aliasing',

  surface: {
    definition:
      'Aliasing is when two names refer to one and the same list, so an element changed via either name shows up under the other — writing b = a created no second list.',
    exemplarKeywords: [
      'aliasing',
      'alias',
      'two variables refer to the same object',
      'shared mutable state',
      'changing one array changed the other',
      'b = a does not copy the list',
      'shallow copy vs deep copy',
      'list.copy() or slice to avoid aliasing',
      'mutable object shared between variables',
      'spread operator to clone an array',
    ],
  },

  briefing: {
    observable: [
      'The program is four lines: `let prices = [4, 8, 15]`, `let backup = prices`, `prices[1] = 0`, `show backup[1]`. The list stands in the middle, labelled "list @1000" with its items indexed 0, 1, 2; the names stand on either side of it, and an "output" area is below.',
      'Line 1 places the list at @1000; the slot of prices (@100) holds only that address.',
      'Line 2 gives backup a new slot (@101) and copies only the address @1000 into it. The caption ends "Lists: 1." — no second list appears.',
      'Line 3 goes in through prices and changes item 1 of the list at @1000 from 8 to 0. Line 4 goes in through backup, reads the same item, and prints 0, although backup itself was never touched.',
      'The end state is two names, two slots both holding @1000, and one list [4, 0, 15]. Five steps in all, counting the start.',
      'The addresses @100, @101 and @1000 are example values chosen for the drawing; real addresses are decided at run time. The code is written in a small language-neutral notation rather than in any one real language, with items counted from 0.',
    ],

    screen: {
      affordances: [
        'The screen plays the four lines by itself and stops after printing 0.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to line 3 holds the change entering through prices, and line 4 the read leaving through backup.',
        'The program and its list are fixed.',
      ],
    },

    useWhen: [
      'A reader wrote `backup = prices` to keep the old list and is surprised it changed. The 0 printed through backup, which nothing wrote to, is the surprise made visible.',
      'The article is about why a real duplicate needs `list.copy()`, `slice()`, spread syntax or `clone()` in Python, JavaScript or Java, and needs the failure case first.',
    ],

    avoidWhen: [
      'The subject is passing a list to a function that mutates it. Both names here live side by side in one program; there is no call.',
      'The article contrasts shallow and deep copies of nested structures. No copy is ever made here, and the list holds plain numbers.',
      'The point is aliasing in the compiler-optimization sense, such as pointer aliasing or C `restrict`. This is about program behaviour a reader can observe.',
    ],

    contrastWith: [
      {
        concept: 'referenceHoldsAddress',
        note: 'That a list variable stores only a location is the cause; two names seeing each other\'s changes is the effect. This concept is the effect, and needs a change made through one name.',
      },
      {
        concept: 'valueInPlace',
        note: 'The same-looking line b = a has opposite outcomes: with a number it yields two independent values, with a list it yields one list reachable by two names.',
      },
      {
        concept: 'passByValueVsReference',
        note: 'Handing a list to a function produces the same sharing between the caller\'s name and the parameter. Here the two names sit in one scope, so the sharing is visible without any call.',
      },
      {
        concept: 'copyVsShare',
        note: 'Assignment leaves two lasting names for one list in the same scope. A list parameter is a second name that lives only for one call, yet the edits made through it outlive the call.',
      },
    ],
  },
};
