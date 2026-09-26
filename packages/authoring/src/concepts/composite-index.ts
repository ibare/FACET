/**
 * compositeIndex 개념 선언.
 *
 * canonical facet 은 `facet:compositeIndex` — 표 `movies` 줄 열둘, 인덱스는 줄마다 항목 하나. 손잡이 둘 — 열 차례
 * `(genre, year)` · `(year, genre)` 와 질의 `genre` · `genre + year` · `year`. 열 차례를 돌리면 같은 열두 항목이 새 차례로
 * 다시 늘어서고, `drama` 셋이 모였다가 흩어지고 `2019` 넷이 흩어졌다가 모인다. 훑은 항목: `(genre, year)` 에서 4 · 2 · 12,
 * `(year, genre)` 에서 12 · 2 · 5. 맞은 줄은 3 · 1 · 4 로 열 차례와 무관하다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 하나)
 *
 * 조각 `leftmostPrefix` 는 열 차례가 하나로 박힌 인덱스에서 "앞 열이 없으면 좁혀지지 않는다" 를 쥔다. 이쪽은 **열 차례를
 * 뒤집으면 싼 질의와 비싼 질의가 자리를 바꾼다** — 같은 두 열이 두 인덱스가 된다 — 를 쥔다. 그래서 definition 은 column order ·
 * swapping · re-sorts · trade places 를 쥐고, 조각이 독점한 leading column · leftmost prefix · seek 는 쓰지 않는다.
 *
 * 전제 (설명 글 `compositeIndex.md`): 첫 맞는 항목을 짚는 트리 내려가기는 세지 않는다 · 멈춘 항목도 훑은 항목에 든다 ·
 * 문자열은 바이트 사전순 · 동률이면 먼저 넣은 줄이 앞(이 표에서 걸리지 않는다) · 예로 정한 자료 · SQL 은 그대로 쓴 표기 ·
 * 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이고 문자열 열을 사전순 번호로 바꿔 삽입 정렬로 늘어세운다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const compositeIndexConcept: FacetConceptSource = {
  id: 'compositeIndex',
  label: 'Composite Index Column Order',
  canonicalFacet: 'facet:compositeIndex',

  surface: {
    definition:
      'Column order in a multi-column index decides which queries are cheap: swapping (a, b) to (b, a) re-sorts the entries, so the query that scanned one contiguous block and the query that scanned everything trade places.',
    exemplarKeywords: [
      'composite index',
      'multi-column index',
      'concatenated index',
      'order of columns in an index',
      'index on (a, b) vs (b, a)',
      'which column goes first in an index',
      'compound index design',
      'MySQL composite index column order',
      'covering several WHERE conditions with one index',
    ],
  },

  briefing: {
    observable: [
      'The table `movies` has twelve rows `r1` to `r12`, and the index holds one entry per row. The query SQL and index are set first — e.g. `SELECT * FROM movies WHERE genre = \'drama\'` on `(genre, year)` — and the rows that satisfy WHERE are marked "Meets WHERE".',
      '"Entries lined up in (genre, year) order": the twelve entries slide into sorted order, each carrying its row position (`r5`) and numbered by position ("Pos.").',
      'If the leading column is in the query the search jumps in ("Seek: position 7"); otherwise "Leading column not in WHERE: start at position 1". The scan runs until the first entry whose prefix does not match, which is counted too — "Entries scanned: 4 (positions 7–10)" — and then the matched entries lead to their table rows: "Rows matched: 3".',
      'Swapping the Column order handle re-sorts the same twelve entries: the three `drama` entries that sat together under `(genre, year)` scatter to positions 3, 6 and 9 under `(year, genre)`, while the four `2019` entries that were scattered gather at positions 4–7.',
      'Entries scanned for the queries genre / genre + year / year: 4 / 2 / 12 on `(genre, year)`, 12 / 2 / 5 on `(year, genre)`. Rows matched are 3 / 1 / 4 in both orders — only the scan changes.',
      'Seeking the first matching entry through the tree is not counted; strings compare in byte order; equal sort keys would keep insertion order but none occur. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Column order" `(genre, year)` / `(year, genre)` (starting at `(genre, year)`) and "Query" genre / genre + year / year (starting at genre). Each change replays one round of five steps.',
        'The move that makes the idea land is keeping the query on `genre` and flipping Column order: the drama entries break apart and Entries scanned jumps from 4 to 12; then switch the query to `year` and flip back to see the opposite.',
        'Readouts under the controls: Entries scanned and Rows matched.',
        'The code panel, labelled "Scanning the index", starts empty with a "+ Add language" button and highlights the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article gives advice on ordering the columns of a composite index and needs to show that `(a, b)` and `(b, a)` favour opposite queries on the same data.',
      'A reader asks whether one two-column index can serve every combination of those columns; the scan counts for each order and query show which ones it cannot.',
    ],

    avoidWhen: [
      'The article is about single-column indexes or choosing between index types. Both options here are the same two columns in different order.',
      'The subject is the page-level cost of descending a B-tree. The descent to the first entry is not counted.',
      'The point is index-only or covering scans. Every matched entry goes on to read its table row.',
    ],

    contrastWith: [
      {
        concept: 'leftmostPrefix',
        note: 'The leftmost-prefix rule says which queries one fixed index can narrow; choosing the column order decides which queries get that benefit and which lose it.',
      },
      {
        concept: 'indexChoice',
        note: 'Choosing an index type is about the shape of a condition on one column; ordering a composite index is about which of several columns the queries constrain.',
      },
      {
        concept: 'sortStability',
        note: 'Tie-breaking in a sort is about equal keys; a composite index sorts by the first column and breaks ties with the next, so the second column is ordered only inside each group of the first.',
      },
    ],
  },
};
