/**
 * foreignKeyPoints 개념 선언.
 *
 * canonical facet 은 `facet:foreignKeyPoints` — 표 `customers`(7 Mina · 8 Joon · 9 Sora) 와 `orders`(501 8 · 502 7 ·
 * 503 8 · 504 9). 주문을 하나씩 따라가 `customer_id` 값이 같은 고객 줄로 닿는다(자리가 아니라 값으로 — 선이 엇갈리고
 * 501 · 503 이 Joon 에 모인다). 마지막에 들어오려는 505 6 은 고객 줄 0 이라 거절, 주문은 4 줄 그대로. 걸음 여섯,
 * 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `relationalTablesAndKeys` 는 두 표의 짜임 · 카디널리티 · 후보 키 바꾸기까지 한 판에 담는다. 이쪽은
 * **값으로 찾아가고, 닿을 곳 없는 값은 튕긴다** 하나만 쥔다. 형제 `primaryKeyIdentifies` 는 한 표 안에서 불러 하나가
 * 남는 쪽이다. 그래서 definition 은 looks up by value · not by position · insert is rejected 를 독점하고, 걸러 냄 ·
 * 하나만 남음 · 격자를 쓰지 않는다.
 *
 * 전제 (설명 글 `foreignKeyPoints.md`): 새 줄을 넣는 SQL 문은 보이지 않고 줄 그대로 보였다 · 표와 값은 예로 정한 것 ·
 * 줄 차례에는 뜻이 없다. 삭제 · 갱신 때의 동작(CASCADE 등)은 화면에 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const foreignKeyPointsConcept: FacetConceptSource = {
  id: 'foreignKeyPoints',
  label: 'A Foreign Key Refers by Value and Rejects Missing Targets',
  canonicalFacet: 'facet:foreignKeyPoints',

  surface: {
    definition:
      'A foreign key column reaches its target by looking up the equal key value in the referenced table, not a row position, and an incoming row whose value matches no referenced row is rejected.',
    exemplarKeywords: [
      'foreign key',
      'foreign key constraint',
      'referential integrity',
      'orders and customers tables',
      'insert fails foreign key violation',
      'orphan row',
      'REFERENCES clause',
      'many orders for one customer',
      'parent and child table',
    ],
  },

  briefing: {
    observable: [
      'Two tables: `orders` (primary key `order_id`, foreign key `customer_id`) with rows 501 8, 502 7, 503 8, 504 9, and `customers` (primary key `customer_id`, plus `name`) with 7 Mina, 8 Joon, 9 Sora. An "Incoming row" 505 6 waits to one side. The caption reads "Foreign key: orders.customer_id → customers.customer_id".',
      'Orders are followed one at a time in data order: "order_id 501 → the customers row with key 8 · rows pointing there: 1", then 502 to key 7, then 503 to key 8 again ("rows pointing there: 2"), then 504 to key 9.',
      'Because the lookup is by value, not by row position, the lines cross, and orders 501 and 503 converge on Joon. Each order reaches exactly one customer; one customer can be reached by several orders.',
      'The incoming row 505 carries `customer_id` 6: "customers rows with key 6: 0 · rejected · orders rows: 4". It never enters the table.',
      'The insert is shown as a row, not as an SQL statement. The tables and values are made-up examples. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays its six steps by itself and stops on the rejected row.',
        'A Replay button and a playback strip sit below it. Holding the step for order 503 shows the second line arriving at the same customer.',
      ],
    },

    useWhen: [
      'The article explains referential integrity and needs its concrete meaning: the only values allowed in the column are those present right now in the other table\'s key column.',
      'A reader imagines a reference as a row number or a pointer; watching crossing lines find their target by equal values dispels that.',
    ],

    avoidWhen: [
      'The article is about ON DELETE or ON UPDATE actions such as CASCADE. Only inserting a row is shown.',
      'The subject is how a join combines the two tables into one result. No query result is produced.',
      'The point is choosing between candidate keys. Each table has one fixed key.',
    ],

    contrastWith: [
      {
        concept: 'relationalTablesAndKeys',
        note: 'A relationship between tables can be read from either side and rests on whichever candidate key was chosen as primary. The constraint is one direction of it: how a stored value finds its target, and what happens when there is none.',
      },
      {
        concept: 'primaryKeyIdentifies',
        note: 'A primary key guarantees that a value names at most one row. A foreign key relies on that guarantee to reach exactly one target, and adds the rule that the target must exist.',
      },
      {
        concept: 'matchOnKey',
        note: 'A join matches rows by equal key values to build a result, and unmatched rows just drop out. The constraint uses the same matching to decide whether a row may exist at all.',
      },
    ],
  },
};
