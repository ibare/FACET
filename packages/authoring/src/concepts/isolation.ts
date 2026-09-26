/**
 * isolation 개념 선언.
 *
 * canonical facet 은 `facet:isolation` — 연산 열셋의 한 일정(`W3(pen=0)` · `R1(pen)` · `A3` · `R1(lamp)` · `W2(lamp=55)` · `C2` ·
 * `R1(lamp)` · `Q1` · `I4(7, 60)` · `I4(6, 130)` · `C4` · `Q1` · `C1`)을 격리 수준 넷(RU · RC · RR · SER, 처음 RU)으로 돌린다.
 * 이상 3 · 2 · 1 · 0, 기다린 걸음 0 · 1 · 8 · 8, T1 최대 잠금 0 · 0 · 6 · 6. 끝 상태는 넷 다 같고 실행 차례와 T1 이 본 값만 갈린다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 여섯)
 *
 * 조각 여섯은 한 장면씩이다 — 이상 셋(`dirtyRead` · `nonRepeatableRead` · `phantomRead`)과 잠금의 부품 셋(호환 `sharedVsExclusive` ·
 * 줄 서기 `lockWait` · 2단계 `growThenShrink`). 이쪽은 **수준을 올리면 이상이 하나씩 꺼지고 그 값을 기다림으로 치른다**는
 * 견줌을 쥔다. 그래서 definition 은 raising the level · one by one · longer and wider · waiting 을 쥐고, 조각들이 독점한
 * rolls back · twice · inserted · compatible · queue · lock point 를 쓰지 않는다.
 *
 * 전제 (설명 글 `isolation.md`): ANSI SQL-92 잠금 기반 뜻(PostgreSQL · InnoDB 의 스냅샷 구현과 다르다) · 엄격한 2단계 잠금 ·
 * 범위 잠금은 질의 조건 하나를 통째로 잠그는 것으로 줄임 · 이 일정에 교착 없음. 코드 패널은 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const isolationConcept: FacetConceptSource = {
  id: 'isolation',
  label: 'Isolation Levels (What Each Level Prevents and What It Costs)',
  canonicalFacet: 'facet:isolation',

  surface: {
    definition:
      'Raising the SQL isolation level switches off dirty reads, non-repeatable reads and phantoms one by one, paid for by holding locks longer and over wider ranges while other transactions wait.',
    exemplarKeywords: [
      'transaction isolation levels',
      'READ UNCOMMITTED',
      'READ COMMITTED',
      'REPEATABLE READ',
      'SERIALIZABLE',
      'SET TRANSACTION ISOLATION LEVEL',
      'read phenomena',
      'concurrency anomalies',
      'lock-based concurrency control',
      'isolation vs throughput',
      'ANSI SQL-92 isolation',
    ],
  },

  briefing: {
    observable: [
      'Row `pen` holds 5, `lamp` 40, and table `orders(id, amount)` has five rows (1, 80) · (2, 120) · (3, 45) · (4, 200) · (5, 150). `Q1` is `SELECT id, amount FROM orders WHERE amount >= 100;`. T1 is the observed transaction; three lamps — Dirty read, Non-repeatable, Phantom — light when T1 meets that anomaly.',
      'An "Execution order" strip has thirteen slots; each step runs one operation, captioned "Step {n}: {op}". A blocked operation stays in place, tagged "blocked ←" with the holder and its lock, and moves into a later slot when it runs; "Waiting: …" lists what is held up. A "Locks held by T1" panel shows "Held now: {n}", and "Read by T1: …" collects what T1 saw.',
      'READ UNCOMMITTED: T1 reads `pen` 0 from T3 before `A3` rolls it back, `lamp` changes 40 → 55 between its two reads, and the second `Q1` gains row 6. Anomalies 3, waited steps 0, T1 peak locks 0.',
      'READ COMMITTED: `R1(pen)` waits one step behind T3\'s exclusive lock and reads 5, so the dirty read goes dark; locks are dropped after each read, so `W2(lamp=55)` still slips between the reads. Anomalies 2, waited steps 1.',
      'REPEATABLE READ: T1 keeps its shared locks until commit, so `W2(lamp=55)` and `C2` slide to after `C1` and both reads give 40; row 6 is still inserted and appears in the second `Q1`. Anomalies 1, waited steps 8, T1 peak locks 6.',
      'SERIALIZABLE adds a "range lock" on `amount >= 100`, so `I4(6, 130)` and `C4` also move behind `C1`, while `I4(7, 60)` — outside the condition — is not blocked. Anomalies 0, waited steps 8, T1 peak locks 6. At every level the final state is the same: pen 5, lamp 55, seven order rows.',
      'Levels follow the ANSI SQL-92 lock-based meaning under strict two-phase locking; PostgreSQL and MySQL InnoDB implement REPEATABLE READ with snapshots instead and would not make `W2` wait. The range lock stands in for next-key or gap locking. This schedule has no deadlock. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: a four-position "Isolation level" slider RU, RC, RR, SER, starting at RU. Each round plays the fourteen steps, then waits.',
        'The move that makes the idea land is stepping the level up one notch at a time: one anomaly lamp goes dark at each step while operations slide later in the execution order and the waiting count climbs.',
        'Readouts under the controls: Anomalies, Waited steps and T1 peak locks.',
      ],
    },

    useWhen: [
      'The article walks through the four standard isolation levels and needs one schedule on which each level visibly removes exactly one more anomaly.',
      'A reader asks why databases do not simply default to SERIALIZABLE; the waiting count and the operations pushed later in the order show the price.',
    ],

    avoidWhen: [
      'The article is about snapshot isolation or MVCC behaviour in PostgreSQL or InnoDB. The levels here are lock-based and differ from those engines.',
      'The subject is write skew, serialization failures or optimistic concurrency control. None of these arise in the model.',
      'The point is deadlock detection between transactions. This schedule never deadlocks.',
    ],

    contrastWith: [
      {
        concept: 'dirtyRead',
        note: 'Reading a value that is later rolled back is a single anomaly; the isolation question is which level first forbids it and what that costs in waiting.',
      },
      {
        concept: 'nonRepeatableRead',
        note: 'A row changing between two reads is one anomaly; preventing it requires keeping read locks until commit, which is where waiting starts to grow.',
      },
      {
        concept: 'phantomRead',
        note: 'A new matching row is the anomaly that survives row locks; the level that removes it has to lock a condition, not just rows.',
      },
      {
        concept: 'sharedVsExclusive',
        note: 'Which lock requests may coexist is the rule every level is built from; levels differ in how long and how widely they apply it.',
      },
      {
        concept: 'lockWait',
        note: 'Queuing behind a lock until the holder commits is the mechanism; the level decides how many operations end up in that position.',
      },
      {
        concept: 'growThenShrink',
        note: 'Two-phase locking is the discipline that makes lock-based isolation sound; the levels vary which reads take part in it and for how long.',
      },
      {
        concept: 'mvcc',
        note: 'Multiversion concurrency control reaches similar guarantees by letting readers see older versions instead of waiting, trading blocking for kept storage.',
      },
    ],
  },
};
