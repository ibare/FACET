/**
 * schemaDefinesShape 개념 선언.
 *
 * canonical facet 은 `facet:schemaDefinesShape` — 빈 표 `member (id INT NOT NULL, name VARCHAR(8) NOT NULL, age INT)` 에
 * INSERT 다섯이 차례로 들어오려 한다. `(1, 'Ann', 30)` 들어감 · `(2, 'Bo', 'ten')` 형 · `(3, NULL, 25)` NOT NULL ·
 * `(4, 'Maximilian', 40)` 길이로 거절 · `(5, 'Cy', NULL)` 들어감. 둘 들어가고 셋 거절. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `dml` 과 조각 `insertUpdateDelete` 는 받아들여진 문이 표를 어떻게 바꾸는지를 말한다. 이쪽은 **문이 받아들여지기
 * 전의 관문** — 줄보다 먼저 정해진 모양(형 · 길이 · NOT NULL)과, 한 칸만 어긋나도 줄 전체가 거절된다는 것 — 을 쥔다.
 * 그래서 definition 은 CREATE TABLE · type · length · NOT NULL · rejected whole 을 독점한다.
 *
 * 전제 (설명 글 `schemaDefinesShape.md`): 엄격 모형 — 표준 SQL · PostgreSQL 처럼 문 전체를 거절한다. SQLite 는 형을 강제하지
 * 않고 MySQL 은 설정에 따라 잘라 넣고 경고만 남기기도 한다. 열 차례로 맞춰 처음 어긋난 칸에서 멈춘다. 기본키 · 중복 검사는
 * 두지 않았다. 표와 값은 예로 정한 것 · SQL 은 그대로 쓴 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const schemaDefinesShapeConcept: FacetConceptSource = {
  id: 'schemaDefinesShape',
  label: 'A Schema Rejects Rows That Do Not Fit',
  canonicalFacet: 'facet:schemaDefinesShape',

  surface: {
    definition:
      'CREATE TABLE fixes each column\'s type, maximum length and NOT NULL rule before any row exists; an INSERT with even one value breaking them is rejected whole and leaves the table unchanged.',
    exemplarKeywords: [
      'CREATE TABLE',
      'DDL',
      'table schema',
      'column data types',
      'NOT NULL constraint',
      'VARCHAR length limit',
      'value too long for type character varying',
      'invalid input syntax for type integer',
      'schema-on-write',
      'strict typing SQLite vs PostgreSQL',
    ],
  },

  briefing: {
    observable: [
      'The table `member` starts empty with three columns shown as a schema: `id INT NOT NULL`, `name VARCHAR(8) NOT NULL`, `age INT` ("The table is empty. Columns: 3").',
      'Five INSERT statements try to enter in turn, and their values are matched to the columns from left to right.',
      '`(1, \'Ann\', 30)`: "Every value fits its column, so the row goes in." `(2, \'Bo\', \'ten\')`: the age cell breaks INT and the whole row is marked Rejected. `(3, NULL, 25)`: the name cell breaks NOT NULL. `(4, \'Maximilian\', 40)`: "Characters: 10 · Limit: 8", rejected.',
      '`(5, \'Cy\', NULL)` goes in: "Columns without NOT NULL: age. NULL fits there." The same NULL that was refused for name is accepted for age.',
      'The tally ends "Tried: 5 · Inserted: 2 · Rejected: 3" and the table holds only 1 Ann 30 and 5 Cy NULL. A rejected row leaves nothing behind — the id and age of `(3, NULL, 25)` fit, but they do not enter on their own.',
      'This follows the strict model of standard SQL and PostgreSQL. SQLite does not enforce column types and would store \'ten\'; MySQL, depending on its mode, may truncate or convert values with a warning. Checking stops at the first misfit, column by column. Primary keys and duplicate checks are not part of the example. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays six steps by itself — the empty table, then one INSERT per step — and stops.',
        'A Replay button and a playback strip sit below it. Holding the third or fifth step puts the two NULL cases side by side: refused under NOT NULL, accepted without it.',
      ],
    },

    useWhen: [
      'The article explains that a relational table has a declared shape before it has data, and that the database enforces it on every insert rather than trusting the application.',
      'A reader thinks a bad value in one column only loses that cell; the rejected `(3, NULL, 25)`, whose other two values fit, shows the whole row is refused.',
    ],

    avoidWhen: [
      'The article is about schema migrations, ALTER TABLE or evolving a schema over time. The schema here never changes.',
      'The subject is uniqueness, primary key or foreign key violations. None of those checks are made.',
      'The point is lenient databases that coerce values. The model here rejects instead of converting.',
    ],

    contrastWith: [
      {
        concept: 'insertUpdateDelete',
        note: 'The data-changing statements describe what an accepted statement does to rows; the schema is the check that decides whether a row is accepted at all.',
      },
      {
        concept: 'primaryKeyIdentifies',
        note: 'Type, length and NOT NULL judge one row on its own; a primary key judges a row against the others already stored, refusing a duplicate identity.',
      },
      {
        concept: 'nestedDocument',
        note: 'A table fixes its columns before data arrives and refuses rows that differ; a document store lets each record carry its own structure, so shape is checked, if at all, when the data is read.',
      },
      {
        concept: 'relationalTablesAndKeys',
        note: 'Tables and keys describe how rows are identified and linked; a schema\'s column types and constraints describe what a single row may contain.',
      },
    ],
  },
};
