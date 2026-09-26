/**
 * bitPerRow 개념 선언.
 *
 * canonical facet 은 `facet:bitPerRow` — 표 `orders` 줄 열(`r1` … `r10`), 인덱스를 거는 열 `status`, 값 셋
 * `paid` · `pending` · `shipped` → 비트 줄 셋. 줄 하나씩 내려와 제 값의 비트 줄 제 자리에 1, 나머지 비트 줄 같은 자리에 0.
 * 끝에 `paid` 1001100101 · `pending` 0100001000 · `shipped` 0010010010, 1 의 수 5 + 2 + 3 = 10, 비트 3 × 10 = 30.
 * 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `bitmapIndex` 는 조건 수와 결합을 돌려 읽는 줄이 줄고 느는 것을 쥐고, 형제 `bitwiseCombine` 은 비트 줄 둘의 AND 한 번을
 * 쥔다. 이쪽은 **인덱스가 무엇을 적어 두는가** — 값마다 비트 줄 하나, 자리마다 1 은 정확히 하나 — 를 쥔다. 그래서 definition 은
 * distinct value · sets a 1 at its position · exactly one 을 독점하고, AND · OR · 조건 · 읽는 줄은 쓰지 않는다.
 *
 * 전제 (설명 글 `bitPerRow.md`): 예로 정한 데이터 · 비트 줄 차례는 값의 사전순, 자리는 줄 번호 차례(첫 자리 `r1`) · NULL 없는 열 ·
 * 비트 줄을 읽거나 섞는 일, 압축은 다루지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bitPerRowConcept: FacetConceptSource = {
  id: 'bitPerRow',
  label: 'Bitmap Index Stores One Bit per Row per Value',
  canonicalFacet: 'facet:bitPerRow',

  surface: {
    definition:
      'A bitmap index on a column keeps one bit string per distinct value; each row sets a 1 at its own position in its value\'s string and 0 in the others, so every position holds exactly one 1.',
    exemplarKeywords: [
      'how a bitmap index is stored',
      'bitmap per distinct value',
      'bit vector index',
      'one-hot encoding of a column',
      'low cardinality column',
      'status column index',
      'bitmap index size grows with distinct values',
      'building a bitmap index',
      'column cardinality',
    ],
  },

  briefing: {
    observable: [
      'The table `orders` has ten rows `r1` to `r10`; the indexed column is `status` with values `paid`, `pending` and `shipped`. "Column status: one empty bit row per value." Three empty bit rows stand under "Bit rows", ordered by value, their positions in row order with the first position for `r1`.',
      'One row per step leaves the table, crosses to its position and passes down through the three bit rows, leaving one character in each: "r1 holds paid: 1 in the paid bit row, 0 in the others."',
      'After all ten rows the bit rows read `paid` 1001100101, `pending` 0100001000, `shipped` 0010010010, with "Ones" 5, 2 and 3.',
      'Read down any one position and exactly one of the three bits is 1, because each row has one value. The last caption reads "Ones: 5 + 2 + 3 = 10. Rows: 10. Bits: 3 × 10 = 30".',
      'The data is an invented example and the column has no NULLs. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the ten rows by itself, one row per step, and stops on the final tally.',
        'A Replay button and a playback strip sit below it. Holding any row\'s step shows one 1 written and two 0s written in the same column position.',
      ],
    },

    useWhen: [
      'The article introduces bitmap indexes and needs to show what the index physically contains: one bit string per value, one position per row.',
      'A reader asks why bitmap indexes are recommended only for columns with few distinct values; the index here grows by a whole row-length string for each value.',
    ],

    avoidWhen: [
      'The article is about answering a query with bitmaps or combining them with AND and OR. Nothing is read or combined here.',
      'The subject is bitmap compression. Bit strings are shown in full.',
      'The point is bit manipulation in general programming. The bits here are an index over table rows.',
    ],

    contrastWith: [
      {
        concept: 'bitmapIndex',
        note: 'Writing one bit per row per value is the storage format; the payoff comes when a query with several conditions combines those bitmaps and reads only the rows that survive.',
      },
      {
        concept: 'bitwiseCombine',
        note: 'Building the bit strings happens once per row as data arrives; combining them happens once per query across the whole string.',
      },
      {
        concept: 'bloomFilter',
        note: 'A Bloom filter hashes many keys into one shared bit array and can give false positives; a bitmap index gives each value its own string with a dedicated position per row, so nothing overlaps.',
      },
    ],
  },
};
