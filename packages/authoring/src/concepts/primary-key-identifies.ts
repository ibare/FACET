/**
 * primaryKeyIdentifies 개념 선언.
 *
 * canonical facet 은 `facet:primaryKeyIdentifies` — 표 `students`(student_id · name · city) 다섯 줄을 세 번 부른다.
 * `name = 'Kim'` → 2 줄(101 · 103), `city = 'Busan'` → 2 줄(102 · 103), `student_id = 103` → 1 줄. 부를 때마다 표는
 * 다섯 줄로 돌아온 뒤 걸러진다. 열마다 서로 다른 값 4/5 · 3/5 · 5/5. 걸음 넷, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `relationalTablesAndKeys` 는 두 표 사이에서 기본 키가 줄을 정하고 외래 키가 그것을 가리키는 짜임 전체를
 * 보인다. 이쪽은 **값을 조건으로 대어 부르면 무엇이 남는가** — 걸러져 하나가 남는 것 하나만 쥔다. 형제
 * `foreignKeyPoints` 는 다른 표에서 값으로 찾아가는 쪽이다. 그래서 definition 은 filter · condition · exactly one row ·
 * values never repeat 을 독점하고, 다른 표 · 가리킴 · 참조 · 격자를 쓰지 않는다.
 *
 * 전제 (설명 글 `primaryKeyIdentifies.md`): 조건은 SQL 비교식 그대로(`@notation native`) · 같음은 값 전체, 대소문자 구분 ·
 * 기본 키는 선언이고 조각은 선언이 지금 줄과 어긋나지 않는지만 확인한다(지금 안 겹치는 열이 곧 기본 키는 아니다) ·
 * 열 하나짜리 기본 키만 · 줄 차례에는 뜻이 없다 · 데이터는 예로 정한 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const primaryKeyIdentifiesConcept: FacetConceptSource = {
  id: 'primaryKeyIdentifies',
  label: 'Calling a Row by Its Primary Key Leaves One',
  canonicalFacet: 'facet:primaryKeyIdentifies',

  surface: {
    definition:
      'Selecting rows by a value filters out every row that differs; a column whose values can repeat leaves several survivors, and only a column declared never to repeat is guaranteed to leave exactly one.',
    exemplarKeywords: [
      'primary key',
      'unique identifier for a row',
      'uniqueness constraint',
      'why names make bad keys',
      'WHERE id = value returns one row',
      'duplicate names in a table',
      'select a single record',
      'natural key vs surrogate key',
      'student ID',
    ],
  },

  briefing: {
    observable: [
      'Table `students` with columns `student_id` (marked "primary key"), `name`, `city` and five rows: 101 Kim Seoul, 102 Lee Busan, 103 Kim Busan, 104 Park Seoul, 105 Choi Daegu. The caption reads "Table students — rows: 5."',
      'The first call `name = \'Kim\'` filters out the non-matching rows and leaves two, 101 and 103: "Called by name — rows left: 2. · Distinct values in name: 4 / 5."',
      'Before each call the removed rows return, so the table is back to five rows. `city = \'Busan\'` then leaves 102 and 103: "Called by city — rows left: 2. · Distinct values in city: 3 / 5."',
      '`student_id = 103` leaves only 103: "Called by student_id — rows left: 1. · Distinct values in student_id: 5 / 5." A "Calls" list keeps all three results, and row 103 appears in each — the name call and the city call each caught it with one other row.',
      'Conditions compare the whole value and are case-sensitive, and are written as SQL comparisons. The primary key is a declaration covering future rows too; a column that happens not to repeat now is not thereby a key, and the screen only checks that the declaration fits the current rows. Keys here are single columns, and row order carries no meaning. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays its four steps by itself and stops with all three calls listed.',
        'A Replay button and a playback strip sit below it. Stepping from the city call to the key call shows two survivors narrowing to one.',
      ],
    },

    useWhen: [
      'The article explains what a primary key is for in the plainest terms: asking for one row and getting exactly one back, where a name or a city returns more.',
      'A reader proposes using a person\'s name as an identifier; watching `Kim` return two rows makes the objection concrete.',
    ],

    avoidWhen: [
      'The article is about a second table referring to this one. There is only one table and no reference.',
      'The subject is composite keys or choosing among several candidate keys. The key here is one declared column.',
      'The point is how an index makes the lookup fast. Rows are filtered one by one with no index involved.',
    ],

    contrastWith: [
      {
        concept: 'relationalTablesAndKeys',
        note: 'The wider picture connects tables: a key defines each row and other tables refer to it. This claim stays inside one table and concerns only what a lookup by value returns.',
      },
      {
        concept: 'foreignKeyPoints',
        note: 'Uniqueness is what makes a key usable as a target. Following a stored value from another table to that target, and refusing a value with no target, is the next claim.',
      },
      {
        concept: 'determinantMustBeKey',
        note: 'Here a key shows itself by leaving one row when called. The dependency view establishes keys another way, by what a set of columns determines, without looking at a lookup.',
      },
      {
        concept: 'hashTableChaining',
        note: 'A hash key is an address used to find a slot; a primary key is an identity declared on the data. Both are called keys, but only the second promises one row per value.',
      },
    ],
  },
};
