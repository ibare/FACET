/**
 * estimateFromStats 개념 선언.
 *
 * canonical facet 은 `facet:estimateFromStats` — `SELECT * FROM people WHERE age >= 30 AND age < 70`. 옵티마이저가 가진 것은
 * 전체 줄 수 400 과 같은 폭 통 다섯(40 · 120 · 140 · 70 · 30) 뿐이다. 통 하나에 한 걸음씩 걸친 폭만큼의 몫을 잘라 모아
 * 0 · 60 · 140 · 35 · 0 → 추정 235, 선택도 235 / 400 = 0.59. 표의 줄은 끝까지 한 번도 나타나지 않는다. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `costModel` 은 통 수를 돌려 추정이 실제로 다가가고 고른 길이 돌아서는 것을 쥔다. 형제 `badEstimateBadPlan` 은 틀린 추정의
 * 뒤를 쥔다. 이쪽은 **표를 읽지 않고 통계만으로 줄 수를 셈하는 법** — 통마다 걸친 비율만큼 — 을 쥐고 실제와 견주지 않는다.
 * 그래서 definition 은 cardinality estimation · without reading the table · fraction of its width · selectivity 를 독점하고,
 * 길 · 비용 · 오차 · 틀린 선택 은 쓰지 않는다.
 *
 * 전제 (설명 글 `estimateFromStats.md`): 예로 정한 작은 자료 · 통 안은 고르다 · 통 경계 `[a, b)` · 실제 시스템은 같은 줄 수 통이나
 * 자주 나오는 값 목록도 쓴다 — 셈의 뼈대는 같다 · SQL 은 그대로 쓴 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const estimateFromStatsConcept: FacetConceptSource = {
  id: 'estimateFromStats',
  label: 'Cardinality Estimation from a Histogram',
  canonicalFacet: 'facet:estimateFromStats',

  surface: {
    definition:
      'Cardinality estimation predicts how many rows a range predicate matches without reading the table, summing from each histogram bucket its row count times the fraction of its width the range covers.',
    exemplarKeywords: [
      'cardinality estimation',
      'selectivity estimate',
      'equal-width histogram',
      'uniform distribution within a bucket',
      'pg_stats histogram_bounds',
      'how the planner estimates rows',
      'estimated rows in EXPLAIN',
      'range predicate selectivity',
      'column statistics',
    ],
  },

  briefing: {
    observable: [
      'The query `SELECT * FROM people WHERE age >= 30 AND age < 70` sits above an equal-width histogram of `age` with five buckets `[0, 20)` to `[80, 100)` holding 40, 120, 140, 70 and 30 rows. "Only the statistics of age are at hand"; a label reads "Rows in people: 400", and an empty "Estimate" bar below is 400 long.',
      'Buckets are taken one per step from the left. "Bucket [0, 20) lies outside the range — it stays", with "Share: 40 × 0/20 = 0 · Total so far: 0".',
      '"Bucket [20, 40) is partly inside — only the overlap is cut": a vertical strip for `[30, 40)` is cut out and moves down onto the Estimate bar — "Share: 120 × 10/20 = 60 · Total so far: 60". Then "Bucket [40, 60) lies fully inside — all of it moves", 140, total 200.',
      '`[60, 80)` gives 70 × 10/20 = 35, total 235; `[80, 100)` stays, total 235.',
      'The last step reads "Selectivity: 235 / 400 = 0.59"; the filled part of the Estimate bar is the selectivity. The table\'s rows never appear on screen, and the estimate is not compared with any actual count.',
      'The statistics are a small invented example; rows are assumed evenly spread inside each bucket, so half a bucket counts as half its rows. Real systems also use equal-depth histograms and most-common-value lists. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the estimation by itself, one bucket per step, and stops on the selectivity.',
        'A Replay button and a playback strip sit below it. Holding the `[20, 40)` step shows half a bucket being cut and moved.',
      ],
    },

    useWhen: [
      'The article explains how a database knows roughly how many rows a WHERE clause will return before running it, and needs the arithmetic on a histogram laid out bucket by bucket.',
      'A reader sees "rows=235" in a plan and asks where the number came from; partial buckets contributing a proportional share answer it.',
    ],

    avoidWhen: [
      'The article is about what happens when the estimate is wrong or how it affects the chosen plan. The estimate is never checked against reality here.',
      'The subject is equality predicates on skewed values or most-common-value lists. The predicate is a range over an equal-width histogram.',
      'The point is sampling or how statistics are gathered. The histogram is given.',
    ],

    contrastWith: [
      {
        concept: 'costModel',
        note: 'The histogram calculation stands alone as arithmetic; the cost model puts its result next to the true count and asks when the error changes which path is taken.',
      },
      {
        concept: 'badEstimateBadPlan',
        note: 'Summing bucket shares is a careful estimate that assumes even spread inside buckets; dividing total rows by distinct values is a cruder one, and skew is what breaks it.',
      },
    ],
  },
};
