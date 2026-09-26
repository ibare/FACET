/**
 * leftmostPrefix 개념 선언.
 *
 * canonical facet 은 `facet:leftmostPrefix` — 표 `people` 줄 열둘, 인덱스 `people_name_idx` 는 `(last_name, first_name)`
 * 사전순 항목 열둘. 질의 셋을 차례로 — `last_name = 'Kim'` (훑은 4 · 맞음 3) · `last_name = 'Kim' AND first_name = 'Mina'`
 * (2 · 1) · `first_name = 'Mina'` (12 · 4). 앞 둘은 이어진 짧은 구간, 셋째는 인덱스 전체에 흩어진다. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `compositeIndex` 는 열 차례를 뒤집어 싼 질의와 비싼 질의가 자리를 바꾸는 것을 쥔다. 이쪽은 **하나로 박힌 인덱스에서
 * 앞 열이 주어져야만 곧장 짚을 수 있다**는 규칙을 쥔다. 그래서 definition 은 leading column · jump in · scattered · every entry 를
 * 독점하고, 열 차례를 바꾼다 · 다시 늘어선다 · 자리를 바꾼다 는 쓰지 않는다.
 *
 * 전제 (설명 글 `leftmostPrefix.md`): 예로 정한 데이터 · 첫 맞는 항목을 짚는 비용(트리 내려가기)은 세지 않는다 · 멈춘 항목도
 * 훑은 항목에 든다 · 실제 데이터베이스는 셋째 경우 표 전체 훑기나 인덱스 전체 훑기를 고르기도 한다 · SQL 은 그대로 쓴 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const leftmostPrefixConcept: FacetConceptSource = {
  id: 'leftmostPrefix',
  label: 'Leftmost Prefix Rule of a Composite Index',
  canonicalFacet: 'facet:leftmostPrefix',

  surface: {
    definition:
      'A (last_name, first_name) index can jump straight to matches only when the query gives the leading column; a condition on first_name alone matches entries scattered through the sort order, so every entry is read.',
    exemplarKeywords: [
      'leftmost prefix rule',
      'leading column of an index',
      'why is my composite index not used',
      'index on last name and first name',
      'querying the second column of an index',
      'index prefix matching',
      'MySQL leftmost prefix',
      'full index scan',
      'phone book ordering',
    ],
  },

  briefing: {
    observable: [
      'The index `people_name_idx` lays out twelve entries sorted by `(last_name, first_name)`: "Index entries in last_name, first_name order." Each box is one entry with its row (`r7`, `r2` …) and its position 1 to 12 underneath — from `Choi Ara` at 1 to `Yoon Seo` at 12.',
      '`SELECT * FROM people WHERE last_name = \'Kim\'`: "leading column last_name is given, so the search can jump in." It jumps to position 4, reads the `Kim` block at 4–6, and stops at position 7 (`Lee Bo`): "jumped to entry 4 and stopped at entry 7." Entries scanned 4, matches 3 (`r4`, `r9`, `r1`).',
      '`… WHERE last_name = \'Kim\' AND first_name = \'Mina\'` narrows further inside the block: "inside entries 4–6, jumped to entry 5 and stopped at entry 6." Scanned 2, matches 1 (`r9`).',
      '`… WHERE first_name = \'Mina\'`: "leading column last_name is not given, so there is nowhere to jump in." `Mina` sits at positions 3, 5, 9 and 11, so the scan reads every entry from 1 to 12. Scanned 12, matches 4.',
      'Three ledger lines at the bottom keep each query\'s result — "Scanned: 4 · Matches: 3", "Scanned: 2 · Matches: 1", "Scanned: 12 · Matches: 4" — with its scanned and matched positions marked: the first two are short contiguous stretches, the third covers the whole index.',
      'The data is an invented example; the cost of finding the first matching entry through the tree is not counted, only entries read after it. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the three queries by itself, two steps each, and stops after the third scan.',
        'A Replay button and a playback strip sit below it. Moving between the first and third query shows a four-entry stretch against a scan of all twelve, with the matches for `Mina` spread across the index.',
      ],
    },

    useWhen: [
      'The article explains why an index on `(last_name, first_name)` does not help a search by first name alone, and needs the scattered positions of the matches to show why.',
      'A reader is told about the "leftmost prefix" rule and needs to see that adding the second column narrows inside the first column\'s block rather than on its own.',
    ],

    avoidWhen: [
      'The article compares two different column orders for the same columns. The index order here is fixed.',
      'The subject is the page reads of descending a B-tree. Only entries scanned after the jump are counted.',
      'The point is single-column indexes or full-text search on names. The index here is a two-column sorted list.',
    ],

    contrastWith: [
      {
        concept: 'compositeIndex',
        note: 'The prefix rule holds for any one index; picking the column order is the design decision that decides which queries the rule will favour.',
      },
      {
        concept: 'binarySearch',
        note: 'Jumping to the first match works because the entries are sorted by the leading column; a condition on a later column is not sorted globally, so there is nothing to search by halving.',
      },
    ],
  },
};
