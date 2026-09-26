/**
 * allPairs 개념 선언.
 *
 * canonical facet 은 `facet:allPairs` — `sizes`(S · M · L)와 `colors`(red · blue · green · black)를 `CROSS JOIN` 으로 잇는다.
 * 조건이 없어 sizes 한 줄이 colors 네 줄로 한꺼번에 가지를 뻗고, 결과가 4 · 8 · 12 로 불어난다. 걸음 넷, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `joinKinds` 에서 CROSS 는 다섯 종류 가운데 하나다. 이쪽은 **조건이 없으면 몇 줄이 나오는가** 하나를 쥔다 —
 * 두 줄 수의 곱. 그래서 definition 은 no condition · every row · product · Cartesian product 를 독점하고, 짝 없는 줄 ·
 * NULL · 종류 사이 견줌을 쓰지 않는다.
 *
 * 전제 (설명 글 `allPairs.md`): 결과 줄 차례는 sizes 차례, 그 안에서 colors 차례(ORDER BY 가 없어 약속이 아니다) ·
 * 표와 값은 예로 정한 것 · SQL 은 그대로 쓴 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const allPairsConcept: FacetConceptSource = {
  id: 'allPairs',
  label: 'CROSS JOIN Makes Every Pair',
  canonicalFacet: 'facet:allPairs',

  surface: {
    definition:
      'A CROSS JOIN has no condition, so every row of one table pairs with every row of the other and the result size is the product of the two row counts — the Cartesian product.',
    exemplarKeywords: [
      'CROSS JOIN',
      'Cartesian product',
      'cartesian join',
      'missing join condition',
      'accidental cross join',
      'result explodes to millions of rows',
      'all combinations of two tables',
      'FROM a, b without WHERE',
      'generate every combination in SQL',
    ],
  },

  briefing: {
    observable: [
      'Two tables and a query: `sizes` with three rows (S, M, L), `colors` with four (red, blue, green, black), and `SELECT * FROM sizes CROSS JOIN colors;`. The caption reads "Rows in sizes: 3 · Rows in colors: 4".',
      'One step per sizes row: the row branches out to all four colors rows at once — "Row S pairs with every row of colors at once — new rows: 4" — producing S-red, S-blue, S-green, S-black.',
      'No values are compared; there is no key to check. M and then L do the same, and the result grows 4, 8, 12.',
      'The last step reads "Result rows: 3 × 4 = 12".',
      'Result rows appear in sizes order and then colors order; SQL promises no order without ORDER BY, though the set of pairs is the same in any order. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays four steps by itself — the starting tables, then one sizes row per step — and stops.',
        'A Replay button and a playback strip sit below it. Stepping through shows the result count climbing by four each time, the size of the other table.',
      ],
    },

    useWhen: [
      'The article warns that forgetting a join condition makes a query return rows-times-rows results, and needs the multiplication shown on tables small enough to count.',
      'The article uses CROSS JOIN on purpose to generate every combination — sizes by colors, dates by stores — and wants the reader to see where the count comes from.',
    ],

    avoidWhen: [
      'The article is about joins with a condition, matching on keys or outer joins. No condition is used here.',
      'The subject is how an optimizer avoids or detects Cartesian products. Nothing here plans or rewrites the query.',
      'The point is combinatorics in general, outside SQL. The example is framed entirely as a join of two tables.',
    ],

    contrastWith: [
      {
        concept: 'matchOnKey',
        note: 'A join condition narrows pairing to rows with equal keys; with no condition, pairing is unrestricted and the size becomes a product.',
      },
      {
        concept: 'joinKinds',
        note: 'The conditional join kinds differ in which unmatched rows survive; the unconditional join has no notion of a match, so none of those differences apply.',
      },
      {
        concept: 'keepUnmatched',
        note: 'Outer joins need a condition that some rows fail; a Cartesian product never tests anything, so there is nothing left unmatched.',
      },
    ],
  },
};
