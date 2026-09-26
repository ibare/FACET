/**
 * costModel 개념 선언.
 *
 * canonical facet 은 `facet:costModel` — 표 `people` 줄 400(표 페이지 50), 나이의 참 분포 10 · 30 · 50 · 70 · 80 · 60 · 45 · 25 ·
 * 20 · 10. 옵티마이저는 이 분포를 같은 폭 통 k 개로 묶은 막대 통계만 안다. 손잡이 둘 — 통 수(1 · 2 · 5 · 10) · 범위(`[40, 50)` ·
 * `[70, 90)`). 추정 줄로 Seq Scan(50) 과 Index Scan(3 + 줄 수) 가운데 고르고, 실제 줄로 값을 매긴다. `[40, 50)` 은 추정이 모자라
 * 통 1 에서 Index 를 잘못 고르고 통 2 부터 맞는다. `[70, 90)` 은 추정이 넘쳐 통 10 에서야 Index 로 돌아선다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * 조각 둘은 각각 한 장면이다 — 통마다 걸친 몫을 잘라 모음(`estimateFromStats`, 실제와 견주지 않는다) · 나누기 한 번의 추정이 틀려
 * 틀린 길을 고름(`badEstimateBadPlan`). 이쪽은 **통계의 거칠기를 돌리면 추정 오차가 줄고, 고른 길이 어느 통 수에서 맞는 길로
 * 돌아서는가 — 그 자리가 범위마다 다르다** 를 쥔다. 그래서 definition 은 histogram resolution · coarse · finer · switches ·
 * depends on the range 를 쥐고, 조각들이 독점한 without reading the table · overlap fraction · skewed · keeps the plan 은 쓰지 않는다.
 *
 * 전제 (설명 글 `costModel.md`): 예로 정한 분포 · 통 안은 고르다고 본다 · 통 경계 `[a, b)` · 범위를 10 살 경계에 맞춰 실제 줄이
 * 칸의 합으로 정해진다 · 비용 식(내려가기 3 · 캐시 없음 · 페이지당 줄 여덟) · 고르기는 추정으로, 값 매기기는 실제로 · 동률이면
 * Seq Scan(걸리지 않는다) · 통 5 가 estimateFromStats 의 통계와 같다 · SQL · 연산자 이름은 그대로 · 코드 패널은 IR 하나를 여섯
 * 언어로 옮긴 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const costModelConcept: FacetConceptSource = {
  id: 'costModel',
  label: 'Cost Model and Histogram Statistics',
  canonicalFacet: 'facet:costModel',

  surface: {
    definition:
      'Histogram resolution decides whether a cost-based optimizer picks the right access path: coarse bins misestimate rows and choose wrongly, finer bins converge on the true count, and the switch point varies by range.',
    exemplarKeywords: [
      'cost-based optimizer',
      'optimizer statistics',
      'histogram granularity',
      'ANALYZE and statistics target',
      'default_statistics_target',
      'stale or coarse statistics',
      'estimated rows vs actual rows',
      'EXPLAIN ANALYZE',
      'wrong plan chosen',
      'Index Scan vs Seq Scan',
    ],
  },

  briefing: {
    observable: [
      'The SQL at the top is `SELECT * FROM people WHERE age >= 40 AND age < 50` or `… age >= 70 AND age < 90`. Under "Statistics on age" stands an equal-width histogram over ages 0 to 100: "Statistics: age split into 5 equal-width bins" shows bars 40 · 120 · 140 · 70 · 30. Changing Bins splits or merges the bars in place — one bar of 400, two of 240 and 160, or ten of 10 to 80.',
      'The range window cuts from each bin it covers a share of rows × overlap ÷ bin width and gathers it into an estimate column: "Each bin in the range gives rows × overlap ÷ bin width · Estimated rows: 70". On the same range the previous round\'s estimate stays as a dotted outline.',
      'Two paths are priced from the estimate: "Estimated cost — Seq Scan: 50 · Index Scan: 73 · Chosen: Seq Scan". Seq Scan is always the 50 table pages; Index Scan is 3 plus one page per row.',
      'Then the true ten-year distribution appears over the bins and an actual-rows line crosses the estimate: "True distribution revealed · Actual rows: 80 · Error: 10". Last, "Actual pages — Seq Scan (chosen): 50 · Index Scan: 83 · Better path: Seq Scan" — the chosen path shows "Pages read", the other "Would read".',
      'On `[40, 50)` (actual 80) the estimate for 1, 2, 5, 10 bins is 40, 48, 70, 80: with one bin the estimate is too low, Index Scan is chosen and reads 83 pages where the scan would read 50; from two bins on, Seq Scan is chosen correctly.',
      'On `[70, 90)` (actual 45) the estimate is 80, 64, 50, 45: too high, so Seq Scan is chosen and reads 50 where the index would read 48, until ten bins bring the estimate to 45 and the choice switches to Index Scan. The error shrinks with every step in both ranges, but the choice turns at a different number of bins.',
      'The distribution is an invented example; rows inside a bin are assumed evenly spread; the ranges sit on ten-year boundaries so the actual count is a sum of true bins; there is no cache; a path once chosen is not changed; the five-bin histogram equals the one used in the cardinality-estimation example (40 · 120 · 140 · 70 · 30). The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Bins" 1 / 2 / 5 / 10 (starting at 5) and "Range" `[40, 50)` / `[70, 90)` (starting at `[40, 50)`). Each change replays one round of five steps.',
        'The move that makes the idea land is walking Bins from 1 to 10 on one range and watching the estimate column close in on the actual line while the "Chosen" tag jumps between Seq Scan and Index Scan — then doing the same on the other range and seeing the jump come at a different bin count.',
        'Readouts under the controls: Estimated rows, Actual rows and Pages read.',
        'The code panel, labelled "Cost of the chosen path", starts empty with a "+ Add language" button and highlights the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why refreshing or refining table statistics can change a query plan, and needs a case where the same query picks the wrong path with coarse statistics and the right one with finer statistics.',
      'A reader compares estimated and actual rows in EXPLAIN ANALYZE and wants to know how much the gap matters; two ranges where the gap flips the choice at different resolutions show that it is not a fixed tolerance.',
    ],

    avoidWhen: [
      'The article is about join ordering or the shape of a plan tree. There is one table and a choice between two scans.',
      'The subject is equal-depth histograms, most-common-value lists or multi-column statistics. The histogram here is equal-width on one column.',
      'The point is buffer caching or I/O timing. Cost is a page count with no cache.',
    ],

    contrastWith: [
      {
        concept: 'estimateFromStats',
        note: 'Estimating from a histogram is a calculation that never looks at the data; the cost model checks that calculation against the actual rows and asks when its error changes the decision.',
      },
      {
        concept: 'badEstimateBadPlan',
        note: 'One wrong estimate leading to one wrong plan is the failure itself; the cost model asks how much statistical precision it takes to avoid it, and finds that the answer differs by query.',
      },
      {
        concept: 'optimizer',
        note: 'Choosing a join order from exact row counts is the decision in principle; the cost model is about the estimates that decision really rests on.',
      },
      {
        concept: 'indexChoice',
        note: 'Pricing paths by the pages they would actually read gives the right choice by construction; pricing them from estimates is where the choice can go wrong.',
      },
    ],
  },
};
