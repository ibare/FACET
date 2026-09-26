/**
 * keepUnmatched 개념 선언.
 *
 * canonical facet 은 `facet:keepUnmatched` — 손님 다섯(`customer`)과 주문 셋(`orders`)을 `LEFT JOIN orders o ON o.cust_id = c.id`
 * 로 잇는다. 짝 맞은 세 줄(Ann–book · Cy–lamp · Eve–cup)이 먼저 이어지고, 짝 없는 Bo · Di 가 떨어져 나갔다가 NULL 을 달고
 * 되돌아온다. 결과 3 → 5 줄. 걸음 넷, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `joinKinds` 는 다섯 종류를 돌려 견준다. 이쪽은 **LEFT JOIN 한 종류의 한 장면** — 버려질 뻔한 왼쪽 줄이 NULL 을
 * 달고 남는다 — 을 쥔다. INNER 는 "여기서 끝났을" 비교 기준으로만 나온다. 그래서 definition 은 left row · no match ·
 * instead of discarding · NULL-filled · more rows than inner 를 독점하고, RIGHT · FULL · CROSS 와 종류 사이의 견줌을
 * 쓰지 않는다.
 *
 * 전제 (설명 글 `keepUnmatched.md`): 손님 하나에 주문은 많아야 하나 · RIGHT · FULL 은 다루지 않는다 · 결과 줄 차례는 customer
 * 차례(약속이 아니다) · 표와 값은 예로 정한 것 · SQL 은 그대로 쓴 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const keepUnmatchedConcept: FacetConceptSource = {
  id: 'keepUnmatched',
  label: 'LEFT JOIN Keeps Rows With No Match',
  canonicalFacet: 'facet:keepUnmatched',

  surface: {
    definition:
      'A LEFT OUTER JOIN keeps a left-table row that finds no match on the right instead of discarding it, filling the missing right-hand columns with NULL, so it returns more rows than the inner join.',
    exemplarKeywords: [
      'LEFT JOIN',
      'LEFT OUTER JOIN',
      'NULL after LEFT JOIN',
      'customers without orders',
      'WHERE ... IS NULL after LEFT JOIN',
      'anti-join pattern',
      'rows disappear with INNER JOIN',
      'preserve all rows from left table',
      'optional relationship',
    ],
  },

  briefing: {
    observable: [
      'Two tables and a query: `customer` with five rows (Ann, Bo, Cy, Di, Eve), `orders` with three, and `SELECT c.name, o.item FROM customer c LEFT JOIN orders o ON o.cust_id = c.id;`. The caption reads "Left table: 5 · right table: 3".',
      'First the matched rows join at once — Ann–book, Cy–lamp, Eve–cup: "Rows with a match are joined. Result rows: 3", with the note "An INNER JOIN would stop here."',
      'Next Bo and Di are singled out and drop away from the table: "Left rows with no match in orders: 2" and "An INNER JOIN would drop them."',
      'Then they come back into the Result with their item cell showing NULL: "LEFT JOIN keeps them — their empty cells are filled with NULL." The round ends "Result rows: 5 · kept without a match: 2".',
      'The difference between 3 and 5 is exactly the number of left rows without a match. NULL here means there is no order to attach, not an empty item name. Each customer has at most one order in this data; result rows appear in customer order, which SQL does not promise without ORDER BY. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays four steps by itself — the starting tables, matched rows, unmatched rows singled out, unmatched rows kept with NULL — and stops.',
        'A Replay button and a playback strip sit below it. Moving between the second and fourth steps sets the three-row inner result against the five-row LEFT JOIN result.',
      ],
    },

    useWhen: [
      'The article explains why a report lost the customers who never ordered, and needs the moment where an inner join would drop them and LEFT JOIN brings them back with NULL.',
      'A reader wants to find rows with no related row — customers with no orders — and the article is building up to filtering the NULL-filled rows with IS NULL.',
    ],

    avoidWhen: [
      'The article compares LEFT, RIGHT, FULL and CROSS joins. Only LEFT JOIN runs here.',
      'The subject is a left row matching several right rows and repeating. Each customer has at most one order.',
      'The point is NULL semantics in general — three-valued logic, NULL comparisons, COALESCE. NULL appears only as the filler for a missing match.',
    ],

    contrastWith: [
      {
        concept: 'joinKinds',
        note: 'Keeping unmatched left rows is one policy; the family of join kinds varies which side\'s leftovers are kept, from neither to both.',
      },
      {
        concept: 'matchOnKey',
        note: 'Pairing rows on equal keys produces the matched part of the result; keeping unmatched rows is what an outer join adds after that pairing.',
      },
      {
        concept: 'allPairs',
        note: 'Without a join condition no row can fail to match, so the question of keeping unmatched rows never arises.',
      },
    ],
  },
};
