/**
 * dirtyRead 개념 선언.
 *
 * canonical facet 은 `facet:dirtyRead` — 줄 `pen` 의 확정값 5. `W1(pen=0)` 이 확정값 곁에 점선으로 얹히고, READ UNCOMMITTED 인
 * T2 가 `R2(pen)` 으로 0 을 손에 쥔다. `A1` 이 0 을 거둬 5 가 다시 드러나도 T2 의 0 은 남아 빨갛게 바뀌고, `C2` 에서 읽은 값 0 ≠
 * 확정값 5. "확정 내력" 은 끝까지 5 하나. 네 걸음, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `isolation` 은 수준을 올리며 이상 셋을 차례로 끈다. 형제 조각 `nonRepeatableRead` 는 **확정된** 두 값이 갈리는 일,
 * `phantomRead` 는 새 줄이 끼는 일이다. 이쪽은 **한 번도 확정된 적 없는 값이 남의 손에 남는** 장면을 쥔다. 그래서 definition 은
 * uncommitted · rolls back · never existed · acts on 을 독점하고, twice · same row · new row · level 비교를 쓰지 않는다.
 *
 * 전제 (설명 글 `dirtyRead.md`): ANSI SQL-92 잠금 기반 뜻. PostgreSQL 은 READ UNCOMMITTED 를 받아도 READ COMMITTED 처럼 움직여
 * 더티 리드가 없다. 줄 · 값 · 차례는 예로 정한 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const dirtyReadConcept: FacetConceptSource = {
  id: 'dirtyRead',
  label: 'Dirty Read (Reading a Write That Is Later Rolled Back)',
  canonicalFacet: 'facet:dirtyRead',

  surface: {
    definition:
      'A dirty read happens when a transaction reads another\'s uncommitted write; if the writer then aborts, the reader still holds and may act on a value the database never committed.',
    exemplarKeywords: [
      'dirty read',
      'READ UNCOMMITTED',
      'reading uncommitted data',
      'uncommitted dependency',
      'aborted transaction value leaked',
      'NOLOCK hint',
      'phantom out-of-stock',
      'cascading abort',
      'isolation anomaly',
    ],
  },

  briefing: {
    observable: [
      'A table row `pen` shows its committed value 5; T1 sits on the left and T2, marked READ UNCOMMITTED with a "value read" slot, on the right. Below the table, "Committed so far for pen: 5" keeps the history of committed values.',
      '"T1 writes pen = 0. Not committed yet. Committed value: 5." The 0 rests on the row as a dashed "uncommitted" value beside the committed 5.',
      '"T2 reads pen: 0. Written by T1, not committed yet." A copy of the 0 travels into T2\'s hand while the original stays with T1.',
      '"T1 aborts and its write is thrown away. Committed value of pen: 5. Still in the hand of T2: 0." The dashed 0 is withdrawn from the row, and T2\'s copy turns red because its writer is gone.',
      '"T2 commits. Value it read: 0. Committed value of pen: 5." A ≠ is drawn between the two. The committed history still reads only 5 — the 0 T2 acted on was never committed.',
      'The isolation level follows the ANSI SQL-92 lock-based meaning; PostgreSQL treats READ UNCOMMITTED as READ COMMITTED, so this cannot happen there. The row, values and order are chosen for the example. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays the four operations by itself and stops after T2 commits.',
        'A Replay button and a playback strip sit below it. Holding the abort step shows the row back at 5 while T2 still holds 0.',
      ],
    },

    useWhen: [
      'The article defines the dirty read and needs the moment where the source of a value disappears while the copy lives on in another transaction.',
      'A reader thinks reading uncommitted data is harmless because the writer "will probably commit"; a decision based on a stock level that was never real makes the risk concrete.',
    ],

    avoidWhen: [
      'The article is about values changing between two reads of committed data. Here only one read happens and the value it sees is never committed.',
      'The subject is how a higher isolation level prevents the anomaly. Only READ UNCOMMITTED is shown.',
      'The point is PostgreSQL behaviour specifically; it never produces dirty reads.',
    ],

    contrastWith: [
      {
        concept: 'nonRepeatableRead',
        note: 'Both see another transaction\'s write, but a non-repeatable read only ever sees committed values; a dirty read sees one that is later withdrawn.',
      },
      {
        concept: 'isolation',
        note: 'The dirty read is the weakest anomaly; READ COMMITTED is the first level that rules it out, at the cost of a reader waiting on a writer\'s lock.',
      },
      {
        concept: 'allOrNothing',
        note: 'A rollback cleans up the aborting transaction\'s own changes; it cannot recall a value another transaction has already read.',
      },
    ],
  },
};
