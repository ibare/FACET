/**
 * dynamicDispatch 개념 선언.
 *
 * canonical facet 은 `facet:dynamicDispatch` — 부모 `Instrument` 와 `play` 를 저마다 다시 적은 `Drum` · `Bell` ·
 * `Flute`. `let band = [new Drum(), new Bell(), new Flute()]` 을 `for each item in band` 로 돌며 같은 줄
 * `show item.play()` 가 부를 때마다 그 순간 item 의 클래스에 있는 몸으로 가서 "boom" · "ding" · "toot" 를 받아 온다.
 * 부르는 줄 1 · 간 몸 3 · 한 번도 가지 않은 몸 Instrument.play. 걸음 열하나 (시작 포함).
 *
 * ── 묶음 안에서의 자리 (객체 지향 다섯)
 *
 * **한 부르는 줄이 받는 객체에 따라 다른 몸으로 갈라진다**를 맡는다. "call site · run time · the object it
 * receives · polymorphism" 을 이쪽이 독점한다. 세 클래스 모두 play 를 제 몸에 가져 위로 오르지 않으므로
 * `methodLookupUp` 의 inheritance chain · superclass · search · climb · override 를 definition 에서 쓰지 않는다.
 * 약속과 빈칸(interface · signature · contract)은 `interfaceSlot` 에 둔다.
 *
 * 전제: 코드는 어느 한 언어도 아닌 표기이고 타입이 없다. 자바는 모든 인스턴스 메서드가 이렇게 갈리지만 C++ 은
 * `virtual`, C# 은 `virtual` · `override` 를 적어야 하고, 적지 않으면 변수의 선언 타입이 몸을 정한다. 화면은 그
 * 낱말을 그리지 않는다. 가지가 몸으로 자라 나가는 그림은 규칙의 모형이고 실제로는 가상 함수 표를 거친다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const dynamicDispatchConcept: FacetConceptSource = {
  id: 'dynamicDispatch',
  label: 'Dynamic Dispatch (The Receiving Object Picks the Method)',
  canonicalFacet: 'facet:dynamicDispatch',

  surface: {
    definition:
      'Dynamic dispatch lets one call site choose its target at run time by the class of whichever object it receives, so an unchanged line yields a different result for each kind of object in a collection.',
    exemplarKeywords: [
      'runtime polymorphism',
      'subtype polymorphism',
      'virtual method',
      'virtual function',
      'late binding',
      'dynamic binding',
      'calling the same method on a list of different objects',
      'replace conditional with polymorphism',
      'vtable',
    ],
  },

  briefing: {
    observable: [
      'The code declares `class Instrument` with `play()` returning "...", and `Drum`, `Bell`, `Flute`, each `extends Instrument` and each with its own `play()` returning "boom", "ding", "toot". Then `let band = [new Drum(), new Bell(), new Flute()]`, `for each item in band`, and inside it the single line `show item.play()`. The four classes stand on the right.',
      'The first step builds the list: three objects drop out of the `new Drum()`, `new Bell()`, `new Flute()` text into `band`; the caption reads "The list is built — objects in band: 3".',
      'On each pass the `item` marker moves to the next object, and a branch grows from the end of the call line to the `play` body of that object\'s class. The caption reads "Class of item now: Drum → it runs the body of Drum.play" (then Bell, then Flute).',
      'The body\'s `return` hands its value back along the same branch to the same call line, which prints it: boom, ding, toot. The captions read "Value the body returns: …" and "Back at the same call line — shown: …".',
      'At the end three branches fan out from one point and the caption reads "Call lines: 1 · Bodies reached: 3 · Never reached: Instrument.play". Every subclass has its own `play`, so no call goes up to the parent.',
      'A step is a call, a return, or a print, plus the list being built: eleven steps, counting the start.',
      'The code is a small language-neutral notation without types. In Java every instance method is chosen this way; C++ needs `virtual` and C# needs `virtual`/`override`, otherwise the declared type of the variable decides. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen runs the loop by itself and stops after printing "toot" with the three branches in place.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to any call holds the branch reaching one class\'s body.',
        'The classes and the list are fixed.',
      ],
    },

    useWhen: [
      'A reader expects `item.play()` to mean one fixed piece of code because it is written once. Three branches from a single unchanged line show the choice being made again at every call.',
      'The article argues for polymorphism over if/else or switch on type, and needs a loop over mixed objects that contains no type test at all.',
    ],

    avoidWhen: [
      'The subject is how a method missing from a class is found in its ancestors. Every class here has its own `play`, so nothing is searched upward.',
      'The article is about overloading — choosing between methods of the same name by argument types. The method takes no arguments and there is only one signature.',
      'The article depends on static typing or a C++/C# `virtual` keyword appearing in code. The notation has neither.',
    ],

    contrastWith: [
      {
        concept: 'methodLookupUp',
        note: 'Where a method is found and which object a call is aimed at are separate matters. This concerns the aim: the same line directed at different objects arrives at different code.',
      },
      {
        concept: 'interfaceSlot',
        note: 'An interface is a promise about names that lets a caller be written without knowing the class; dispatch is the mechanism that, at each call, sends the call to the class of the actual object. Dispatch works just as well when the classes share a parent that has working code of its own.',
      },
      {
        concept: 'multiwayBranch',
        note: 'Both make one point in the code lead to different code. A conditional chain decides by tests written at the branch; dispatch decides by the kind of object, with no test written anywhere.',
      },
      {
        concept: 'functionAsValue',
        note: 'Both run code that the calling line does not name. Passing a function hands over one piece of code explicitly; dispatch picks the code from the object, among methods that share one name.',
      },
      {
        concept: 'polymorphism',
        note: 'Dispatch is the single claim that one line reaches different code for different objects. Polymorphism as a whole also covers where that code is found among ancestors, when no class provides it, and which names an interface guarantees.',
      },
    ],
  },
};
