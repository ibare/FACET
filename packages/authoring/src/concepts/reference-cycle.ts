/**
 * referenceCycle 개념 선언.
 *
 * canonical facet 은 `facet:referenceCycle` — `let a = new Node()` · `let b = new Node()` · `a.next = b` · `b.next = a` ·
 * `a = null` · `b = null`. 수는 A 1 → 2 → 1, B 1 → 2 → 1. 끝에 객체를 가리키는 이름은 0 개인데 두 객체는 1 · 1 로 서로를
 * 붙든 채 남고, 치움 걸음은 한 번도 오지 않는다. 걸음 일곱 (시작 포함).
 *
 * ── 서브도메인 안에서의 자리 (메모리 모델 여덟 — 치우는 쪽 셋)
 *
 * "cycle · each other · partner · stuck at 1" 을 이쪽이 독점한다. `refcountZero` 의 tally · zero · reclaim,
 * `gcReachableFromRoot` 의 roots · mark · sweep · reachable 을 definition 에서 쓰지 않는다. 누수 결과는
 * `memoryLeak` 의 leak 을 쓰지 않고 "never removed" 로 말한다.
 *
 * 전제: `Node` 는 필드 `next` 하나를 가진 객체이고 처음 값은 null 이다. 이름 칸이든 필드든 가리킴 하나가 1 이며, 새 값을
 * 먼저 올리고 옛 값을 내린다. 줄이 끝났을 때 수가 0 인 객체를 치운다. 코드는 어느 언어도 아닌 표기다. 실제 참조 계수
 * 환경이 이 빈틈을 메우는 방법(약한 참조 · 순환 수거기)은 화면 밖이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const referenceCycleConcept: FacetConceptSource = {
  id: 'referenceCycle',
  label: 'Reference Cycle (Counts Stuck Above Zero)',
  canonicalFacet: 'facet:referenceCycle',

  surface: {
    definition:
      'Two objects whose fields point at each other form a reference cycle: after every variable lets go, each still gets one count from its partner, so both counts stay stuck at 1 and neither object is ever removed.',
    exemplarKeywords: [
      'reference cycle',
      'circular reference',
      'retain cycle',
      'strong reference cycle in Swift',
      'cyclic garbage',
      'weak reference',
      'weak_ptr to break a cycle',
      'Rc cycle memory leak in Rust',
      'parent and child pointing at each other',
      'CPython cycle collector gc module',
    ],
  },

  briefing: {
    observable: [
      'The program is six lines: `let a = new Node()`, `let b = new Node()`, `a.next = b`, `b.next = a`, `a = null`, `b = null`. A Stack holds the name cells a and b; the Heap holds the objects, each a Node box with a field next and a count in a circle.',
      'Each pointer is drawn as one arrow and one token under the target object; the count is the number of tokens. Arrows and tokens from names and from fields have different colours.',
      'The two `new` lines create A and B with a count of 1 each. `a.next = b` grows an arrow from A\'s field to B and a token "A.next" moves over, so B\'s count becomes 2; `b.next = a` does the same for A.',
      '`a = null` withdraws a\'s arrow and token: "Let go: a → A. Count of A: 1". `b = null` does the same for B. The status line ends "Names pointing at an object: 0 · Objects reclaimed: 0".',
      'At the end both objects remain with counts 1 and 1, each still held by the other\'s field. No removal step ever comes; seven steps in all, counting the start, and the last line is the final picture.',
      'Node is an object with one field, next, starting as null; the class definition is left off screen. Every name cell or field that points at an object adds 1, the new target is raised before the old one is lowered, and an object is removed when its count is 0 at the end of a line. The code is a small language-neutral notation. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the six lines by itself and stops with both objects still on the heap.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to `a = null` holds the moment A has no name pointing at it but still carries B.next\'s token.',
        'The program is fixed.',
      ],
    },

    useWhen: [
      'The reader believes reference counting frees everything a program can no longer use. Both names gone while the counts sit at 1 and 1 shows the case it misses.',
      'The article explains retain cycles in Swift or Objective-C, `Rc` cycles in Rust or `shared_ptr` cycles in C++, and why a weak reference on one side is the usual fix.',
      'The article explains why CPython pairs reference counting with a separate cycle collector.',
    ],

    avoidWhen: [
      'The subject is a tracing collector such as the JVM\'s or a JavaScript engine\'s. Those remove such a pair without trouble.',
      'The article is about a graph algorithm detecting cycles. The cycle here matters only for memory.',
      'The article needs the weak-reference fix shown in action. It is not drawn; both references here are ordinary.',
    ],

    contrastWith: [
      {
        concept: 'refcountZero',
        note: 'Counting removes an object when its last holder lets go. In a cycle the last holders are the objects themselves, so the release that would reach zero never comes.',
      },
      {
        concept: 'gcReachableFromRoot',
        note: 'Tracing asks whether any root leads to an object, not how many things point at it. A pair that only points at itself is unreached and gets swept, which is why cycles are a problem only under counting.',
      },
      {
        concept: 'memoryLeak',
        note: 'Both leave memory occupied that the program can never use again. In a cycle the automatic mechanism is defeated by the objects\' own pointers; a manual leak comes from overwriting the last address before calling free.',
      },
      {
        concept: 'markVisitedOrLoop',
        note: 'A cycle in a graph traps a walk that does not remember where it has been. A cycle between objects instead traps a count that can only be lowered from outside the cycle.',
      },
      {
        concept: 'tracingVsRefcount',
        note: 'A pair holding each other is the case where counting fails. The comparison of the two strategies adds that it is the only such case: without a loop, counting and tracing remove the same objects.',
      },
    ],
  },
};
