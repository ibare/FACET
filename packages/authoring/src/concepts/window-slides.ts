/**
 * windowSlides 개념 선언.
 *
 * canonical facet 은 `facet:windowSlides` — 표 `sales`(day 1 ~ 6, amount 4 · 7 · 2 · 9 · 5 · 3)에
 * `SUM(amount) OVER (ORDER BY day ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS near` 를 건다. 틀이 day 1 부터 한 줄씩
 * 미끄러지며 near 11 · 13 · 18 · 16 · 17 · 8 을 그 줄 칸에 적는다. 처음에도 끝에도 줄은 여섯. 걸음 일곱, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `windowFunction` 은 묶음(PARTITION BY)을 두고 틀의 폭을 돌려 GROUP BY 합과 견준다. 이쪽은 묶음도 손잡이도 없이
 * **틀 하나가 미끄러지는 동작** — 줄마다 제 틀, 합은 그 줄 자신의 칸, 양 끝에서 틀이 줄어듦, 줄은 접히지 않음 — 을 쥔다.
 * 그래서 definition 은 slides · its own column · shrinks at the edges · moving sum 을 독점하고, PARTITION · UNBOUNDED ·
 * GROUP BY total 을 쓰지 않는다.
 *
 * 전제 (설명 글 `windowSlides.md`): 틀은 줄 차례로 센다(`ROWS`, 값의 범위인 `RANGE` 가 아니다) · 표 밖 줄은 0 으로 채우지
 * 않는다 · 결과 차례는 day 차례(바깥 ORDER BY 가 없어 약속이 아니다) · 표와 값은 예로 정한 것 · SQL 은 그대로 쓴 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const windowSlidesConcept: FacetConceptSource = {
  id: 'windowSlides',
  label: 'A Sliding Window Frame Writes Into Each Row',
  canonicalFacet: 'facet:windowSlides',

  surface: {
    definition:
      'A ROWS BETWEEN frame slides down the ordered rows, and each row receives the sum of its neighbours inside the frame in its own column; the frame shrinks at the edges and no row is merged away.',
    exemplarKeywords: [
      'SUM OVER ORDER BY',
      'ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING',
      'moving sum in SQL',
      'rolling window',
      'moving average SQL',
      'window frame',
      'centered moving window',
      'sliding window aggregate',
      'neighbouring rows in SQL',
    ],
  },

  briefing: {
    observable: [
      'The table `sales` has six rows, day 1 to 6 with amounts 4, 7, 2, 9, 5, 3, and an empty `near` column: "Before the query runs, the near column is empty." The query is `SELECT day, amount, SUM(amount) OVER (ORDER BY day ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS near FROM sales;`.',
      'A frame covering the row before, the row itself and the row after stops on one row per step, starting at day 1. Copies of the amounts inside it fly to that row\'s near cell and add up there; the original amounts stay where they are.',
      'At day 3 the caption reads "day 3: the frame holds day 2–4 · sum 18". The near values fill in as 11, 13, 18, 16, 17, 8.',
      'At the ends the dashed frame reaches past the table: "day 1: the frame runs past the table · inside: day 1–2 · sum 11", and day 6 sums only days 5–6 to 8. Missing rows are not counted as zeros.',
      'A Rows readout stays at 6 from start to finish. The frame counts rows in day order, not a range of values. Results are shown in day order; without an outer ORDER BY, SQL does not promise it. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays seven steps by itself — the table and query, then the frame on each of the six days — and stops.',
        'A Replay button and a playback strip sit below it. Holding day 1 or day 6 shows the frame hanging past the table with only two rows inside.',
      ],
    },

    useWhen: [
      'The article introduces a moving sum or moving average in SQL and needs the frame shown travelling row by row, each result landing in the row it belongs to.',
      'A reader expects the edge rows to be padded with zeros or dropped; the shortened frames at day 1 and day 6, with all six rows still present, show what actually happens.',
    ],

    avoidWhen: [
      'The article is about PARTITION BY or comparing a window result with GROUP BY. There is one ordered set of rows and no grouping.',
      'The subject is RANGE frames, running totals from the start, or ranking functions. The frame here is a fixed one-before, one-after.',
      'The point is the sliding-window technique in array algorithms outside SQL. Everything is framed as a query over a table.',
    ],

    contrastWith: [
      {
        concept: 'windowFunction',
        note: 'A single sliding frame explains how a window aggregate fills each row; partitioning the rows and widening the frame is what makes that per-row value converge to a group total.',
      },
      {
        concept: 'groupThenAggregate',
        note: 'Grouping collapses rows so that one output row stands for many; a window aggregate adds a column and leaves the row count unchanged.',
      },
    ],
  },
};
