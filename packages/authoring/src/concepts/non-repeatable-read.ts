/**
 * nonRepeatableRead 개념 선언.
 *
 * canonical facet 은 `facet:nonRepeatableRead` — 줄 `lamp` 확정값 40, T1 은 READ COMMITTED. `R1(lamp)` 40 → `W2(lamp=55)`(아직
 * 확정 전, 확정값 40) → `C2` 로 확정값 55 → 다시 `R1(lamp)` 55. 네 걸음, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 형제 `dirtyRead` 는 확정 안 된 값, `phantomRead` 는 결과에 든 줄의 모임, `readSeesSnapshot` 은 **두** 트랜잭션이 시작 때가 달라
 * 갈리는 일이다. 이쪽은 **한** 트랜잭션이 **같은 줄**을 두 번 읽어 **둘 다 확정된** 서로 다른 값을 받는 장면을 쥔다. 그래서
 * definition 은 same row twice · both committed · lock released after each read 를 독점하고, never committed · inserted · snapshot 을
 * 쓰지 않는다.
 *
 * 전제 (설명 글 `nonRepeatableRead.md`): ANSI SQL-92 잠금 기반 뜻. PostgreSQL · InnoDB 는 스냅샷으로 구현한다. T1 의 커밋은 그리지
 * 않는다. 값은 예.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const nonRepeatableReadConcept: FacetConceptSource = {
  id: 'nonRepeatableRead',
  label: 'Non-Repeatable Read (Same Row, Two Committed Values)',
  canonicalFacet: 'facet:nonRepeatableRead',

  surface: {
    definition:
      'Under READ COMMITTED a transaction that reads the same row twice can get two different values, both committed, because each read releases its lock and another transaction\'s update commits in between.',
    exemplarKeywords: [
      'non-repeatable read',
      'fuzzy read',
      'READ COMMITTED anomaly',
      'value changed between reads',
      'reading the same row twice',
      'inconsistent read within a transaction',
      'why use REPEATABLE READ',
      'read skew',
    ],
  },

  briefing: {
    observable: [
      'The start reads "Row lamp, committed value: 40. T1 runs at READ COMMITTED." T1 is on one side, T2 on the other, and the row `lamp` with its committed value sits between them.',
      '"R1(lamp) reads what is committed right now: 40." The 40 is placed under T1.',
      '"W2(lamp=55) is not committed yet. Committed value: 40." The 55 appears marked "not committed"; a read at this moment would still give 40.',
      '"C2: the write becomes committed. Committed value: 55."',
      '"Same row, R1(lamp) again. First read: 40. This read: 55." T1 now holds two different values for one row, and each was the committed value at the moment it was read.',
      'T1\'s own commit is not drawn. The isolation level follows the ANSI SQL-92 lock-based meaning; PostgreSQL and MySQL InnoDB build READ COMMITTED and REPEATABLE READ on snapshots instead. Values are chosen for the example. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays the four operations by itself and stops after the second read.',
        'A Replay button and a playback strip sit below it. Holding the write step shows 55 present but not yet committed, with the committed value still 40.',
      ],
    },

    useWhen: [
      'The article explains why READ COMMITTED is not enough for a transaction that checks a value and later relies on it, and needs two reads that disagree without either being wrong.',
      'A reader confuses a non-repeatable read with a dirty read; the case where every value involved is committed separates them.',
    ],

    avoidWhen: [
      'The article is about rows appearing in or disappearing from a query result. Only one existing row is read here.',
      'The subject is the uncommitted value being visible. The 55 is seen only after it commits.',
      'The point is how snapshot-based engines keep both reads equal. No snapshot is involved here.',
    ],

    contrastWith: [
      {
        concept: 'dirtyRead',
        note: 'A dirty read exposes a value that is never committed; a non-repeatable read involves only committed values that change between two reads.',
      },
      {
        concept: 'phantomRead',
        note: 'A non-repeatable read is an existing row taking a new value; a phantom is a new row joining the set a condition selects, which row locks cannot stop.',
      },
      {
        concept: 'readSeesSnapshot',
        note: 'With a transaction-level snapshot, repeated reads inside one transaction agree; values differ only between transactions that began at different times.',
      },
      {
        concept: 'isolation',
        note: 'Holding read locks until commit is what REPEATABLE READ adds to remove this anomaly, and that is where other writers start waiting.',
      },
    ],
  },
};
