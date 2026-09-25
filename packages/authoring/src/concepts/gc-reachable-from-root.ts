/**
 * gcReachableFromRoot 개념 선언.
 *
 * canonical facet 은 `facet:gcReachableFromRoot` — 수거가 시작되는 한 순간. 뿌리 a → A, b → D. 힙에 A · E · B · C · F ·
 * D · G 가 그 차례로 놓이고 가리킴은 A → B · B → C · D → C · E → F · F → C. 표시가 a 에서 A · B · C, b 에서 D 로
 * 번지고(D → C 는 이미 표시), 훑음이 놓인 차례로 일곱을 지나 E · F · G 를 거둔다. F 는 E 의 가리킴을 받는데도 거둬진다.
 * 걸음 열둘 (시작 포함). 화면에 코드는 없다.
 *
 * ── 서브도메인 안에서의 자리 (메모리 모델 여덟 — 치우는 쪽 셋)
 *
 * "tracing · roots · mark · sweep · unmarked · reachable" 을 이쪽이 독점한다. `refcountZero` 의 count · tally ·
 * zero, `referenceCycle` 의 cycle · each other 를 definition 에서 쓰지 않는다. 그래프 탐색 조각(`markVisitedOrLoop` ·
 * `dfs`)과는 "무엇을 치우는가" 로 가르고 visited · traversal · vertex 를 쓰지 않는다.
 *
 * 전제: 객체 이름 · 뿌리 이름 · 힙에 놓인 차례는 예로 정한 것이다. 실제 수거기는 표시를 객체 머리의 비트나 따로 둔 표에
 * 적고, 거둔 자리는 다음 할당에 다시 쓴다. 표시 단계는 깊이 우선으로 번지게 그렸다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const gcReachableFromRootConcept: FacetConceptSource = {
  id: 'gcReachableFromRoot',
  label: 'Tracing Garbage Collection (Reachable from the Roots)',
  canonicalFacet: 'facet:gcReachableFromRoot',

  surface: {
    definition:
      'A tracing garbage collector marks every object reachable from the roots by following references, then sweeps through memory and discards each unmarked object, even one that some unreachable object still references.',
    exemplarKeywords: [
      'garbage collection',
      'garbage collector',
      'mark and sweep',
      'mark-sweep',
      'tracing GC',
      'GC roots',
      'reachability',
      'unreachable objects',
      'how the JVM decides what to collect',
      'JavaScript garbage collection',
      'Go garbage collector',
    ],
  },

  briefing: {
    observable: [
      'The screen shows a single moment of a paused program: Roots (a pointing to A, b pointing to D) and a Heap of seven objects laid out as A, E, B, C, F, D, G, with arrows A → B, B → C, D → C, E → F and F → C. There is no code; collection happens on this snapshot.',
      'Mark phase: "Mark A: root a points to it.", then B and C "reached from" the object before, then D from root b; the arrow D → C meets C already marked and is "not entered again". Four objects are marked.',
      'Sweep phase: a hand passes through the heap in the order objects are laid out, "Sweep 1/7" to "Sweep 7/7". Marked objects are "Kept, mark cleared"; unmarked ones are "Reaped where it lies". Each sweep step also lists "Pointed to by:" for that object.',
      'F is reaped although it is "Pointed to by: E" — E itself is not reached from any root. C is kept although one of its three incoming arrows comes from F, which is reaped. The tally ends "kept: 4 · reaped: 3" (A, B, C, D kept; E, F, G reaped).',
      'Twelve steps in all: the start, four marks and seven sweep steps.',
      'Object names, root names and heap order are example values. Real collectors record marks in object header bits or a side table, and swept space is reused for later allocations. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays marking and then sweeping by itself and stops with three objects reaped.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to the sweep of F holds the moment an object that is still pointed to is reaped.',
        'The heap and its arrows are fixed.',
      ],
    },

    useWhen: [
      'The reader believes a garbage collector frees objects that nothing points to. F being reaped while E still points at it shows that the question is reachability from the roots, not incoming pointers.',
      'The article explains the mark and sweep phases of a tracing collector as used by the JVM, .NET, Go or JavaScript engines, and wants the two phases shown in order on one heap.',
    ],

    avoidWhen: [
      'The subject is reference counting, as in CPython or Swift. Nothing here is counted; only reachability decides.',
      'The article is about generational, incremental or concurrent collection, compaction, or pause times. One stop-the-world mark and sweep over seven objects is drawn.',
      'The point is graph traversal as an algorithm. The traversal here serves only to decide what stays in memory.',
    ],

    contrastWith: [
      {
        concept: 'refcountZero',
        note: 'Both remove objects nobody can use, by different tests: counting incoming pointers removes an object the moment its count falls to zero, while tracing ignores counts and asks only whether a path from a root exists.',
      },
      {
        concept: 'referenceCycle',
        note: 'A pair of objects pointing at each other defeats counting because each keeps the other\'s count above zero. Tracing is not fooled by this: if no root leads to the pair, neither gets a mark and both are swept.',
      },
      {
        concept: 'markVisitedOrLoop',
        note: 'Both mark what has been reached so that no place is entered twice. There the mark keeps a walk from circling forever; here the absence of a mark is the verdict that decides what is removed.',
      },
      {
        concept: 'memoryLeak',
        note: 'Memory that can no longer be reached is reclaimed automatically under tracing collection. Without a collector, the same lost memory stays allocated until the program ends.',
      },
      {
        concept: 'tracingVsRefcount',
        note: 'Reachability from the roots is what a tracing collector judges by. Setting that verdict against counting on the same objects adds a further claim: the two agree everywhere except where pointers close a loop.',
      },
    ],
  },
};
