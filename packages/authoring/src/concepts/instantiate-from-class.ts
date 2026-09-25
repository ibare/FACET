/**
 * instantiateFromClass 개념 선언.
 *
 * canonical facet 은 `facet:instantiateFromClass` — `class Counter`(칸 `name` · `count`, `create` · `tick`) 하나에서
 * `new Counter("red")` · `("blue")` · `("green")` 으로 객체 셋이 찍혀 나온다. `a.tick()` 두 번 · `c.tick()` 한 번이
 * 제 객체의 `count` 만 올리고, `show a.count` · `show b.count` 는 같은 이름의 칸을 읽는데도 2 와 0 을 보인다.
 * 끝 상태 a("red", 2) · b("blue", 0) · c("green", 1). 틀 1 · 객체 3. 걸음 아홉 (시작 포함).
 *
 * ── 묶음 안에서의 자리 (객체 지향 다섯)
 *
 * **틀 하나에서 나온 객체들이 칸 이름은 같이 갖고 값은 따로 갖는다**를 맡는다. "instance · template · new object ·
 * same attribute names, separate values" 를 이쪽이 독점한다. 부모 · 물려받기(inheritance · superclass)는 `methodLookupUp`, 받는 객체에 따라
 * 갈라지는 부름은 `dynamicDispatch`, 약속(interface · signature)은 `interfaceSlot`, 접근 막기(private)는
 * `encapsulationBoundary` 에 두고 definition 에서 쓰지 않는다. 이 화면의 칸은 모두 `public` 이다.
 * 이름 둘이 한 목록을 함께 가리키는 `aliasing` 과는 거울상이라 contrastWith 로 잇는다.
 *
 * 전제: 코드는 어느 한 언어도 아닌 표기다. 생성자를 `create` 로 적었다 — 자바 · C# 은 클래스와 같은 이름,
 * 파이썬은 `__init__`, 자바스크립트 · 타입스크립트는 `constructor` 다. `new` 가 칸을 `null` 로 세운 뒤 `create` 를
 * 부르는 차례도 이 표기의 모형이다. 화면은 각주를 달지 않으므로 여기서 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const instantiateFromClassConcept: FacetConceptSource = {
  id: 'instantiateFromClass',
  label: 'Instantiation (One Class, Many Objects)',
  canonicalFacet: 'facet:instantiateFromClass',

  surface: {
    definition:
      'Instantiating a class stamps out separate objects from one template: every instance carries the same attribute names but separate values, so updating one instance changes nothing in the others.',
    exemplarKeywords: [
      'class and object',
      'instance',
      'instantiation',
      'new keyword',
      'constructor',
      'instance variables',
      'per-object state',
      'class as a blueprint',
      'object creation',
      'this refers to the current object',
    ],
  },

  briefing: {
    observable: [
      'The code defines `class Counter` with fields `public name` and `public count`, a `function create(name)` that sets `this.name = name` and `this.count = 0`, and a `function tick()` that does `this.count = this.count + 1`. Below it run `let a = new Counter("red")`, `let b = new Counter("blue")`, `let c = new Counter("green")`, then `a.tick()`, `a.tick()`, `c.tick()`, `show a.count`, `show b.count`.',
      'The program sits on the left; at top right the class stands as a template card listing only the field names `name` and `count`, and it never holds values. Each `new Counter(...)` line stamps a new object card out of it that settles below, its `null` fields then turning into the values `create` puts in; the caption reads "new Counter: a new object is stamped out of the template", and a counter reads "Classes: 1 · Objects: n".',
      'After the three `let` lines there is still one template and three objects, each with fields `name` and `count`: "red", "blue", "green", and 0 in every `count`. The names a, b, c each point to their own card.',
      'Each `tick()` changes exactly one object. The captions read "a.count: 0 → 1 · unchanged: b, c", then "a.count: 1 → 2 · unchanged: b, c", then "c.count: 0 → 1 · unchanged: a, b".',
      '`show a.count` prints 2 and `show b.count` prints 0: same field name, different objects, different values. The final state is a("red", 2), b("blue", 0), c("green", 1).',
      'A step is one top-level line; the lines inside `create` and `tick` happen within that step. Nine steps, counting the start.',
      'The code is a small language-neutral notation. The constructor is written `create`; Java and C# name it after the class, Python uses `__init__`, JavaScript and TypeScript use `constructor`. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole program by itself and stops after printing 2 and 0.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to the second `a.tick()` shows a\'s count at 2 while b and c still hold 0.',
        'The class, the three names and the calls are fixed.',
      ],
    },

    useWhen: [
      'A reader thinks the class itself holds the data, or that objects made from one class share their values. Three cards with the same field names and different numbers, and `b.count` still 0 after two ticks on a, settle it.',
      'The article introduces `new` and constructors and wants to show that each call yields a fresh object with its own copy of every field.',
    ],

    avoidWhen: [
      'The subject is static or class-level fields that all instances share. Every field here belongs to one object.',
      'The article is about subclasses, extends, or where a method is found. There is a single class with no parent.',
      'The point is hiding fields from outside code. Both fields are public and are read directly with `a.count`.',
    ],

    contrastWith: [
      {
        concept: 'aliasing',
        note: 'Aliasing is several names for one thing, so a change through one is seen through all. Instantiation is the opposite arrangement: several things built from one description, so a change to one stays with that one.',
      },
      {
        concept: 'methodLookupUp',
        note: 'What differs between instances is their field values; the method code is written once in the class and found from there. Where that finding goes when the class does not have the name is the other concept.',
      },
      {
        concept: 'encapsulationBoundary',
        note: 'Giving each object its own fields says nothing about who may touch them. Restricting access to those fields is a separate rule layered on top.',
      },
    ],
  },
};
