/**
 * badEstimateBadPlan 개념 선언.
 *
 * canonical facet 은 `facet:badEstimateBadPlan` — `SELECT * FROM users WHERE city = 'Seoul'`. 통계는 줄 300 · 페이지 30 · 서로 다른
 * city 30 뿐이라 값마다 고르다고 보고 300 ÷ 30 = 10 줄로 짐작한다. 추정 비용 Seq Scan 30 · Index Scan 13 → Index Scan 을 고른다.
 * 실제 `Seoul` 은 155 줄, 실제 비용은 Seq Scan 30 · Index Scan 158 로 뒤집히지만 고른 길은 그대로다. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `costModel` 은 통계를 잘게 해 가며 오차가 줄고 고른 길이 돌아서는 것을 쥔다. 형제 `estimateFromStats` 는 추정하는 셈을
 * 쥔다. 이쪽은 **추정이 틀린 뒤** — 치우친 값을 고르다고 본 짐작이 싸 보이는 길을 고르게 하고, 실제 줄이 들어와도 그 길이
 * 바뀌지 않는다 — 를 쥔다. 그래서 definition 은 skewed · uniform · looks cheapest on paper · keeps it 을 독점하고, 막대 · 통 ·
 * 걸친 몫 · 잘게 는 쓰지 않는다.
 *
 * 전제 (설명 글 `badEstimateBadPlan.md`): 예로 정한 작은 자료 · 비용은 읽은 페이지(Index Scan = 내려가기 3 + 가리킨 줄마다 표 페이지
 * 하나, 캐시 없음) — 실제 비용 식은 더 복잡하다 · 고른 뒤 길을 바꾸지 않는다 · SQL · 연산자 이름은 그대로 쓴 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const badEstimateBadPlanConcept: FacetConceptSource = {
  id: 'badEstimateBadPlan',
  label: 'A Bad Row Estimate Picks a Bad Plan',
  canonicalFacet: 'facet:badEstimateBadPlan',

  surface: {
    definition:
      'When an optimizer assumes values are uniform but the column is skewed, it underestimates the rows, picks the plan that looks cheapest on paper, and keeps it even though the real row count makes that plan far more expensive.',
    exemplarKeywords: [
      'cardinality misestimate',
      'data skew',
      'uniform distribution assumption',
      'n_distinct',
      'optimizer chose index scan but it was slower',
      'bad query plan',
      'estimated vs actual rows mismatch',
      'plan regression',
      'why is my query slow despite an index',
    ],
  },

  briefing: {
    observable: [
      'The query is `SELECT * FROM users WHERE city = \'Seoul\'`. The statistics read "users · Rows: 300 · Pages: 30 · Distinct city: 30" — "Only statistics — rows per city value are not in them." A band for the table\'s rows is not yet divided.',
      '"Estimate per value: 300 ÷ 30 = 10". The band is cut into thirty equal cells, `\'Seoul\'` among them marked "Estimate: 10".',
      'Pages are drawn as cells, "Fewer pages on top": `Seq Scan` 30, `Index Scan` 13 (3 index pages + 10 table pages). "Estimated pages — Index Scan: 13 · Seq Scan: 30. Picked: Index Scan" — the Picked tag attaches to Index Scan.',
      '"Actual rows for Seoul: 155. Estimated: 10" — the Seoul cell widens to 155 rows and the other values\' cells narrow to 5 rows each.',
      'Last, "Actual pages — Index Scan: 158 · Seq Scan: 30. Plan stays: Index Scan". The two paths trade places, Seq Scan 30 → 30 and Index Scan 13 → 158, and the Picked tag goes down with Index Scan: the chosen path reads more than five times what the other would have.',
      'The table and numbers are a small invented example. Cost is pages read with no cache — 3 pages to descend the index and one table page per pointed-to row; real cost formulas are more elaborate. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself — statistics, estimate, choice, actual rows, actual cost — and stops with the paths reversed.',
        'A Replay button and a playback strip sit below it. Moving between the choice step and the last step shows the same Picked tag on top and then at the bottom.',
      ],
    },

    useWhen: [
      'The article explains why a query can be slow even though the database used an index, and needs a case where a skewed value made the index path look cheap.',
      'A reader sees estimated rows=10 against actual rows=155 in EXPLAIN ANALYZE and wants to know what that gap does to the plan; the reversed costs with the choice unchanged show it.',
    ],

    avoidWhen: [
      'The article is about histograms or how finer statistics improve an estimate. The estimate here is a single division.',
      'The subject is choosing a join order. There is one table and two scan paths.',
      'The point is adaptive or runtime re-optimization. Once chosen, the plan here never changes.',
    ],

    contrastWith: [
      {
        concept: 'costModel',
        note: 'One misestimate producing one wrong plan is the failure; how fine the statistics must be before the choice comes right is the broader question, and its answer changes with the query.',
      },
      {
        concept: 'estimateFromStats',
        note: 'How an estimate is computed is the step before; the harm arises only once the estimate is used to choose and turns out to be wrong.',
      },
      {
        concept: 'indexChoice',
        note: 'When costs are exact, a many-row lookup simply loses to a scan; when costs are estimated, the same lookup can win the choice and lose only in execution.',
      },
    ],
  },
};
