/**
 * polymorphism 개념 선언.
 *
 * canonical facet 은 `facet:polymorphism` — 약속 `interface Figure`(서명 `area` · `label`) 아래 `Shape` ← `Polygon` ←
 * `Square` 세 클래스. 부르는 줄 `s.<이름>()` 은 그대로 두고 손잡이 둘(받는 객체 · 부르는 이름)을 돌린다. 판마다
 * 객체가 제 클래스 상자에서 찍혀 나오고, 찾기 표식이 그 상자에서 위로 올라 이름이 처음 나온 층에서 멈춘다.
 * 약속한 이름이면 찾은 몸이 `Figure` 의 칸에 꽂힌다. 아홉 조합 중 실패는 `Shape × corners` 하나(`NoMethod`).
 * 코드 패널은 없다 (IR 이 여섯 언어의 같은 뜻을 옮길 수 없다 — `irs.ts`).
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 넷)
 *
 * 조각들은 저마다 한 장면을 쥔다 — 객체가 틀에서 찍혀 나옴(`instantiateFromClass`), 위로 한 층씩 찾아 오름
 * (`methodLookupUp`), 한 줄이 받는 객체마다 다른 몸으로 감(`dynamicDispatch`), 약속의 빈칸에 몸이 꽂힘
 * (`interfaceSlot`). 이쪽은 그 넷을 한 화면에 잇고 **받는 객체를 손잡이로 돌려 무엇이 갈리는가**를 맡는다 —
 * 도는 몸 · 올라간 층 수 · 실패. 그래서 definition 은 "held fixed · switching the receiving object's class ·
 * which ancestor answers · how far up · fails" 로 조작과 대비를 말하고, 조각이 독점한 낱말(call site · run time ·
 * climbs · superclass · overrides · signatures · implements · swapped · instance · template)을 쓰지 않는다.
 * 넓은 이름 `polymorphism` 은 이쪽이 가져온다 — 호스트 토픽이 class · inheritance · interface 를 합친 자리다.
 *
 * 전제 (화면은 각주를 달지 않는다):
 * - 코드는 어느 한 언어도 아닌 표기다 (`function` · `class … extends …` · `implements` · `new` · `show`).
 * - 찾기를 **부를 때** 일어나는 것으로 그렸다. 자바 · C# · C++ · 타입스크립트는 선언된 형으로 돌기 전에 같은
 *   찾기를 해 `Shape` 에서 `corners` 를 부르는 줄을 컴파일 오류로 거부한다. 파이썬 · 자바스크립트는 돌다가 실패한다.
 * - 가상 호출만 그렸다. C++ 은 `virtual`, C# 은 `virtual`/`override` 가 없으면 부모 형 변수로 부를 때 다른 몸이 돈다.
 * - 파이썬에는 `interface` 낱말이 없다 — 추상 기반 클래스 · 프로토콜이 그 자리다.
 * - 한 층씩 들여다보는 것은 규칙의 모형이다. 실제 구현은 가상 함수 표나 캐시로 곧장 간다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const polymorphismConcept: FacetConceptSource = {
  id: 'polymorphism',
  label: 'Polymorphism (Class, Inheritance and Interface Together)',
  canonicalFacet: 'facet:polymorphism',

  surface: {
    definition:
      'Polymorphism compared across receivers: with one method call held fixed, switching only the receiving object\'s class decides which ancestor\'s method answers, how far up it is found, or whether the call fails.',
    exemplarKeywords: [
      'polymorphism',
      'object-oriented programming',
      'classes, inheritance and interfaces together',
      'same method call on different objects',
      'which method gets called',
      'class hierarchy',
      'inherited versus overridden method',
      'method not found error',
      'AttributeError: object has no attribute',
      'undefined is not a function on an object',
      'OOP polymorphism example',
    ],
  },

  briefing: {
    observable: [
      'The program is shown as boxes, parent above child: `interface Figure` with the bodiless `function area()` and `function label()`; `class Shape implements Figure` with `area()` → `show "unknown area"` and `label()` → `show "shape"`; `class Polygon extends Shape` with `corners()` → `show "has corners"` and `label()` → `show "polygon"`; `class Square extends Polygon` with only `area()` → `show "side * side"`. Below them sit the call lines `let s = new Square()` and `s.label()`, an object spot and a "Console".',
      'Each round starts by stamping a fresh object out of the chosen class box; an arrow from the object points at that class and the caption reads "Class: Square".',
      'A marker then appears at that class and moves upward one box per step. A box without the name is tagged "not here"; the first box that has it is tagged "found" and the search stops there. The caption counts "Classes looked: n".',
      'On success a branch reaches from the end of the call line to the body that was found, its `show` prints in the Console, and the captions read "Output: polygon" and "Levels up: 1". If the name was one promised by `Figure`, that body lifts up and plugs into the matching slot of the `Figure` card; the body plugged there by the previous round drops back to its own class.',
      'On failure the marker climbs past `Shape` into empty space, no branch forms, and the caption reads "Error: NoMethod".',
      'Across the nine combinations: `label` answers from Shape, Polygon, Polygon for receivers Shape, Polygon, Square; `area` answers from Shape, Shape, Square; `corners` fails for Shape and answers from Polygon for the other two. `Square` with `area` finds its own body first, so `Shape.area` is never looked at; `Polygon` with `area` goes one level up to Shape.',
      'The two promised names (`area`, `label`) are found for every receiver; the unpromised `corners` fails for one receiver in three. Only the slot of the name just called is filled — nothing is looked up in advance.',
      'The counters "Classes looked" (1 or 2) and "Lookup errors" (0 or 1) hold the values of the current round only. A round is four or five steps: start, stamp, one step per class looked, then run or fail. Every round begins the search again from the receiver\'s class.',
      'The code is a language-neutral notation. The search is drawn as happening at the call: Java, C#, C++ and TypeScript run the same search on the declared type before the program runs and reject `corners` on a Shape at compile time, while Python and JavaScript fail while running. Only virtual calls are drawn — without `virtual` in C++ or `virtual`/`override` in C#, a call through a parent-typed variable runs the parent\'s body. Python has no `interface` keyword; abstract base classes or protocols fill that role.',
    ],

    screen: {
      affordances: [
        'The bar carries play, single step, pause, reset and a speed slider, plus two segmented handles: Receiver (Shape, Polygon, Square — Square to begin with) and Method (area, corners, label — label to begin with).',
        'One round plays through and then waits. Turning either handle changes only the last two lines of the program and runs the search again from the receiver\'s class, so the branch visibly moves from the old body to the new one.',
        'The move that makes the idea land is keeping the Method on one name and stepping the Receiver through all three: the same line lands on different bodies, at different heights, and for `corners` once in failure.',
      ],
    },

    useWhen: [
      'The article treats classes, inheritance and interfaces as one subject and needs a single place where a reader can ask "which body runs for this object?" and test every answer themselves.',
      'A reader asks why a call works on one object and throws a method-not-found error on another object of the same family, and should find the failing combination by turning the handles rather than being told.',
      'The article claims that coding to an interface keeps calls safe across a hierarchy, and wants the promised names answering for every receiver while an unpromised name fails for one.',
    ],

    avoidWhen: [
      'The subject is how a statically typed compiler rejects a call before the program runs. The screen performs the search at the call and reports the failure there.',
      'The article depends on non-virtual methods, C# `new` hiding, or overloading by argument types. Every call here is a virtual call with no arguments.',
      'The article is about multiple inheritance, mixins or `super` calls. The hierarchy is a single line of parents and no method calls its parent\'s version.',
    ],

    contrastWith: [
      {
        concept: 'dynamicDispatch',
        note: 'Dispatch is the single claim that one call line reaches different code for different objects. Polymorphism as a whole also covers where that code is found, when no class provides it, and how an interface guarantees some names always resolve.',
      },
      {
        concept: 'methodLookupUp',
        note: 'Lookup fixes the object and asks in what order ancestors are consulted. Here the object itself is the variable, so the same question gets a different starting point, a different answer and sometimes no answer.',
      },
      {
        concept: 'interfaceSlot',
        note: 'An interface on its own is a promise of names that each implementation fills. Placed over an inheritance chain, the promise meets inherited and overridden bodies, and the claim becomes which of them fills the promise for a given object.',
      },
      {
        concept: 'instantiateFromClass',
        note: 'Instantiation concerns what each object holds; polymorphism concerns what each object does when called. The class an object was made from is the starting point for the second question.',
      },
    ],
  },
};
