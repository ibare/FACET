/**
 * bitwiseCombine 개념 선언.
 *
 * canonical facet 은 `facet:bitwiseCombine` — 표 `members` 줄 열둘, 질의 `SELECT * FROM members WHERE region = 'north' AND plan = 'pro'`.
 * 두 비트 줄 `101100100101` · `011000111001` 을 AND 한 번으로 포개 `001000100001`, 남은 1 의 자리 `r3` · `r7` · `r12` 셋만
 * 표에서 읽고 나머지 아홉 줄은 끝까지 열리지 않는다. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `bitmapIndex` 는 조건을 하나씩 더하며 AND 는 좁히고 OR 는 넓히는 두 방향을 쥔다. 이쪽은 **포개기가 비트 줄 전체에 걸린
 * 한 번의 연산이고, 남은 자리만 표에서 열린다**는 한 장면을 쥔다. 그래서 definition 은 single bitwise AND · whole string at once ·
 * both 1 · never opened 를 독점하고, 조건 수를 늘린다 · OR 가 넓힌다 · 읽은 비트 는 쓰지 않는다.
 *
 * 전제 (설명 글 `bitwiseCombine.md`): 예로 정한 데이터 · 두 비트 줄은 이미 있는 인덱스(만드는 과정은 다루지 않는다) · 맨 왼쪽 비트가
 * `r1` · 열두 비트를 정수 하나로 보면 2853 & 1593 = 545 · OR 였다면 1 이 아홉 — 화면은 AND 만 보인다 · SQL 은 그대로 쓴 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bitwiseCombineConcept: FacetConceptSource = {
  id: 'bitwiseCombine',
  label: 'Two Bitmaps Combined in One AND',
  canonicalFacet: 'facet:bitwiseCombine',

  surface: {
    definition:
      'Two conditions each backed by a bitmap are resolved together by one bitwise AND over the whole bit strings; only positions where both are 1 survive, and every other table row is never opened.',
    exemplarKeywords: [
      'bitmap AND',
      'combining two bitmap indexes',
      'bitwise AND of bit vectors',
      'filtering on two columns with bitmaps',
      'BitmapAnd in EXPLAIN',
      'index intersection',
      'rows skipped by bitmap filtering',
      'word-at-a-time bit operations',
    ],
  },

  briefing: {
    observable: [
      'The query is `SELECT * FROM members WHERE region = \'north\' AND plan = \'pro\'` over a table of twelve rows. "One bit string per condition. The leftmost bit is the first row." — `region = \'north\'` 101100100101 and `plan = \'pro\'` 011000111001, six 1s each.',
      'The two strings slide together and are overlaid in one step, not position by position: "The strings are laid over each other in a single AND. Bits still 1: 3" — the result is 001000100001.',
      'Lines run only from the surviving 1s down to the table: "Only the rows under a 1 are read: r3, r7, r12".',
      'The end reads "Rows read: 3 / 12 · Rows never opened: 9". The other nine rows stay closed from start to finish.',
      'The data is an invented example and the two bit strings are given as an existing index. Viewing the twelve bits as a whole number, the combination is the single operation 2853 & 1593 = 545. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the combination by itself — start, overlay, read, tally — and stops on the tally.',
        'A Replay button and a playback strip sit below it. Holding the overlay step shows both strings stacked with the result under them before any table row is touched.',
      ],
    },

    useWhen: [
      'The article explains how a database answers two conditions at once from two bitmap indexes, and needs the point that it is one operation over the whole bitmap rather than a check per row.',
      'A reader wants to see the rows that are never read; the nine unopened rows beside three read ones make the saving concrete.',
    ],

    avoidWhen: [
      'The article is about OR conditions or how the result changes as more conditions are added. Only one AND of two conditions is shown.',
      'The subject is how the bit strings are built from the table. They are given from the start.',
      'The point is bitwise operators on integers for their own sake. The bits here select table rows.',
    ],

    contrastWith: [
      {
        concept: 'bitmapIndex',
        note: 'A single AND of two bitmaps is the basic move; repeated over more conditions it keeps narrowing the rows fetched, while OR would widen them instead.',
      },
      {
        concept: 'bitPerRow',
        note: 'The bit strings have to exist before they can be combined; building them is per row, combining them is per query.',
      },
      {
        concept: 'bitwiseOps',
        note: 'Bitwise AND on machine words is the operation; applying it to row bitmaps is what lets a database filter on two columns without reading the rows that fail.',
      },
    ],
  },
};
