/**
 * growThenShrink 개념 선언.
 *
 * canonical facet 은 `facet:growThenShrink` — T1 의 일 R1(a) · W1(b) · R1(c) · W1(d). 연산 직전에 S / X 를 잡아 쥔 수가 1 · 2 · 3 · 4 로
 * 늘고 걸음 4 가 잠금 지점, 그 뒤 잡은 차례로 하나씩 놓아 3 · 2 · 1 · 0. 다 쓰고도 쥔 걸음 a 3 · b 2 · c 1 · d 0. 마지막에 C1.
 * 여덟 걸음, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 형제 `lockWait` 은 남이 쥔 잠금을 기다리는 쪽이고, `sharedVsExclusive` 는 두 요청의 호환이다. 이쪽은 **한 트랜잭션이 쥔 잠금 수의
 * 윤곽** — 놓은 뒤에는 잡지 않는다는 규칙 하나와, 그 탓에 다 쓴 줄을 잠금 지점까지 쥐는 일 — 을 쥔다. 그래서 definition 은 two-phase ·
 * after releasing · lock point · rises once then falls once 를 독점하고, queue · compatible 을 쓰지 않는다.
 *
 * 전제 (설명 글 `growThenShrink.md`): **기본** 2단계 잠금 — 놓기가 커밋 앞에 온다. 실제 데이터베이스가 흔히 쓰는 엄격한 2단계 잠금은
 * 커밋 때 한꺼번에 놓는다. 다른 트랜잭션은 없고 잠금은 줄 단위, 줄 이름 · 차례는 예.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const growThenShrinkConcept: FacetConceptSource = {
  id: 'growThenShrink',
  label: 'Two-Phase Locking (Grow, Lock Point, Shrink)',
  canonicalFacet: 'facet:growThenShrink',

  surface: {
    definition:
      'Two-phase locking forbids taking any lock after releasing one, so a transaction keeps rows it has finished with locked until its lock point; the number of locks it holds rises once, then falls once.',
    exemplarKeywords: [
      'two-phase locking',
      '2PL',
      'growing phase',
      'shrinking phase',
      'lock point',
      'strict two-phase locking',
      'conflict serializability',
      'why not release locks early',
      'basic 2PL vs strict 2PL',
    ],
  },

  briefing: {
    observable: [
      'Four rows a, b, c, d each carry T1\'s operation — `R1(a)`, `W1(b)`, `R1(c)`, `W1(d)`. T1 shows "Held: {n}" and a small chart of the held count on a 0-to-4 scale. The start reads "No lock held yet."',
      '"Take S1(a), then run R1(a)." then X1(b) with W1(b), S1(c) with R1(c): the held count climbs 1, 2, 3 under the label "Growing", and rows already used start counting "Idle steps".',
      '"Take X1(d), then run W1(d). Lock point reached." With four locks held, the "Lock point" is marked on the chart.',
      '"Release: U1(a). Steps held after its use: 3." then U1(b) with 2 and U1(c) with 1, in the order they were taken, under the label "Shrinking". The held count falls 3, 2, 1.',
      '"Release: U1(d). Steps held after its use: 0. Then commit: C1." The outline of the held count rises once and falls once — 1, 2, 3, 4, 3, 2, 1, 0 — never going back up.',
      'This is basic two-phase locking: releases come before the commit. Strict two-phase locking, which databases commonly use, holds every lock until commit. No other transaction runs, locks are per row, and names and order are chosen for the example. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays the eight steps by itself and stops after the commit.',
        'A Replay button and a playback strip sit below it. Holding the lock-point step shows all four rows locked while row a has sat unused for three steps.',
      ],
    },

    useWhen: [
      'The article defines two-phase locking and needs its one rule shown as a shape: the held count may only rise, then only fall.',
      'A reader asks why a transaction cannot release a row as soon as it has finished with it; the finished rows kept locked until the lock point answer it.',
    ],

    avoidWhen: [
      'The article is about lock contention between transactions. Only one transaction runs; nobody waits.',
      'The subject is two-phase commit across databases. This is a locking discipline inside one transaction, unrelated to distributed commit.',
      'The point is strict 2PL specifically. Locks are released one by one before the commit here.',
    ],

    contrastWith: [
      {
        concept: 'lockWait',
        note: 'Two-phase locking constrains when one transaction may release; how long others wait depends on that choice, and the strict form ties every release to the commit.',
      },
      {
        concept: 'isolation',
        note: 'The two-phase rule is what makes a lock-based schedule serializable; isolation levels loosen it by releasing some read locks early.',
      },
      {
        concept: 'lockOrdering',
        note: 'A fixed acquisition order prevents cycles among waiting threads; two-phase locking constrains the timing of acquire and release to keep interleavings serializable, and does not by itself prevent deadlock.',
      },
    ],
  },
};
