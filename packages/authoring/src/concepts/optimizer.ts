/**
 * optimizer 개념 선언.
 *
 * canonical facet 은 `facet:optimizer` — 표 셋 `customers`(여섯) · `orders`(스물넷) · `sale_items`(둘) 를 잇는 질의
 * `SELECT c.name, o.item FROM customers c JOIN orders o ON o.cust_id = c.id JOIN sale_items s ON s.item = o.item WHERE c.id <= k`.
 * 손잡이 둘 — 거른 고객 k(1 ~ 6) · 조인 차례(고객 먼저 · 할인 먼저). 고객 먼저의 중간 결과는 k 마다 네 줄씩 부풀고(4 … 24),
 * 할인 먼저는 아홉에 머문다. 만든 줄(중간 + 끝)은 k ≤ 2 에서 고객 먼저가, k ≥ 3 에서 할인 먼저가 적다. 차례를 바꾸면 계획
 * 트리가 모양을 바꾼다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 각각 한 장면이다 — 거르기를 조인 앞뒤로 옮겨도 답이 같음(`sameAnswerDifferentPlan`) · 어느 둘을 먼저 잇느냐로 중간
 * 결과가 갈림(`reorderJoins`) · 줄이 연산자 나무를 아래에서 위로 흐름(`planIsATree`). 이쪽은 **거르는 줄 수가 바뀌면 싼 조인
 * 차례가 뒤집히고, 옵티마이저가 그 수로 계획 트리의 모양을 고른다**는 것을 쥔다. 그래서 definition 은 cost-based · filter keeps ·
 * flips · plan tree shape 를 쥐고, 조각들이 독점한 equivalent · checks · which pair first · swell · flow upward · build side 는
 * 쓰지 않는다.
 *
 * 전제 (설명 글 `optimizer.md`): 예로 정한 작은 자료 · 모든 조인은 중첩 반복 · Filter 는 만든 줄에 넣지 않는다 · 옵티마이저의 셈을
 * 정확한 줄 수로 두었다(추정은 costModel 의 말) · `WHERE c.id <= k` 는 거르는 줄 수를 손잡이로 바꾸려고 둔 꼴 · 동률이면 고객 먼저
 * (걸리지 않는다) · 연산자 이름은 EXPLAIN 표기 그대로 · SQL 은 그대로 쓴 표기 · 코드 패널은 IR 하나를 여섯 언어로 옮긴 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const optimizerConcept: FacetConceptSource = {
  id: 'optimizer',
  label: 'Query Optimizer: Join Order and Execution Plan',
  canonicalFacet: 'facet:optimizer',

  surface: {
    definition:
      'A cost-based query optimizer picks the join order for a multi-table query by the rows each order would make; as a filter keeps more rows, the cheaper order flips and the chosen plan tree changes shape.',
    exemplarKeywords: [
      'query optimizer',
      'execution plan',
      'EXPLAIN output',
      'cost-based optimization',
      'join ordering',
      'why the planner chose a different plan',
      'plan changes with data size',
      'Nested Loop join',
      'PostgreSQL planner',
      'three-table join performance',
    ],
  },

  briefing: {
    observable: [
      'The query SQL sits at the top with its last line `WHERE c.id <= 2` changing with the handle. Beside it is the plan tree, labelled "Plan: Customers first" or "Plan: Sale items first", built from `Seq Scan`, `Filter` and two `Nested Loop` nodes, and the three tables `customers`, `orders`, `sale_items`.',
      'Step 0: "Plan Customers first · Filter keeps customers: 2 of 6", and the customer rows the filter keeps light up.',
      'First join: the intermediate result flies out of the `orders` table into one pile, one chip per row — "First join (o.cust_id = c.id) · Intermediate rows: 8". Second join: the final rows come out of that pile — "Second join (s.item = o.item) · Final rows: 3 · Rows made: 11".',
      'Last, the two orders are set side by side under "Rows made (intermediate + final)" and the smaller gets a "Cheaper" frame: "Rows made · Customers first: 11 · Sale items first: 12 · Cheaper: Customers first".',
      'As Customers kept rises 1 to 6, the customers-first pile swells by four rows each time (4, 8, 12, 16, 20, 24) while the sale-items-first pile stays at 9. Rows made go 5, 11, 16, 22, 27, 33 against 10, 12, 13, 15, 16, 18: customers first is cheaper up to 2, sale items first from 3 on. Final rows are the same in both orders (1, 3, 4, 6, 7, 9).',
      'Switching Join order changes the tree\'s shape: the `customers` leaf with its `Filter` and the `sale_items` leaf trade places and the two `Nested Loop` nodes swap levels. Chips from the previous round stay faintly and move to their new places.',
      'The data is a small invented example; every join is a nested loop; the optimizer here works from exact row counts rather than estimates; the `c.id <= k` condition exists so the number of kept rows can be turned. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Customers kept" 1 to 6 (starting at 2) and "Join order" Customers first / Sale items first (starting at Customers first). Each change replays one round of four steps.',
        'The move that makes the idea land is stepping Customers kept from 2 to 3 and watching the "Cheaper" frame jump to the other order, then flipping Join order to see the plan tree rebuild itself.',
        'Readouts under the controls: Intermediate rows, Final rows and Rows made.',
        'The code panel, labelled "Counting rows made by each join order", starts empty with a "+ Add language" button and highlights the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why the same SQL can get a different execution plan as the data changes, and needs a threshold where the cheaper join order visibly switches.',
      'A reader reads EXPLAIN output and wants to know what the optimizer is weighing when it arranges the join tree; the rows each order would make, side by side, is that weighing.',
    ],

    avoidWhen: [
      'The article is about how the optimizer estimates row counts from statistics or what happens when estimates are wrong. Counts here are exact.',
      'The subject is join algorithms such as hash join versus merge join. Every join here is a nested loop.',
      'The point is the result of a join — which rows match. Both orders give the same final rows, and the focus is the rows made on the way.',
    ],

    contrastWith: [
      {
        concept: 'reorderJoins',
        note: 'That join order changes the intermediate result is the fact; an optimizer deciding between orders, and the decision reversing as the data changes, is what is built on it.',
      },
      {
        concept: 'sameAnswerDifferentPlan',
        note: 'Plan equivalence is the licence to choose; without a guarantee that every plan gives the same answer there would be nothing for the optimizer to compare.',
      },
      {
        concept: 'planIsATree',
        note: 'Rows flowing up an operator tree describes how one plan runs; the optimizer\'s job happens before that, picking which tree to run.',
      },
      {
        concept: 'costModel',
        note: 'Choosing by exact row counts shows the decision in principle; a real optimizer only has statistics, so its counts are estimates that can lead it astray.',
      },
      {
        concept: 'joinKinds',
        note: 'Join kinds decide which rows a join returns; join order is about the sequence in which several joins of the same kind are carried out.',
      },
    ],
  },
};
