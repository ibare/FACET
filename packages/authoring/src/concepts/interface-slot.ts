/**
 * interfaceSlot 개념 선언.
 *
 * canonical facet 은 `facet:interfaceSlot` — `interface Light` 의 서명 `on()` · `off()` 는 몸 없는 빈칸 둘이다.
 * `flip(new Lamp())` 에서 Lamp 의 몸 둘이 칸에 한꺼번에 꽂혀 `light.on()` · `light.off()` 가 "lamp glows" ·
 * "lamp dims" 를 보이고, `flip(new Neon())` 에서 칸이 통째로 Neon 의 몸으로 갈아 끼워져 "neon buzzes" · "neon fades".
 * `flip` 의 글자는 그대로. 부른 줄 2 · 돈 몸 4. 걸음 일곱 (시작 포함).
 *
 * ── 묶음 안에서의 자리 (객체 지향 다섯)
 *
 * **약속은 이름과 인자만 정하고 몸은 구현이 채우며, 갈아 끼워도 부르는 쪽은 그대로**를 맡는다. "interface ·
 * signatures without bodies · implements · contract · swapped" 를 이쪽이 독점한다. 한 줄이 부를 때마다 갈라지는
 * 일(call site · run time · receives)은 `dynamicDispatch`, 부모에서 물려받기(inheritance · superclass · climb)는
 * `methodLookupUp` 에 두고 definition 에서 쓰지 않는다.
 *
 * 전제: 코드는 어느 한 언어도 아닌 표기다 — 자바 · C# · 타입스크립트의 `interface` · `implements` 와 같은 모양이고,
 * 파이썬에는 이 낱말이 없어 추상 기반 클래스나 `Protocol` 로 적는다. 몸이 약속의 칸에 "꽂힌다" 는 것은 그림의
 * 모형이다 — 실제로 몸은 제 클래스에 남고 부름이 객체의 클래스로 간다. 서명을 빠뜨리면 실행 전에 거부된다는 것은
 * 설명 글에만 있고 화면은 두 클래스가 다 채운 경우만 그린다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const interfaceSlotConcept: FacetConceptSource = {
  id: 'interfaceSlot',
  label: 'Interface (Signatures Without Bodies)',
  canonicalFacet: 'facet:interfaceSlot',

  surface: {
    definition:
      'An interface declares only method signatures with no bodies; each class that implements it supplies the bodies, so a function written against the contract works with any implementation, swapped without editing it.',
    exemplarKeywords: [
      'interface',
      'implements',
      'abstract method',
      'contract',
      'program to an interface',
      'pluggable implementation',
      'protocol',
      'abstract base class',
      'dependency inversion',
      'swap one implementation for another',
    ],
  },

  briefing: {
    observable: [
      'The code declares `interface Light` with `function on()` and `function off()` and nothing beneath them, then `class Lamp implements Light` and `class Neon implements Light`, each with its own `on()` and `off()` whose bodies are one `show` line. `function flip(light)` calls `light.on()` and `light.off()`; the program runs `flip(new Lamp())` then `flip(new Neon())`.',
      'In the middle the interface, labelled "promise", shows an "empty" slot beside each of its two signatures. The start caption reads "Nothing has run yet. Empty slots in Light: 2".',
      '`flip(new Lamp())`: both of Lamp\'s bodies lift off its card and plug into the two slots at once. The caption reads "flip receives: Lamp object — its bodies plug into the slots. Filled: 2", and a label reads "light: Lamp object".',
      'Each call goes through its slot to the plugged body: "light.on() goes through the slot to the Lamp body. Output: lamp glows", then "lamp dims".',
      '`flip(new Neon())` swaps the slots whole: "flip receives: Neon object — Lamp bodies come out, Neon bodies go in." The same two lines then print "neon buzzes" and "neon fades".',
      'The text of `flip` never changes. The tally ends at "flip lines: 2 · bodies run: 4". Seven steps, counting the start.',
      'The code is a small language-neutral notation shaped like `interface`/`implements` in Java, C# and TypeScript; Python has no such keyword and uses abstract base classes or `Protocol`. Bodies plugging into the interface is a picture of the rule — in a real runtime each body stays in its class. Both classes here fill every signature; the case of a missing one is not shown.',
    ],

    screen: {
      affordances: [
        'The screen plays both `flip` calls by itself and stops with the Neon bodies in the slots.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to the second `flip` holds the swap, with Lamp\'s bodies leaving and Neon\'s arriving.',
        'The interface, the two classes and the calls are fixed.',
      ],
    },

    useWhen: [
      'A reader asks what an interface is for if it contains no code. Empty slots that only a class can fill, and a caller that never mentions Lamp or Neon, answer it.',
      'The article advises programming to an interface or injecting a dependency, and wants to show one implementation replaced by another while the using function stays exactly as written.',
    ],

    avoidWhen: [
      'The subject is a parent class passing its methods down to children. The interface here has no code to pass down.',
      'The article needs default methods in interfaces (Java 8+, C# 8+) or abstract classes that mix code and signatures. Every signature here is empty.',
      'The article is about the compile error when a class leaves a signature unimplemented. Both classes here implement everything.',
    ],

    contrastWith: [
      {
        concept: 'dynamicDispatch',
        note: 'The interface is the agreement on names that makes a caller independent of the class; dispatch is what, on each call, carries the call to the actual object\'s method. An interface cannot work without it, but the agreement, not the routing, is what this concept is about.',
      },
      {
        concept: 'methodLookupUp',
        note: 'Inheritance hands working code down from an ancestor, and a missing method is found above. An interface hands nothing down; every method must be written by the class that promises it.',
      },
      {
        concept: 'functionAsValue',
        note: 'Both let a function run code chosen by whoever calls it. Passing a function hands over a single behaviour; an interface hands over an object that must supply a whole named set of them.',
      },
    ],
  },
};
