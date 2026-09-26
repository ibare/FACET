/**
 * rowIsAFact 개념 선언.
 *
 * canonical facet 은 `facet:rowIsAFact` — 표 `lives_in`(person · city) 세 줄(Ari Oslo · Deo Lima · Ena Oslo). 머리가
 * 빈칸 둘 달린 문장 틀("lives in")이 되고, 줄마다 값이 빈칸으로 올라가 참인 문장이 된다(사실 3). 물음 둘 —
 * (Deo, Lima) 맞는 줄 1 → 참, (Deo, Oslo) 맞는 줄 0 → 거짓(값은 따로 있지만 그 짝의 줄이 없다). 걸음 여섯,
 * 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `relationalTablesAndKeys` 는 키와 두 표의 짜임을 보인다. 이쪽은 **줄 하나의 뜻** — 명제 하나, 없는 줄은 거짓 —
 * 을 쥔다. 형제 `setOfRows` 는 줄들의 모음(차례 · 겹침)을 말한다. 그래서 definition 은 proposition · true · false ·
 * closed-world 를 독점하고, order · duplicate · key 를 쓰지 않는다.
 *
 * 전제 (설명 글 `rowIsAFact.md`): 닫힌 세계 가정 — 표에 없는 줄을 "모른다" 가 아니라 거짓으로 읽는 것은 약속이다.
 * 화면은 이 전제를 각주로 달지 않는다. 문장 틀은 문안이고 값은 예로 정한 것. 코드 글자는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const rowIsAFactConcept: FacetConceptSource = {
  id: 'rowIsAFact',
  label: 'A Row States One Fact (Closed-World Reading)',
  canonicalFacet: 'facet:rowIsAFact',

  surface: {
    definition:
      'Each row fills the blanks of a sentence formed by the table heading and asserts one true proposition; a question is true exactly when some row pairs its values, and false when none does, under the closed-world assumption.',
    exemplarKeywords: [
      'tuple',
      'relation as predicate',
      'row as a proposition',
      'closed world assumption',
      'absence of a row means false',
      'meaning of a table row',
      'relational model semantics',
      'facts in a database',
      'predicate logic and databases',
    ],
  },

  briefing: {
    observable: [
      'Table `lives_in` with columns `person` and `city` and three rows: Ari Oslo, Deo Lima, Ena Oslo. The caption reads "Table lives_in. Rows: 3".',
      'The heading rises into a sentence frame "person lives in city": "The heading becomes a sentence frame. Blanks: 2".',
      'Row by row the values lift into the blanks, each forming a sentence marked true: "Each row fills the blanks and becomes a true sentence. Facts: 1", then 2, then 3.',
      'The question (Deo, Lima) comes down to the table and finds its row: "A row pairs these values. Matching rows: 1 → true".',
      'The question (Deo, Oslo) finds none: "Each value exists, but no row pairs them. Matching rows: 0 → false". Both `Deo` and `Oslo` appear in the table, just never in the same row.',
      'Reading a missing row as false rather than unknown is the closed-world assumption, a convention the database adopts; the screen does not footnote it. The names and cities are made-up examples.',
    ],

    screen: {
      affordances: [
        'The screen plays its six steps by itself and stops on the false answer.',
        'A Replay button and a playback strip sit below it. Setting the two questions side by side shows that the same values can give true or false depending on whether one row holds them together.',
      ],
    },

    useWhen: [
      'The article introduces the relational model through its meaning rather than its layout: a table is a statement with blanks, and each row is one true instance of it.',
      'A reader needs to see why a query that finds no row is taken to answer "no", and that this rests on an assumption.',
      'The article stresses that facts live in whole rows: two values present in a table do not form a fact unless a single row joins them.',
    ],

    avoidWhen: [
      'The article is about NULL, unknown values or three-valued logic. Every cell here has a value and every answer is true or false.',
      'The subject is keys, uniqueness or references between tables. The table has no declared key and stands alone.',
      'The point is whether row order or repeated rows matter. That is not shown.',
    ],

    contrastWith: [
      {
        concept: 'setOfRows',
        note: 'That a row asserts one fact is a claim about a single row\'s meaning. That a relation is an unordered set with no repeats is a claim about the collection, and follows from it: stating a fact twice or in another order says nothing new.',
      },
      {
        concept: 'relationalTablesAndKeys',
        note: 'Keys and references organize rows across tables. Reading each row as a proposition is the prior step that says what those rows mean.',
      },
      {
        concept: 'updateAnomaly',
        note: 'If each row states a fact, storing one fact in several rows means saying it several times. The anomaly is what follows when only one of those statements is changed.',
      },
    ],
  },
};
