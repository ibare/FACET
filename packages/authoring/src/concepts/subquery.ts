/**
 * subquery 개념 선언.
 *
 * canonical facet 은 `facet:subquery` — 표 `staff (name, dept, pay)` 앞 n 줄에 `WHERE pay > (SELECT AVG(pay) …)` 를 건다.
 * 손잡이 둘 — "서브쿼리"(비상관 / 상관) · "줄 수"(2 · 4 · 6 · 8, 처음 4). 비상관은 안쪽이 한 번 돌아 값이 괄호 자리에
 * 머물고, 상관(`WHERE t.dept = s.dept`)은 바깥 줄마다 다시 돌아 값이 갈아 끼워진다. 읽은 줄 2n 대 n + n².
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 하나)
 *
 * 조각 `queryInsideQuery` 는 비상관 스칼라 서브쿼리 한 장면 — 안쪽이 먼저 한 번 돌고, 값이 괄호 자리에 앉고, 그다음
 * 바깥이 거른다 — 이다. 이쪽은 **상관으로 바꿨을 때 무엇이 갈리는가**를 쥔다 — 돈 수 · 읽은 줄 · 묻는 물음.
 * 그래서 definition 은 correlated · reruns per outer row · rows read grow quadratically · per-group 을 쥐고,
 * 조각이 독점한 replaces the parentheses · first and only once 를 쓰지 않는다.
 *
 * 전제 (설명 글 `subquery.md`): 표와 값은 예로 정한 것 · SQL 은 그대로 쓴 표기 · 엔진이 안쪽 결과를 기억해 두지 않고
 * 상관 서브쿼리를 조인으로 풀지도 않는다고 본다(실제 엔진은 한다) · 안쪽 한 번 = n 줄 전부 읽음 · 평균은 정수로
 * 나누어떨어지게 골랐다 · 비교는 엄격. 코드 패널은 IR → 여섯 언어로, 그 질의를 엔진이 도는 반복이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const subqueryConcept: FacetConceptSource = {
  id: 'subquery',
  label: 'Correlated vs Uncorrelated Subquery',
  canonicalFacet: 'facet:subquery',

  surface: {
    definition:
      'Making a scalar subquery correlated, by referring to the outer row, reruns it once per outer row instead of once overall, so rows read grow quadratically and it asks a per-group rather than global question.',
    exemplarKeywords: [
      'correlated subquery',
      'non-correlated subquery',
      'dependent subquery',
      'subquery executed for each row',
      'correlated subquery performance',
      'N+1 query pattern',
      'above department average',
      'rewrite subquery as a join',
      'EXPLAIN DEPENDENT SUBQUERY',
      'SELECT inside WHERE',
    ],
  },

  briefing: {
    observable: [
      'The table `staff` lists name, dept and pay: Rae lab 84, Sol desk 82, Tom lab 80, Una desk 98, Val lab 79, Wim desk 99, Yul lab 53, Zed desk 73. Only the first n rows are in play. The uncorrelated query is `SELECT name FROM staff WHERE pay > (SELECT AVG(pay) FROM staff);`; the correlated one adds aliases and `WHERE t.dept = s.dept` inside the parentheses.',
      'Uncorrelated: the inner query runs once ("Inner run 1: reads 4 rows, AVG(pay) = 344 / 4 = 86"), its value sits in the parentheses slot, and each outer row is compared with it ("Una: pay 98 > 86 is true"). With 4 rows: 1 inner run, 8 rows read, result Una.',
      'Correlated: before each outer row the inner query runs again for that row\'s dept ("Inner run 2 for outer row Sol (dept desk): reads 4 rows, keeps 2, AVG(pay) = 180 / 2 = 90"), and the value in the parentheses switches between the lab and desk averages. With 4 rows: 4 inner runs, 20 rows read, result Rae and Una.',
      'Across the Rows handle, inner runs stay at 1 uncorrelated and equal n correlated; rows read are 4, 8, 12, 16 against 6, 20, 42, 72 (2n against n + n²).',
      'The two forms also ask different questions — above the overall average versus above one\'s own department\'s average. With 2 rows the correlated form returns nothing: each department has one row, so Rae compares 84 > 84 and Sol 82 > 82, both false.',
      'The model assumes the engine neither caches inner results nor rewrites the correlated subquery as a join; real databases often do one or the other. One inner run reads all n rows; averages were chosen to divide evenly; the comparison is strict. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Subquery", Uncorrelated or Correlated (starting Uncorrelated), and "Rows", 2, 4, 6 or 8 (starting 4). Each change replays the round.',
        'The move that makes the idea land is flipping to Correlated at 8 rows: inner runs go from 1 to 8 and rows read from 16 to 72, while the result list also changes because the question changed.',
        'Readouts under the controls: Inner runs, Rows read and Result rows.',
        'The code panel, labelled "How the query runs", starts empty with a "+ Add language" button; it shows the loop the engine runs, with the inner scan before the outer loop for the uncorrelated form and inside it for the correlated form, in Python, JavaScript, TypeScript, Java, C++ or C#. It is not SQL.',
      ],
    },

    useWhen: [
      'The article explains why a subquery that mentions the outer table can be slow on large tables, and needs inner runs and rows read climbing with the row count against a flat single run.',
      'A reader thinks adding `WHERE t.dept = s.dept` is a small filter tweak; the article needs to show it changes both how often the inner query runs and which rows the query returns.',
    ],

    avoidWhen: [
      'The article is about how an optimizer decorrelates or caches subqueries. That machinery is deliberately absent here.',
      'The subject is subqueries in FROM (derived tables), EXISTS/IN semantics, or subqueries returning several rows. Only a scalar AVG in WHERE appears.',
      'The point is a first introduction to nesting one query inside another, with no correlation involved. The screen is built around the switch to correlated.',
    ],

    contrastWith: [
      {
        concept: 'queryInsideQuery',
        note: 'Evaluating an independent inner query once and substituting its value is the base case; correlation is what breaks that single evaluation into one per outer row.',
      },
      {
        concept: 'groupThenAggregate',
        note: 'A per-group average can be computed once for every group by grouping; a correlated subquery recomputes it for each outer row that asks, which is where its extra reading comes from.',
      },
      {
        concept: 'sameAnswerDifferentPlan',
        note: 'Rewriting a correlated subquery as a join is one way to reach the same answer through a cheaper plan; the cost of the literal per-row execution is what such rewrites avoid.',
      },
      {
        concept: 'memoWriteOnce',
        note: 'Storing a computed result and reusing it is what would stop a correlated inner query repeating work for outer rows with the same key; without that reuse the work grows with every outer row rather than with the number of distinct keys.',
      },
    ],
  },
};
