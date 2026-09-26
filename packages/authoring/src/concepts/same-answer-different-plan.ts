/**
 * sameAnswerDifferentPlan 개념 선언.
 *
 * canonical facet 은 `facet:sameAnswerDifferentPlan` — `SELECT o.id, c.name FROM orders o JOIN customers c ON o.cust_id = c.id
 * WHERE c.city = 'Busan'` 하나를 두 길로 푼다. 잇고 나서 거르기(조인 검사 32 + 거르기 8 = 40) · 거르고 나서 잇기(거르기 4 +
 * 조인 16 = 20). 끝에서 두 답 `(102, Ben)` · `(104, Ben)` · `(106, Dev)` 가 하나씩 포개진다. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `optimizer` 는 싼 조인 차례가 뒤집히는 자리를 쥐고, 형제 `reorderJoins` 는 어느 두 표부터 잇느냐, `planIsATree` 는
 * 한 계획 안의 줄의 흐름을 쥔다. 이쪽은 **거르기를 조인 앞으로 옮겨도 답은 한 줄도 다르지 않다 — 달라지는 것은 일의 양뿐** 을
 * 쥔다. 주장의 머리는 "답이 같다" 이고 어느 길이 나은지는 고르지 않는다. 그래서 definition 은 equivalent · filter before or after a
 * join · identical rows · predicate checks 를 독점하고, 중간 결과 · 조인 차례 · 고른다 는 쓰지 않는다.
 *
 * 전제 (설명 글 `sameAnswerDifferentPlan.md`): 예로 정한 작은 자료 · 중첩 반복 조인(바깥 `orders`) · 일의 단위는 조건 검사 한 번 ·
 * 결과 줄은 주문 차례로 보인다(집합에는 순서가 없다) · SQL 은 그대로 쓴 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const sameAnswerDifferentPlanConcept: FacetConceptSource = {
  id: 'sameAnswerDifferentPlan',
  label: 'Equivalent Plans: Filter Before or After the Join',
  canonicalFacet: 'facet:sameAnswerDifferentPlan',

  surface: {
    definition:
      'One SQL query can be run by equivalent plans, such as filtering before or after a join; the result rows are identical while the number of predicate checks each plan performs differs.',
    exemplarKeywords: [
      'equivalent execution plans',
      'predicate pushdown',
      'filter before join',
      'relational algebra equivalence',
      'selection pushdown',
      'SQL is declarative',
      'query rewrite',
      'WHERE applied before or after JOIN',
      'same result different plan',
    ],
  },

  briefing: {
    observable: [
      'The SQL `SELECT o.id, c.name FROM orders o JOIN customers c ON o.cust_id = c.id WHERE c.city = \'Busan\'` sits at the top: "One SQL statement splits into two plans." Two lanes run below it, "Join, then filter" and "Filter, then join", over `orders` (eight rows) and `customers` (four rows: Ana Seoul, Ben Busan, Cho Daegu, Dev Busan).',
      'Join, then filter: "Join, then filter — join. Checks: 32 · Rows out: 8", then "Join, then filter — filter. Checks: 8 · Rows kept: 3". Total checks 40.',
      'Filter, then join: "Filter, then join — filter. Checks: 4 · Rows kept: 2" (Ben and Dev), then "Filter, then join — join. Checks: 16 · Rows out: 3". Total checks 20.',
      'At the end the answer rows of the two lanes slide onto each other one by one: `(102, Ben)`, `(104, Ben)`, `(106, Dev)` — "Answer rows laid on each other: 3 / 3". Only the check totals, 40 and 20, fail to line up.',
      'The data is a small invented example, not a real database\'s plan. Joins are nested loops with `orders` outside, one check per pair; filtering is one check per row; the answer rows appear in order of `orders` though a result set has no order. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays both lanes by itself and stops when the answers have been laid over each other.',
        'A Replay button and a playback strip sit below it. Holding the final step shows the three answer rows coinciding while the two "Total checks" figures stay apart.',
      ],
    },

    useWhen: [
      'The article explains that SQL says what to return, not how, and needs proof that moving a filter across a join leaves the answer untouched.',
      'A reader worries that a database rewriting their query could change its meaning; the identical rows from two differently ordered plans address it.',
    ],

    avoidWhen: [
      'The article is about how the optimizer chooses between plans or estimates their cost. Neither plan is chosen here.',
      'The subject is joining three or more tables in different orders. There are two tables and one join.',
      'The point is outer joins, where moving a filter can change the result. The join here is an inner join.',
    ],

    contrastWith: [
      {
        concept: 'optimizer',
        note: 'Equivalence says any of these plans is allowed; the optimizer is what decides which one to run, and its decision can change with the data.',
      },
      {
        concept: 'reorderJoins',
        note: 'Both hold the answer fixed while the work changes. Here the move is where a filter sits relative to a join; there it is which pair of tables is joined first.',
      },
      {
        concept: 'planIsATree',
        note: 'Two plans giving one answer is a claim across plans; how rows move through the operators of a single plan is a claim inside one.',
      },
    ],
  },
};
