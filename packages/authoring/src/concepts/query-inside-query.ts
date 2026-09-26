/**
 * queryInsideQuery 개념 선언.
 *
 * canonical facet 은 `facet:queryInsideQuery` — 표 `students`(Ann 72 · Bo 85 · Cy 64 · Di 90 · Eve 78 · Fay 61)에
 * `WHERE score > (SELECT AVG(score) FROM students)` 를 건다. 안쪽이 한 번 돌아 75 가 되고, 75 가 괄호 자리에 들어앉고,
 * 그다음 바깥이 걸러 Bo · Di · Eve 셋이 남는다. 걸음 넷, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `subquery` 는 상관 / 비상관을 돌려 안쪽이 몇 번 도는지와 읽는 줄이 어떻게 느는지를 본다. 이쪽은 비상관 하나의
 * **값이 괄호 자리를 차지하는 차례** — 안쪽 먼저 · 값 하나로 줄어듦 · 괄호가 수로 바뀜 · 그다음 바깥 거름 — 를 쥔다.
 * 그래서 definition 은 runs first · single value · replaces the parentheses · then filters 를 독점하고, correlated ·
 * per outer row · rows read 를 쓰지 않는다.
 *
 * 전제 (설명 글 `queryInsideQuery.md`): 비상관 스칼라 서브쿼리만 · 평균이 나누어떨어지는 데이터 · 비교는 엄격 ·
 * 결과 줄 차례는 원래 표 차례(약속이 아니다) · 표와 값은 예로 정한 것 · SQL 은 그대로 쓴 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const queryInsideQueryConcept: FacetConceptSource = {
  id: 'queryInsideQuery',
  label: 'A Subquery\'s Value Replaces the Parentheses',
  canonicalFacet: 'facet:queryInsideQuery',

  surface: {
    definition:
      'A self-contained scalar subquery in WHERE is evaluated first, shrinking a table to a single value that takes the place of the parentheses; only then does the outer query filter its rows against that number.',
    exemplarKeywords: [
      'subquery',
      'nested query',
      'scalar subquery',
      'subquery in WHERE clause',
      'above average in SQL',
      'WHERE score > (SELECT AVG(score))',
      'why can\'t I use AVG in WHERE',
      'inner query outer query',
      'SQL query inside a query',
    ],
  },

  briefing: {
    observable: [
      'The table `students` lists name and score: Ann 72, Bo 85, Cy 64, Di 90, Eve 78, Fay 61. The query is `SELECT name, score FROM students WHERE score > (SELECT AVG(score) FROM students);` — "The query in parentheses sits inside the outer WHERE."',
      'The inner query runs first: "The inner query runs first, just once, and shrinks the table to one value: 75" — the six scores add to 450 and divide by 6.',
      'The query text itself changes: "That value takes the place of the parentheses. The outer WHERE now compares with: 75". The condition now reads like `score > 75`.',
      'Only then are the rows filtered: "Only now does the outer query filter the rows. Result rows: 3" — Bo 85, Di 90 and Eve 78 remain.',
      'The inner query does not refer to the outer rows, so it has one value for all of them. The data was chosen so the average divides evenly, and no score equals 75; the comparison is strict. Result rows appear in table order, which SQL does not promise without ORDER BY. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays four steps by itself — the table and query, the inner run, the substitution, the outer filter — and stops.',
        'A Replay button and a playback strip sit below it. Holding the third step shows the parenthesised query replaced by the single number 75 before any row has been filtered.',
      ],
    },

    useWhen: [
      'The article introduces subqueries by asking for rows above the average, and needs the reader to see that the average is computed before the rows are tested and becomes a plain number in the condition.',
      'A reader tries to write `WHERE score > AVG(score)` and gets an error; the article shows the aggregate moved into its own query whose answer is dropped into the comparison.',
    ],

    avoidWhen: [
      'The article is about correlated subqueries or how often a subquery runs. The inner query here is independent and runs once.',
      'The subject is subqueries returning several rows, IN/EXISTS, or derived tables in FROM. Only a single-value subquery appears.',
      'The point is query performance or optimizer rewrites. Nothing is measured.',
    ],

    contrastWith: [
      {
        concept: 'subquery',
        note: 'An independent inner query yields one value used for every row; once the inner query refers to the outer row, it must be evaluated again for each row and the single-value picture no longer holds.',
      },
      {
        concept: 'filterKeepSome',
        note: 'The outer WHERE is an ordinary filter; what the subquery adds is that the threshold it filters against is itself computed from the data by another query.',
      },
      {
        concept: 'groupThenAggregate',
        note: 'An aggregate over the whole table gives one number that can be substituted into a condition; grouping first gives one number per group, which a single scalar slot cannot hold.',
      },
    ],
  },
};
