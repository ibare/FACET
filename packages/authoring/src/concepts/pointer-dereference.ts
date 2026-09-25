/**
 * pointerDereference 개념 선언.
 *
 * canonical facet 은 `facet:pointerDereference` — `let x = 42` · `let p = address(x)` · `let pp = address(p)` ·
 * `show valueAt(p)` · `show valueAt(valueAt(pp))`. 칸 셋의 내용은 42 · 500 · 501. 첫 show 는 한 번 건너 42, 둘째는
 * 501 → 500 → 42 로 두 번 건너 42. 출력은 같고 건넌 횟수가 다르다. 걸음 아홉 (시작 포함).
 *
 * ── 서브도메인 안에서의 자리 (메모리 모델 여덟)
 *
 * "dereference · hop · pointer to a pointer · indirection" 을 이쪽이 독점한다. 스택 · 힙 · 빌림 · 돌려주기는 다른
 * 일곱이 가지므로 frame · heap · free · allocate 를 definition 에서 쓰지 않는다. 변수와 타입 `referenceHoldsAddress`
 * 가 "자리에는 주소만 — 따라가지 않는다" 를 가지므로 이쪽은 따라가는 동작(reads … goes to … hops)을 주어로 쓴다.
 *
 * 전제: 칸 주소 500 · 501 · 502 는 예로 정한 값이다. 코드는 어느 언어도 아닌 표기이고 `address(x)` 는 C 의 `&x`,
 * `valueAt(p)` 는 `*p` 자리다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pointerDereferenceConcept: FacetConceptSource = {
  id: 'pointerDereference',
  label: 'Pointer Dereference (Following the Address, Once or Twice)',
  canonicalFacet: 'facet:pointerDereference',

  surface: {
    definition:
      'Dereferencing reads the number stored in a pointer as an address and hops to that location to read what it holds; a pointer to a pointer takes two hops before reaching the value.',
    exemplarKeywords: [
      'dereference',
      'dereferencing a pointer',
      'the * operator in C',
      'address-of operator &',
      'pointer to pointer',
      'double pointer',
      'int **pp',
      'indirection',
      'levels of indirection',
      'what does *p mean',
    ],
  },

  briefing: {
    observable: [
      'The program is five lines: `let x = 42`, `let p = address(x)`, `let pp = address(p)`, `show valueAt(p)`, `show valueAt(valueAt(pp))`. Each name has its own cell, labelled with its address.',
      'The first three lines fill the cells: x at 500 gets 42; `address(x)` gives 500, which goes into p\'s cell at 501; `address(p)` gives 501, which goes into pp\'s cell at 502. Only x holds a plain value — p and pp hold cell numbers.',
      'For `show valueAt(p)` the caption first reads p\'s cell ("Read the cell of p: 500. This number is used as an address."), then "Hop 1: over to address 500. Its cell holds 42." The output is 42 after one hop.',
      'For `show valueAt(valueAt(pp))` the read gives 501; hop 1 lands on p\'s cell and picks up 500, which is still an address; hop 2 lands on x\'s cell and picks up 42. The output is again 42, and a hops counter shows 2.',
      'Both lines print the same 42; what differs is the number of hops. Each hop is one step — nine in all, counting the start.',
      'The addresses 500, 501 and 502 are example values; real addresses are decided at run time. The code is a small language-neutral notation: `address(x)` stands where C writes `&x`, and `valueAt(p)` where C writes `*p`. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the five lines by itself and stops after the second 42 is printed.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to hop 1 of the last line holds the moment the value in hand is still the address 500.',
        'The program and its values are fixed.',
      ],
    },

    useWhen: [
      'The reader confuses a pointer with the value it points to. Reading 500 out of p\'s cell and only then hopping to 42 separates the two.',
      'The article introduces a pointer to a pointer (`int **`) and wants the two hops made visible, with the intermediate result shown to be another address.',
    ],

    avoidWhen: [
      'The subject is pointer arithmetic or indexing an array through a pointer. Addresses are only followed here, never added to.',
      'The article is about references in Java, Python or JavaScript, where the language follows the address for you and no explicit dereference is written.',
      'The point is a null or invalid pointer. Every address here leads to a live cell.',
    ],

    contrastWith: [
      {
        concept: 'referenceHoldsAddress',
        note: 'Storing an address in a variable is the precondition; dereferencing is the act of using it. That concept keeps the address in the slot and replaces it; this one reads it and travels to where it leads.',
      },
      {
        concept: 'indexAddressCalc',
        note: 'Both end at a memory location. An array index yields the location by arithmetic from a base; a dereference obtains it by reading it out of another cell.',
      },
      {
        concept: 'nodePointsNext',
        note: 'A linked list is a chain of stored addresses, and walking it is repeated dereferencing through different nodes. This concept isolates one and two levels of indirection on plain variables.',
      },
      {
        concept: 'danglingReference',
        note: 'Following an address is only meaningful while the location still holds what was put there. This concept assumes it does; a dangling reference is the case where the storage has been handed to someone else.',
      },
    ],
  },
};
