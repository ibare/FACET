/**
 * groupThenAggregate 개념 선언.
 *
 * canonical facet 은 `facet:groupThenAggregate` — 표 `orders` 일곱 줄에 `SELECT city, COUNT(*) AS n, SUM(amount) AS total
 * FROM orders GROUP BY city ORDER BY city` 를 건다. 같은 city 의 줄이 모이고(Busan 1 · 5 · Daegu 3 · 7 · Seoul 2 · 4 · 6),
 * 묶음마다 한 줄로 접힌다(n 2 · 40 / 2 · 50 / 3 · 90). 일곱 줄이 세 줄. 걸음 다섯, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `windowFunction` 은 GROUP BY 를 윈도 함수와 나란히 두고 틀을 돌려 견준다. 이쪽은 **접힘 하나** — 같은 값끼리
 * 모이고, 묶음마다 한 줄로 줄며, 묶는 열과 집계 값만 남는다 — 을 쥔다. 그래서 definition 은 gathers equal values ·
 * collapses · only the key and aggregates 를 독점하고, window · frame · OVER 를 쓰지 않는다.
 *
 * 전제 (설명 글 `groupThenAggregate.md`): 묶음 차례는 ORDER BY city 가 정한다 · 묶음 안 줄 차례는 원래 표 차례(약속이
 * 아니다) · 모이는 걸음과 접히는 걸음은 이해를 돕기 위해 나눴다(실제 엔진은 정렬이나 해시 표로 한 번에 한다) ·
 * 표와 값은 예로 정한 것 · SQL 은 그대로 쓴 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const groupThenAggregateConcept: FacetConceptSource = {
  id: 'groupThenAggregate',
  label: 'GROUP BY Folds Each Group Into One Row',
  canonicalFacet: 'facet:groupThenAggregate',

  surface: {
    definition:
      'GROUP BY gathers rows sharing a value in the grouping column and collapses each group into one output row that keeps only that value plus aggregates such as COUNT and SUM; individual rows vanish.',
    exemplarKeywords: [
      'GROUP BY',
      'aggregate functions',
      'COUNT(*) and SUM per group',
      'totals per category in SQL',
      'column must appear in the GROUP BY clause',
      'grouping and aggregation',
      'summarize rows by key',
      'hash aggregate',
      'pivot-like summary',
    ],
  },

  briefing: {
    observable: [
      'The table `orders` has seven rows of id, city and amount: 1 Busan 30, 2 Seoul 20, 3 Daegu 15, 4 Seoul 40, 5 Busan 10, 6 Seoul 30, 7 Daegu 35. The query is `SELECT city, COUNT(*) AS n, SUM(amount) AS total FROM orders GROUP BY city ORDER BY city;` — "Before GROUP BY, every row stands on its own."',
      'Rows with the same city gather into columns: "Rows with the same city gather together. Groups: 3." Busan holds ids 1 and 5, Daegu 3 and 7, Seoul 2, 4 and 6. The only test is whether the city values are equal.',
      'Each group then folds into one Result row, one step each: "Group Busan folds into one row: n = 2, total = 30 + 10 = 40." Daegu gives n 2, total 50; Seoul n 3, total 90.',
      'A Rows readout goes from 7 to 3. The folded rows keep only city, n and total; ids and individual amounts do not appear in the result, since one row cannot hold several of them.',
      'Group and result order come from ORDER BY city; order inside a group is the original table order, which SQL does not promise. Gathering and folding are shown as separate steps for clarity — a real engine often groups and aggregates in one pass with sorting or a hash table. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays five steps by itself — the table and query, the gathering, then one fold per city — and stops.',
        'A Replay button and a playback strip sit below it. Holding the gathering step shows all seven rows still present in three stacks, one step before any of them folds.',
      ],
    },

    useWhen: [
      'The article introduces per-category totals in SQL and needs the reader to see rows collecting by equal value and each collection shrinking to a single row with a count and a sum.',
      'A reader hits the error that a column must appear in GROUP BY or inside an aggregate; the folded rows, where the separate ids have nowhere to go, explain why.',
    ],

    avoidWhen: [
      'The article is about window functions or keeping the original rows alongside group totals. Here the rows are folded away.',
      'The subject is HAVING, ROLLUP, CUBE or grouping on several columns. One column is grouped and nothing is filtered after grouping.',
      'The point is how databases implement aggregation efficiently. The two-stage picture is for explanation, not an execution plan.',
    ],

    contrastWith: [
      {
        concept: 'windowFunction',
        note: 'GROUP BY returns one row per group and loses the members; a window aggregate can attach the same group figure to every original row instead.',
      },
      {
        concept: 'windowSlides',
        note: 'Collapsing rows by key and summing over a moving frame both aggregate, but one reduces the number of rows and the other keeps each row and adds a column.',
      },
      {
        concept: 'reduceFold',
        note: 'A fold reduces one whole sequence to one value; grouping first splits the rows by key and then runs such a fold separately inside each group.',
      },
      {
        concept: 'queryInsideQuery',
        note: 'An aggregate without grouping yields a single value for the whole table; grouping yields one value per key.',
      },
    ],
  },
};
