/**
 * columnOriented 개념 선언.
 *
 * canonical facet 은 `facet:columnOriented` — 표 `sales`(여섯 줄 · 칸 `id` · `region` · `product` · `amount`)를 한 화면에 두 번
 * 담는다. 줄 방향은 줄 둘씩 쪽 셋(P1 · P2 · P3), 칸 방향은 칸마다 쪽 하나씩 넷. 질의 `SELECT SUM(amount) FROM sales` 에
 * 줄 방향은 쪽 3 / 3 을 읽어 칸 24 가 딸려 오고(쓴 칸 6), 칸 방향은 `amount` 쪽 1 / 4 만 읽어 칸 6. 합은 둘 다 600.
 * 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `columnFamily` 는 칸을 묶는 굵기를 손잡이로 돌리고 묻는 칸 수에 따라 가장 싼 묶음이 옮겨 가는 것을 센다. 이쪽은
 * **한 칸만 묻는 질의** 하나에서 두 끝을 견준다 — 값이 줄에서 떼어져 칸끼리 모이고, 묻는 칸의 쪽만 올라온다. 그래서
 * definition 은 one column · row by row · unused columns come along · same sum 을 쥐고, 완제품이 쥔 families · grouping ·
 * how many columns · shifts 를 쓰지 않는다.
 *
 * 전제 (설명 글 `columnOriented.md`): 자료는 예로 정한 여섯 줄 · 쪽 하나에 칸 여덟 · 칸 크기는 모두 같다 · 두 칸이 한 쪽을
 * 나눠 쓰지 않는다 · 압축과 메모리 캐시는 다루지 않는다 · SQL 은 그대로 쓴 표기(`@notation native`).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const columnOrientedConcept: FacetConceptSource = {
  id: 'columnOriented',
  label: 'Column-Oriented Storage Reads Only the Queried Column',
  canonicalFacet: 'facet:columnOriented',

  surface: {
    definition:
      'For a query that needs one column, a table written row by row brings up every page along with the unused columns, while storing each column contiguously reads only that column\'s page for the same sum.',
    exemplarKeywords: [
      'columnar storage',
      'column store vs row store',
      'OLAP vs OLTP storage layout',
      'analytical query reads few columns',
      'SELECT SUM over one column',
      'data warehouse storage',
      'Parquet columnar format',
      'ClickHouse',
      'Amazon Redshift',
      'disk pages read',
    ],
  },

  briefing: {
    observable: [
      'The table `sales` has six rows and four columns — `id`, `region`, `product`, `amount` (120, 80, 45, 200, 60, 95). Below it, two stores side by side: "Row-oriented" and "Column-oriented". A page holds eight cells.',
      'Step 1: "Row-oriented: each row is written whole, one after another. Pages: 3" — P1 holds rows 1 and 2, P2 rows 3 and 4, P3 rows 5 and 6, so `amount` sits on every page.',
      'Step 2: "Column-oriented: values leave their rows and gather by column. Pages: 4" — one page each for `id`, `region`, `product` and `amount`, six cells filled and two empty. It stores more pages than the row side.',
      'The query `SELECT SUM(amount) FROM sales` appears. Step 3: "Row-oriented: every page holding amount comes up whole." — "Pages read: 3 / 3 · Cells brought: 24 · Used: 6".',
      'Step 4: "Column-oriented: only the pages of amount come up." — "Pages read: 1 / 4 · Cells brought: 6 · Used: 6". The end reads "Sum: 600 · Cells brought up — row-oriented: 24 · column-oriented: 6": the answer is the same, the amount read is not.',
      'The six rows are an example, eight cells per page is chosen for the count, all cells are the same size, and no two columns share a page. Compression and memory caches are left out; only disk pages are counted. The SQL is written as is. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays six steps by itself — table, row-oriented layout, column-oriented layout, the row side reading, the column side reading, the sum — and then stops.',
        'A Replay button and a playback strip sit below it. Holding step 4 keeps both results in view: three pages and 24 cells against one page and 6 cells.',
      ],
    },

    useWhen: [
      'The article explains why analytical databases store data by column, and needs one aggregate over one column where the row layout drags the other columns along.',
      'A reader assumes storing a table differently only changes where values sit; the same sum of 600 read from three pages versus one page makes the cost visible.',
    ],

    avoidWhen: [
      'The article is about queries that fetch whole rows, such as looking up one customer\'s record. The query here touches a single column.',
      'The subject is columnar compression, run-length or dictionary encoding. No compression is modelled.',
      'The point is CPU cache lines and loop order over an array in memory. The units read here are disk pages.',
    ],

    contrastWith: [
      {
        concept: 'columnFamily',
        note: 'Storing every column apart is the extreme that wins for a one-column query; grouping columns into families asks what happens between that extreme and a row layout as queries ask for more columns.',
      },
      {
        concept: 'rowVsColumnWalk',
        note: 'Both turn on values that sit together being read together. Loop order over a matrix concerns cache lines already in memory; row versus column storage concerns which disk pages are fetched at all.',
      },
    ],
  },
};
