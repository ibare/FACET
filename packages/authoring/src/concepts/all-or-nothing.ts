/**
 * allOrNothing 개념 선언.
 *
 * canonical facet 은 `facet:allOrNothing` — Ann 이 펜 셋을 산다. 네 줄 트랜잭션에서 두 UPDATE 가 성공해 ann 100 → 70 ·
 * shop 20 → 50 이 되고 옛 값이 되돌림 기록 1 · 2 번 칸에 쌓인다. 셋째 UPDATE 가 `CHECK (qty >= 0)` 에 튕겨 나고(pen 2 그대로),
 * `COMMIT` 은 실행되지 않는다. 엔진이 2 번 칸 · 1 번 칸 차례로 되감아 세 줄이 처음 값에 선다. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `acid` 는 OK 를 주는 때와 끊김을 견준다. 이쪽은 **끊김 없이, 문장 하나의 실패가 앞 문장들을 되돌리는 장면**만
 * 쥔다. 그래서 definition 은 statement fails · constraint · undo log · reverse order · earlier updates 를 독점하고,
 * 형제가 쥔 acknowledge · flush · crash · redo 를 쓰지 않는다.
 *
 * 전제 (설명 글 `allOrNothing.md`): 문장 하나는 줄 하나의 값 하나만 바꾼다(문장 안의 원자성은 들여다보지 않는다). 엔진이 곧바로
 * 되돌리는 것으로 그렸다 — 응용이 ROLLBACK 을 보내야 하는 엔진도 있다. 되돌림 기록은 메모리 목록으로만. SQL 은 그대로 쓴 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const allOrNothingConcept: FacetConceptSource = {
  id: 'allOrNothing',
  label: 'A Failed Statement Rolls Back the Whole Transaction',
  canonicalFacet: 'facet:allOrNothing',

  surface: {
    definition:
      'When one statement inside a transaction fails a constraint, the engine restores the old values of the earlier successful updates from its undo log, newest first, so the transaction leaves no partial change behind.',
    exemplarKeywords: [
      'atomicity',
      'transaction rollback',
      'ROLLBACK',
      'undo log',
      'statement fails mid-transaction',
      'CHECK constraint violation',
      'partial update',
      'money transfer example',
      'BEGIN COMMIT',
      'all or nothing',
    ],
  },

  briefing: {
    observable: [
      'Two tables sit beside the SQL: `accounts(id, balance)` with `CHECK (balance >= 0)` holding \'ann\' 100 and \'shop\' 20, and `stock(item, qty)` with `CHECK (qty >= 0)` holding \'pen\' 2. The transaction is `BEGIN;`, three UPDATE statements and `COMMIT;`.',
      'The first UPDATE is marked "done": ann goes 100 → 70 and the old value 100 goes into slot 1 of the undo log. The second is "done": shop goes 20 → 50 and 20 goes into slot 2.',
      'The third UPDATE, `qty = qty - 3` on pen, is marked "rejected": 2 − 3 would be −1 and the CHECK refuses it before anything is written, so pen stays 2 and no undo slot is added. `COMMIT;` is marked "not run".',
      'The undo log is then replayed from its last slot: slot 2 puts shop back from 50 to 20, then slot 1 puts ann back from 70 to 100. All three rows end at their starting values.',
      'Stopped just after the rejection, the tables would read ann 70 · shop 50 · pen 2 — the money moved but no pens left stock. The balances add up to 120 either way; what the rollback protects is the pairing of payment and goods, not the sum.',
      'Each statement changes one value in one row; the engine rolls back on its own as soon as the statement fails, and the undo log is shown only as a list in memory. The SQL is written as is. Values are chosen for the example. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays the five steps by itself and stops once both undo slots are replayed.',
        'A Replay button and a playback strip sit below it. Holding the rejection step shows the half-done state — money moved, pen untouched — just before the unwinding starts.',
      ],
    },

    useWhen: [
      'The article introduces transactions with a transfer example and has to show that a failure in the last statement reaches back and cancels statements that had already succeeded.',
      'A reader asks how a database can undo work it already did, and the answer to show is the list of old values replayed newest-first.',
    ],

    avoidWhen: [
      'The article is about crash recovery or whether committed data survives power loss. Nothing crashes here and the transaction never commits.',
      'The subject is concurrent transactions or isolation anomalies. Only one transaction runs.',
      'The point is savepoints or partial rollback to a named point. The whole transaction is undone.',
    ],

    contrastWith: [
      {
        concept: 'acid',
        note: 'Rolling back after a failed statement is atomicity inside a running transaction; the broader ACID question is what a crash does to transactions that were already answered.',
      },
      {
        concept: 'durableAfterCommit',
        note: 'Undo removes the effects of a transaction that did not finish; redo reinstates the effects of one that did. The two logs answer opposite questions.',
      },
      {
        concept: 'dirtyRead',
        note: 'A rollback makes the aborted writes vanish from the table; a dirty read is what happens when another transaction saw those writes before they vanished.',
      },
    ],
  },
};
