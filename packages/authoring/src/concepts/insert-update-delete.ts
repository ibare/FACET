/**
 * insertUpdateDelete 개념 선언.
 *
 * canonical facet 은 `facet:insertUpdateDelete` — 표 `stock`(1 pen 12 · 2 ink 3 · 3 pad 0 · 4 clip 7)에 문 셋이 위에서부터
 * 하나씩 돈다. INSERT 는 `5 tape 4` 를 끝에 들이고, UPDATE 는 `qty < 5` 인 세 줄의 칸만 `qty + 10` 으로 고치고, DELETE 는
 * `qty > 12` 인 두 줄을 뺀다. 줄 수 4 → 5 → 5 → 3. 걸음 여섯, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `dml` 은 같은 문 셋의 차례를 돌려 끝 표가 갈리는 것을 본다. 이쪽은 차례를 돌리지 않는다 — 주장은
 * **세 문이 표에 하는 일이 서로 다르다**(줄이 들어옴 · 칸 값만 바뀜 · 줄이 빠짐)와, UPDATE · DELETE 가 걸린 줄을
 * 먼저 모두 정하고 한꺼번에 적용한다는 것이다. 그래서 definition 은 adds a row · in place · removes · row count ·
 * all matches first 를 쥐고, 완제품이 쥔 order · six · final tables 를 쓰지 않는다.
 *
 * 전제 (설명 글 `insertUpdateDelete.md`): 표와 값은 예로 정한 것 · SQL 은 그대로 쓴 표기 · 새 줄은 끝에 붙여 보였다
 * (ORDER BY 없이 줄 차례는 약속되지 않는다) · 비교는 엄격.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const insertUpdateDeleteConcept: FacetConceptSource = {
  id: 'insertUpdateDelete',
  label: 'INSERT Adds, UPDATE Rewrites, DELETE Removes',
  canonicalFacet: 'facet:insertUpdateDelete',

  surface: {
    definition:
      'INSERT adds a whole row, UPDATE rewrites cell values of matching rows in place, and DELETE removes matching rows; only INSERT and DELETE change the row count, and matches are all decided before any change.',
    exemplarKeywords: [
      'INSERT UPDATE DELETE',
      'CRUD operations in SQL',
      'what UPDATE does to a row',
      'UPDATE with WHERE clause',
      'DELETE with WHERE clause',
      'rows affected',
      'UPDATE matching no rows',
      'set-based update',
      'SQL basics for modifying data',
    ],
  },

  briefing: {
    observable: [
      'The table `stock` starts with four rows: 1 pen 12, 2 ink 3, 3 pad 0, 4 clip 7. Three statements run one at a time from the top: `INSERT INTO stock VALUES (5, \'tape\', 4);`, an UPDATE setting `qty = qty + 10 WHERE qty < 5`, and a DELETE `WHERE qty > 12`.',
      'INSERT: "a new row comes into the table, at the end. Affected rows: 1." The table has 5 rows.',
      'UPDATE first checks every row: "Before anything changes, WHERE is checked on every row. Matching rows: 3 / 5." — ink 3, pad 0 and the just-inserted tape 4. Then only the qty cells of those rows change, all at once (3 → 13, 0 → 10, 4 → 14); the rows stay in place and the table still has 5 rows.',
      'DELETE checks again: ink 13 and tape 14 match `qty > 12`; pen 12 does not, because the comparison is strict. Both matching rows leave at once and the rest close the gap. Affected rows: 2.',
      'Row count goes 4 → 5 → 5 → 3, ending with 1 pen 12, 3 pad 10, 4 clip 7. A Rows readout and an Affected rows readout follow each statement.',
      'New rows are shown at the end; without ORDER BY a table promises no row order, and a real database may place rows anywhere. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays six steps by itself — the starting table, the INSERT, the UPDATE check, the UPDATE, the DELETE check, the DELETE — and stops.',
        'A Replay button and a playback strip sit below it. Holding the UPDATE step shows three cells changing while every row keeps its place and the row count stays at 5.',
      ],
    },

    useWhen: [
      'The article introduces the three data-changing statements and needs to show that they act on different units: a row enters, cells change inside rows that stay, a row leaves.',
      'A reader imagines UPDATE and DELETE work row by row, each change affecting the next test; the check-every-row-first step, followed by a single simultaneous change, corrects that picture.',
    ],

    avoidWhen: [
      'The article is about what happens when the same statements run in a different order. The order here is fixed.',
      'The subject is constraints rejecting a row, or transactions and rollback. Every statement here succeeds.',
      'The point is UPSERT, MERGE or bulk loading. Only single INSERT, UPDATE and DELETE statements appear.',
    ],

    contrastWith: [
      {
        concept: 'dml',
        note: 'Each statement kind has a fixed effect on a table; the order in which several of them run is a separate question, because every later WHERE sees what earlier statements did.',
      },
      {
        concept: 'schemaDefinesShape',
        note: 'Changing rows presumes the change is accepted; the schema is what decides whether an inserted row is allowed in at all.',
      },
      {
        concept: 'filterKeepSome',
        note: 'Filtering a list returns the survivors and leaves the source alone; DELETE applies the same kind of test to a stored table and removes the matches from it for good.',
      },
    ],
  },
};
