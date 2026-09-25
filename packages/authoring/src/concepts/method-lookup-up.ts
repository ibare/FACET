/**
 * methodLookupUp 개념 선언.
 *
 * canonical facet 은 `facet:methodLookupUp` — `Device` ← `Phone` ← `SmartPhone` 세 층, 객체 `p` 하나(클래스
 * SmartPhone). `p.dial()` 은 SmartPhone 없음 → Phone 있음(들여다봄 2), `p.power()` 는 SmartPhone · Phone 없음 →
 * Device 있음(3), `p.describe()` 는 Phone 에서 멈춘다(2) — Device 에도 describe 가 있지만 들여다보지 않고 그 몸은
 * 끝내 돌지 않는다. 출력 dialing · power on · a phone. 걸음 열둘 (시작 포함).
 *
 * ── 묶음 안에서의 자리 (객체 지향 다섯)
 *
 * **이름이 없으면 부모로 한 층씩 올라가 처음 찾은 곳에서 멈추는 찾는 차례**를 맡는다. "inheritance chain ·
 * superclass · lookup climbs · first superclass defining it · override" 를 이쪽이 독점한다. 받는 객체에 따라 한 줄이
 * 갈라지는 일(call site · run time · receives)은 `dynamicDispatch`, 몸 없는 서명(interface · signature)은
 * `interfaceSlot` 에 두고 definition 에서 쓰지 않는다. 안쪽 이름이 바깥 이름을 가리는 `shadowing` 의 "hide" 도 쓰지 않는다.
 *
 * 전제: 코드는 어느 한 언어도 아닌 표기다. 부모가 하나인 사슬만 그린다 — 여러 부모를 두는 언어(파이썬의 MRO,
 * C++ 다중 상속)는 올라가는 차례를 따로 정한다. 한 층씩 들여다보는 것은 규칙의 모형이고, 실제 구현은 가상 함수 표나
 * 캐시로 곧장 찾는다. 화면은 각주를 달지 않으므로 여기서 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const methodLookupUpConcept: FacetConceptSource = {
  id: 'methodLookupUp',
  label: 'Method Lookup Up the Inheritance Chain',
  canonicalFacet: 'facet:methodLookupUp',

  surface: {
    definition:
      'When a called method is missing from a subclass, lookup climbs the inheritance chain level by level and stops at the first superclass defining that name, so a lower definition overrides any above it.',
    exemplarKeywords: [
      'inheritance',
      'extends',
      'subclass and superclass',
      'parent class',
      'inherited method',
      'method overriding',
      'method resolution order',
      'MRO',
      'inheritance hierarchy',
      'why the child method wins',
    ],
  },

  briefing: {
    observable: [
      'The code declares `class Device` with `power()` and `describe()`, `class Phone extends Device` with `dial()` and `describe()`, and `class SmartPhone extends Phone` with only `browse()`. Then `let p = new SmartPhone()` and three calls: `p.dial()`, `p.power()`, `p.describe()`.',
      'The program sits on the left with each class boxed, Device at the top and SmartPhone at the bottom in declaration order. On the right a vertical line is the inheritance chain with one station per class. One object card `p` of class SmartPhone appears; it never moves — for each call a pill carrying the method name leaves the card and climbs the stations, and the stretch above where it stops stays dashed.',
      'Each call starts at SmartPhone. A class without the name is marked "not here" and the caption reads, for example, "dial(): not in SmartPhone. Up one level."; the class that has it is marked "found" and the caption gives "Classes looked at: n".',
      '`p.dial()` looks at 2 classes and runs Phone\'s body (output "dialing"). `p.power()` looks at 3 and runs Device\'s ("power on"). `p.describe()` looks at 2 and runs Phone\'s ("a phone"). The per-call tallies read "looked at: 2", "looked at: 3", "looked at: 2" — every call restarts at the bottom.',
      'When `describe()` is found in Phone the caption adds "Also in Device, higher up. The search never gets there." Device\'s `describe()` body, `show "a device"`, never runs. `browse()` is never called.',
      'A step is one class looked at, plus the object creation and each body that runs: twelve steps, counting the start.',
      'The code is a small language-neutral notation. The chain has one parent per class; languages with multiple parents define their own climbing order. Looking level by level is the rule\'s model; real runtimes jump straight there with method tables or caches. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the three calls by itself and stops after printing "a phone".',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to the `describe()` search holds the moment it stops at Phone with Device\'s copy left unvisited.',
        'The hierarchy and the calls are fixed.',
      ],
    },

    useWhen: [
      'A reader asks how a subclass object can call a method it never defined. The marker climbing from SmartPhone to Device for `power()` answers it level by level.',
      'The article explains why an overriding method in a subclass wins over the parent\'s, and wants the reason to be the order of the search rather than a rule to memorise.',
    ],

    avoidWhen: [
      'The subject is one call line behaving differently for different kinds of objects. There is a single object here and every call is a separate line.',
      'The article is about multiple inheritance or diamond resolution order. The chain is a single line of parents.',
      'The article needs `super` calls or constructors chaining upward. No method here calls its parent\'s version.',
    ],

    contrastWith: [
      {
        concept: 'dynamicDispatch',
        note: 'Which object receives a call and where its method is found are two separate questions. This is the second: a fixed object, a name, and the order in which ancestors are consulted.',
      },
      {
        concept: 'interfaceSlot',
        note: 'Inheriting brings working code down from an ancestor that already has it. An interface passes nothing down; it names methods that each class must write for itself.',
      },
      {
        concept: 'multiwayBranch',
        note: 'Both consult candidates in a fixed order and take the first that fits, leaving later ones unconsulted. An else-if chain tests conditions written in one place; this consults class definitions arranged by ancestry.',
      },
      {
        concept: 'shadowing',
        note: 'Both let a nearer definition win over a farther one with the same name. Shadowing concerns variable names in nested blocks; this concerns method names across a family of classes.',
      },
      {
        concept: 'polymorphism',
        note: 'Lookup is one rule with the object held still. Polymorphism is what that rule produces once the object varies: the same name resolves to different ancestors, or to nothing, depending on where the search begins.',
      },
    ],
  },
};
