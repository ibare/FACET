/**
 * updateAnomaly 개념 선언.
 *
 * canonical facet 은 `facet:updateAnomaly` — 표 `loans` 다섯 줄에 `Mina` 의 전화번호가 세 줄(L1 · L3 · L4)에 사본으로
 * 흩어져 있다. `UPDATE loans SET phone = '555-0199' WHERE loan_id = 'L3'` 이 한 줄에만 닿고, 옛 값이 두 사본에 남는다.
 * "Mina 의 phone" 을 물으면 답이 둘(555-0101 · 555-0199). 걸음 넷, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `normalForms` 는 단계를 올리며 사본 수가 줄어드는 전체를 센다. 이쪽은 **사본이 갈라지는 사건 하나**만 쥔다 —
 * 종속 · 떼어 내기 · 단계를 말하지 않는다. 그래서 definition 은 copies · old value · two different answers ·
 * UPDATE 를 독점하고, decompose · stage · dependency 를 쓰지 않는다.
 *
 * 전제 (설명 글 `updateAnomaly.md`): 표와 값은 예로 정한 것 · UPDATE 는 SQL 그대로(`@notation native`) ·
 * `WHERE member = 'Mina'` 로 고쳤으면 피했겠지만 그 책임이 쓰는 사람에게 남는다는 점은 그대로.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const updateAnomalyConcept: FacetConceptSource = {
  id: 'updateAnomaly',
  label: 'Update Anomaly (One Copy Changed, Two Answers)',
  canonicalFacet: 'facet:updateAnomaly',

  surface: {
    definition:
      'When the same fact is stored as copies in several rows, an UPDATE that reaches only one copy leaves the others holding the old value, and asking for that fact now returns two different answers.',
    exemplarKeywords: [
      'update anomaly',
      'data redundancy',
      'duplicated data gets out of sync',
      'inconsistent copies',
      'modification anomaly',
      'stale copy after update',
      'same value stored in many rows',
      'UPDATE with a narrow WHERE clause',
      'why duplicate data is dangerous',
    ],
  },

  briefing: {
    observable: [
      'Table `loans` with columns `loan_id`, `member`, `phone`, `book` and five rows. The caption starts "Table loans. Rows: 5." `Mina` borrows three times (L1, L3, L4) and `Joon` twice (L2, L5), and each loan row repeats the member\'s phone number.',
      'The copies step gathers Mina\'s three `phone` cells, all `555-0101`, to one question: "Copies of phone for Mina: 3."',
      'The statement `UPDATE loans SET phone = \'555-0199\' WHERE loan_id = \'L3\'` appears, and the new value lands only on row L3: "Rows changed: 1. Copies still holding the old value: 2."',
      'Asking for Mina\'s phone again, one point splits into two answers, `555-0101` (from L1 and L4) and `555-0199` (from L3): "Asking for phone of Mina. Distinct answers: 2." Joon\'s rows were never touched.',
      'The database reports no error — it changed exactly the row it was told to. The table and values are made-up examples, and the statement is written as SQL. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays its four steps by itself and stops on the two answers.',
        'A Replay button and a playback strip sit below it. Holding the update step shows one changed cell beside two unchanged copies of the same fact.',
      ],
    },

    useWhen: [
      'The article needs a concrete reason repeated data is a problem, beyond wasted space: a legal, successful UPDATE that leaves the table contradicting itself.',
      'A reader thinks the database would catch the mistake; the edit here succeeds without complaint and the contradiction only shows when the question is asked.',
    ],

    avoidWhen: [
      'The article explains which dependency causes the repetition or how to split the table. No dependency or decomposition appears here.',
      'The subject is insertion or deletion anomalies. Only an update is shown.',
      'The point is two transactions overwriting each other. There is one statement and no concurrency.',
    ],

    contrastWith: [
      {
        concept: 'normalForms',
        note: 'The anomaly is one inconsistent edit; normalization is the structural fix, storing the fact in as few rows as possible so an edit cannot miss a copy.',
      },
      {
        concept: 'lostUpdate',
        note: 'A lost update comes from two concurrent writers to one value, where one write vanishes. An update anomaly needs only one writer and loses no write; the fact simply exists in several places and only one of them was changed.',
      },
      {
        concept: 'partialDependency',
        note: 'A column fixed by part of a key is one reason a fact gets copied across rows. The anomaly is what those copies lead to, whatever put them there.',
      },
    ],
  },
};
