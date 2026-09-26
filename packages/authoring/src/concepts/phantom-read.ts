/**
 * phantomRead 개념 선언.
 *
 * canonical facet 은 `facet:phantomRead` — `orders` 다섯 줄, T1 은 REPEATABLE READ. 첫 질의 `amount >= 100` 이 줄 셋(2 · 4 · 5)을
 * 돌려주고 S 잠금을 건다. T2 가 (6, 130) · (7, 60) 을 기다림 없이 X 로 넣고 커밋한다. 둘째 질의는 줄 넷 — id 6 이 끼었다.
 * 다섯 걸음, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 형제 `nonRepeatableRead` 는 있는 줄의 값이 바뀌는 일이다. 이쪽은 **잠근 줄은 그대로인데 조건을 만족하는 새 줄이 결과에
 * 끼는** 장면, 그리고 줄 잠금이 없는 줄을 잠글 수 없다는 이유를 쥔다. 그래서 definition 은 insert · matches the condition ·
 * extra row · range lock 을 독점하고, same row twice · committed value 는 쓰지 않는다.
 *
 * 전제 (설명 글 `phantomRead.md`): ANSI SQL-92 잠금 기반 REPEATABLE READ(줄마다 S 를 커밋까지, 범위는 잠그지 않음). PostgreSQL 은
 * 스냅샷으로 줄 셋을 그대로 보고, InnoDB 는 잠그는 읽기에서 틈 잠금으로 막는다. SQL 은 그대로 쓴 표기. 값은 예.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const phantomReadConcept: FacetConceptSource = {
  id: 'phantomRead',
  label: 'Phantom Read (A New Row Joins a Repeated Query)',
  canonicalFacet: 'facet:phantomRead',

  surface: {
    definition:
      'Locks on the rows a query returned cannot stop another transaction from inserting a new row that satisfies the same WHERE condition, so repeating the query yields an extra row; blocking it needs a range lock.',
    exemplarKeywords: [
      'phantom read',
      'phantom rows',
      'REPEATABLE READ allows phantoms',
      'predicate lock',
      'range lock',
      'gap lock',
      'next-key lock',
      'INSERT during a range query',
      'repeated SELECT returns more rows',
    ],
  },

  briefing: {
    observable: [
      'Table `orders(id, amount)` starts with five rows: (1, 80) · (2, 120) · (3, 45) · (4, 200) · (5, 150). Two result panes, Query 1 and Query 2, stand beside it. The start reads "Isolation of T1: REPEATABLE READ. No statement has run yet."',
      'T1 runs `SELECT id, amount FROM orders WHERE amount >= 100;`: "Query 1 of T1. Rows returned: 3. New S locks on id: 2, 4, 5." Each of the three rows carries an "S T1" tag.',
      'T2 runs `INSERT INTO orders VALUES (6, 130);`: "T2 inserts id 6. X lock on the new row: granted without waiting." with the note "The new row meets the query condition." Then (7, 60) goes in the same way, noted as not meeting the condition.',
      '"T2 commits. X locks released: 2."',
      'T1 runs the same SELECT again: "Query 2 of T1. Rows returned: 4. New S locks on id: 6." The three first rows are unchanged; row 6 has joined the result, and row 7 sits only in the table.',
      'REPEATABLE READ follows the ANSI SQL-92 lock-based meaning: an S lock on each returned row until commit, no range lock. PostgreSQL\'s REPEATABLE READ would return the same three rows from a snapshot, and InnoDB blocks the insert with gap locks on locking reads. The SQL is written as is; rows and values are chosen for the example. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays the five steps by itself and stops after the second query.',
        'A Replay button and a playback strip sit below it. Holding the first insert shows row 6 entering the table with no wait while the three S tags stay in place.',
      ],
    },

    useWhen: [
      'The article explains why REPEATABLE READ in the standard still permits phantoms, and needs the reason spelled out: a lock can only be put on a row that already exists.',
      'A reader asks what gap locks, next-key locks or predicate locks are for; the unguarded insert that lands inside the query\'s condition is the problem they solve.',
    ],

    avoidWhen: [
      'The article is about an existing row changing value between reads. The rows returned the first time never change.',
      'The subject is PostgreSQL\'s REPEATABLE READ; it would not show the extra row.',
      'The point is aggregate results drifting, such as a SUM changing. The screen compares row sets, not totals.',
    ],

    contrastWith: [
      {
        concept: 'nonRepeatableRead',
        note: 'A non-repeatable read is a known row changing value; a phantom is membership changing, a row that did not exist entering the set a condition describes.',
      },
      {
        concept: 'sharedVsExclusive',
        note: 'Shared and exclusive locks decide conflicts between requests on the same row; a phantom slips through because the inserted row had no lock to conflict with.',
      },
      {
        concept: 'isolation',
        note: 'Phantoms are the last anomaly to fall; only the level that locks the condition\'s range removes them.',
      },
    ],
  },
};
