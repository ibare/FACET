/**
 * dml 개념 선언.
 *
 * canonical facet 은 `facet:dml` — `plant` 표(fern 6 · moss 1 · ivy 7 · palm 3)에 같은 문 셋
 * `INSERT (5, 'cactus', 2)` · `UPDATE … SET water = water + 7 WHERE water < 4` · `DELETE … WHERE water > 7` 을
 * 손잡이 "문 차례"(IUD · IDU · UID · UDI · DIU · DUI)가 고른 차례로 건다. 끝 줄 수가 2 · 3 · 5 로 갈린다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * 조각 `insertUpdateDelete` 는 세 문이 표에 하는 일이 저마다 다르다는 한 장면(줄을 들임 · 칸을 고침 · 줄을 뺌),
 * `schemaDefinesShape` 는 스키마가 줄을 거절하는 장면이다. 이쪽은 **차례를 돌리는 것**을 쥔다 — 같은 문 셋이
 * 차례에 따라 다른 끝 표를 낸다. 그래서 definition 은 order · six orders · final tables · earlier statements 를
 * 쥐고, 조각이 독점한 adds a row · in place · row count · rejected · type 을 쓰지 않는다.
 *
 * 전제 (설명 글 `dml.md`): 표와 값은 예로 정한 것 · SQL 은 그대로 쓴 표기 · 줄은 id 차례로 보이고 새 줄은 끝에 ·
 * UPDATE 는 고치기 전 값으로 셈해 한꺼번에 적용 · 비교는 엄격 · 넣는 줄은 늘 스키마에 맞는다.
 * 코드 패널은 IR → 여섯 언어로, 문 셋을 차례대로 셈하는 반복이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const dmlConcept: FacetConceptSource = {
  id: 'dml',
  label: 'DML Statement Order (Same Statements, Different Final Table)',
  canonicalFacet: 'facet:dml',

  surface: {
    definition:
      'Running the same INSERT, UPDATE and DELETE in each of six orders leaves different final tables, because every WHERE clause evaluates the table exactly as the earlier statements left it.',
    exemplarKeywords: [
      'DML',
      'data manipulation language',
      'order of SQL statements matters',
      'statement order changes the result',
      'WHERE sees earlier changes',
      'affected rows count',
      'sequence of writes in a script',
      'migration script ordering',
      'UPDATE then DELETE',
      'rows affected: 0',
    ],
  },

  briefing: {
    observable: [
      'The schema `CREATE TABLE plant (id INT NOT NULL, name VARCHAR(8) NOT NULL, water INT)` and four starting rows — 1 fern 6, 2 moss 1, 3 ivy 7, 4 palm 3 — sit beside three statement cards: `INSERT INTO plant VALUES (5, \'cactus\', 2);`, `UPDATE plant SET water = water + 7 WHERE water < 4;`, `DELETE FROM plant WHERE water > 7;`.',
      'A round is four steps: the starting table, then one statement per step. For UPDATE and DELETE the matching rows are first highlighted by their water cell, then changed or removed together; for INSERT the new row slides in at the end. The caption reads like "Statement 2 UPDATE · rows its WHERE checked: 5 · affected rows: 3 · rows now: 5".',
      'In the default order IUD, cactus arrives with water 2, so UPDATE raises three rows (moss 1 → 8, palm 3 → 10, cactus 2 → 9) and DELETE then removes all three; the table ends with 2 rows, fern 6 and ivy 7.',
      'Two positions decide the outcome: whether INSERT comes before UPDATE (cactus ends as 9 or stays 2) and whether DELETE comes after UPDATE (the raised rows are deleted, or DELETE finds nothing above 7 and reports 0 affected rows). Final row counts: IUD 2, UID and UDI 3, IDU, DIU and DUI 5.',
      'fern 6 and ivy 7 survive every order; ivy sits exactly on the `water > 7` boundary and the comparison is strict.',
      'Rows are shown in id order with new rows at the end; SQL does not promise any row order without ORDER BY. UPDATE computes `water + 7` from the value before the change and applies it to all matching rows at once. The inserted row always fits the schema. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: "Statement order", six positions IUD, IDU, UID, UDI, DIU, DUI (starting at IUD), letters read left to right. Turning it slides the statement cards into the new order, resets the table to its four starting rows and plays the round again.',
        'The move that makes the idea land is going from IUD to DIU: the same three statements, and the table ends with 5 rows instead of 2 because DELETE runs while nothing is yet above 7.',
        'Readouts under the controls: Rows in table, Updated rows and Deleted rows.',
        'The code panel, labelled "Applying the statements in order", starts empty with a "+ Add language" button; it shows a loop that applies the three statements in the chosen order to two lists (water and alive) and counts affected rows, in Python, JavaScript, TypeScript, Java, C++ or C#. It is not SQL.',
      ],
    },

    useWhen: [
      'The article warns that a batch of writes is not a set of independent changes — a later WHERE is evaluated against rows an earlier statement inserted or altered — and wants the six orders of one fixed trio to prove it.',
      'A reader is surprised that a DELETE reporting 0 affected rows succeeded, and the article needs the case where that 0 comes purely from running before the UPDATE that would have given it something to match.',
    ],

    avoidWhen: [
      'The article is about concurrent sessions, transactions or isolation levels. Everything here runs in one sequence with no second writer.',
      'The subject is SQL syntax for DML itself or the options of each statement (RETURNING, UPSERT, multi-row inserts). Only three fixed statements appear.',
      'The point is constraint violations or rejected inserts. Every row inserted here fits the schema.',
    ],

    contrastWith: [
      {
        concept: 'insertUpdateDelete',
        note: 'What each statement kind does to a table — a row in, cells rewritten, a row out — is a fixed fact about the statement; that the same three statements give different tables in different orders is a fact about sequencing them.',
      },
      {
        concept: 'schemaDefinesShape',
        note: 'The schema decides whether a statement is allowed to change the table at all; statement order is about what the permitted changes add up to.',
      },
      {
        concept: 'lostUpdate',
        note: 'A lost update needs two concurrent writers whose reads and writes interleave. Order dependence among DML statements appears with a single writer, because each statement reads what the previous one wrote.',
      },
    ],
  },
};
