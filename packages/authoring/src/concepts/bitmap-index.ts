/**
 * bitmapIndex 개념 선언.
 *
 * canonical facet 은 `facet:bitmapIndex` — 표 `cars (color, fuel, gear)` 줄 열둘에 열마다 비트맵 인덱스가 이미 있다.
 * 조건을 앞에서부터 k 개(`color = 'red'` → `fuel = 'ev'` → `gear = 'auto'`) 쓰고 AND 나 OR 로 잇는다. 조건마다 비트 줄
 * 하나가 결과 자리로 내려와 포개지고, 결과 줄의 1 인 자리의 줄만 표에서 읽는다. 손잡이 둘 — 결합(AND · OR) · 조건 수(1 · 2 · 3).
 * 읽은 비트는 12 · 24 · 36 으로 결합과 무관, 읽은 줄은 AND 5 → 3 → 1 · OR 5 → 7 → 11.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * 조각 둘은 각각 한 장면이다 — 줄마다 제 값의 비트 줄에 1 을 찍음(`bitPerRow`) · 비트 줄 둘을 AND 한 번으로 포갬(`bitwiseCombine`).
 * 이쪽은 **조건을 더할 때 AND 는 읽을 줄을 좁히고 OR 는 넓히되, 읽는 비트는 어느 쪽이든 같이 는다**는 두 방향의 대비를 쥔다.
 * 그래서 definition 은 adding predicates · shrinks · grows · bits read rise the same 을 쥐고, 조각들이 독점한 distinct value ·
 * exactly one 1 per position · single operation · never opened 를 쓰지 않는다.
 *
 * 전제 (설명 글 `bitmapIndex.md`): 비트 줄은 이미 있다(만드는 과정은 보이지 않는다) · 조건마다 비트 줄 하나를 통째로 읽는다 ·
 * 줄 하나 읽기 = 1 · 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이고 비트 연산 대신 AND 는 곱, OR 는 큰 쪽으로 쓴다 ·
 * SQL 은 그대로 쓴 표기 · 예로 정한 자료.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bitmapIndexConcept: FacetConceptSource = {
  id: 'bitmapIndex',
  label: 'Bitmap Index (Stacking Conditions with AND vs OR)',
  canonicalFacet: 'facet:bitmapIndex',

  surface: {
    definition:
      'With bitmap indexes each predicate costs one full bitmap read; adding predicates with AND shrinks the set of table rows fetched, adding them with OR grows it, while bits read rise identically.',
    exemplarKeywords: [
      'bitmap index',
      'bitmap index scan',
      'BitmapAnd and BitmapOr',
      'multiple WHERE conditions on low-cardinality columns',
      'data warehouse filtering',
      'Oracle bitmap index',
      'star schema filter',
      'AND vs OR selectivity',
      'combining several indexes in one query',
      'low cardinality column index',
    ],
  },

  briefing: {
    observable: [
      'The table `cars (color, fuel, gear)` has twelve rows `r1` to `r12`. A "Bitmap index" area holds one twelve-character bit row per condition, the first character standing for `r1`: `color = \'red\'` 110100101000, `fuel = \'ev\'` 100110100100, `gear = \'auto\'` 101000010011. The query SQL sits above, e.g. `SELECT * FROM cars WHERE color = \'red\' AND fuel = \'ev\'`, and an empty "Result bit row" waits below.',
      '"Each condition reads one bit row from the index." Then "The first bit row is placed as the result row." Each further condition slides one more bit row down onto the result in a single step: "Stacked with AND: a spot stays 1 only where both rows have 1." or "Stacked with OR: a 1 in either row turns the spot on."',
      'With AND, adding conditions switches 1s off in the result row: 110100101000 → 100100100000 → 100000000000. With OR they spread: 110100101000 → 110110101100 → 111110111111.',
      'Last, "Only the rows at a 1 in the result are read from the table." Lines run from each 1 to its table row. Rows read: AND 5 → 3 → 1 for one, two, three conditions; OR 5 → 7 → 11, which is eleven of the twelve rows.',
      'Bits read is 12, 24, 36 for one, two, three conditions under either AND or OR — each condition reads its whole bit row. With a single condition the two combine settings give the same query and the same result.',
      'The bit rows already exist; their construction is not shown. Rows are read in table order. The data is an invented example. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Combine" AND / OR (starting at AND) and "Conditions" 1 / 2 / 3 (starting at 2). Each change replays one round: three, four or five steps for one, two or three conditions.',
        'The move that makes the idea land is raising Conditions from 1 to 3 under AND and then under OR: the same stack of bit rows gives a result row that thins out in one case and fills in in the other, while Bits read climbs the same way both times.',
        'Readouts under the controls: Bits read and Rows read.',
        'The code panel, labelled "Stacking bit rows", starts empty with a "+ Add language" button and highlights the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#; it writes AND as a product and OR as a maximum of 0/1 values.',
      ],
    },

    useWhen: [
      'The article explains why bitmap indexes suit queries with many conditions on few-valued columns, and needs to show that adding an AND condition makes the table read smaller while the index read only grows by one bitmap.',
      'A reader wonders why an OR across several conditions ends up reading nearly the whole table even with bitmap indexes; eleven of twelve rows under three OR conditions shows it.',
    ],

    avoidWhen: [
      'The article is about how a bitmap index is built from a column. The bit rows are given from the start.',
      'The subject is bitmap compression such as run-length encoding or WAH/Roaring. Bit rows are shown uncompressed.',
      'The point is bitwise operators in a programming language. The operation here is a database combining index results.',
    ],

    contrastWith: [
      {
        concept: 'bitPerRow',
        note: 'Setting one bit per row per value is how the index is stored; combining several of those bitmaps is how a query with several conditions uses it.',
      },
      {
        concept: 'bitwiseCombine',
        note: 'Combining two conditions is a single whole-bitmap AND; stacking more conditions, and choosing AND or OR, decides whether the rows fetched shrink or grow.',
      },
      {
        concept: 'indexChoice',
        note: 'Tree and hash indexes answer one condition on one column; bitmap indexes are built to answer several conditions at once by combining their bitmaps before touching the table.',
      },
      {
        concept: 'bloomFilter',
        note: 'A Bloom filter is one hashed bit array that can only say "maybe present"; a bitmap index keeps an exact bit per row per value, so the combined bitmap names exactly which rows to read.',
      },
    ],
  },
};
