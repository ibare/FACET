/**
 * setOfRows 개념 선언.
 *
 * canonical facet 은 `facet:setOfRows` — 릴레이션 `parts`(part_no · color) 네 줄을 차례 A(P1 · P2 · P3 · P4)에서
 * 차례 B(P3 · P1 · P4 · P2)로 옮겨 앉힌다. 모음으로 견주면 A 의 줄이 B 에 4/4 · B 의 줄이 A 에 4/4 → 같다. 이미 있는 줄
 * P2 blue 를 한 번 더 넣으면 같은 줄에 포개져 줄 수 4 → 4. 걸음 다섯, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 형제 `rowIsAFact` 는 줄 하나의 뜻(사실 · 없는 줄은 거짓)을 말한다. 이쪽은 **줄들의 모음** — 차례와 겹침이 뜻을
 * 바꾸지 않는다는 것을 쥔다. 그래서 definition 은 unordered · reordered · duplicate · row count unchanged 를 독점하고,
 * proposition · true · false · key 를 쓰지 않는다.
 *
 * 전제 (설명 글 `setOfRows.md`): 관계 모형의 릴레이션 이야기다. SQL 표는 키나 고유 제약이 없으면 같은 줄을 둘 담을 수
 * 있다(다중 모음 — DISTINCT · UNION 과 UNION ALL 의 구분이 그래서 있다). 줄 차례는 SQL 에서도 ORDER BY 없이는 약속되지
 * 않는다. 차례 B 는 데이터로 정한 것이고 난수가 아니다. 화면은 이 전제를 각주로 달지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const setOfRowsConcept: FacetConceptSource = {
  id: 'setOfRows',
  label: 'A Relation Is a Set of Rows (Order and Duplicates Do Not Count)',
  canonicalFacet: 'facet:setOfRows',

  surface: {
    definition:
      'A relation is an unordered set of rows: the same rows listed in a different order form an equal relation, and inserting a row already present merges with it, leaving the row count unchanged.',
    exemplarKeywords: [
      'relation',
      'relation as a set',
      'rows have no order',
      'duplicate rows',
      'set vs multiset (bag) semantics',
      'ORDER BY is needed for order',
      'DISTINCT',
      'UNION vs UNION ALL',
      'relational model set theory',
    ],
  },

  briefing: {
    observable: [
      'Relation `parts` with columns `part_no` and `color`. On the left, "Order A": P1 red, P2 blue, P3 red, P4 green, with seat numbers 1 to 4. On the right, "Order B" stands empty with its own seats 1 to 4. The caption reads "The rows of the relation, listed in order A."',
      'Each row of A lifts a copy and moves to its seat in B — P1 from 1 to 2, P2 from 2 to 4, P3 from 3 to 1, P4 from 4 to 3: "The same rows take their seats in order B."',
      'The two collections are compared row by row, where equal rows have equal values in every column: "Rows of A found in B: 4/4 · Rows of B found in A: 4/4 · Same relation as A". Seat numbers play no part in the comparison.',
      'An existing row `P2 blue` is inserted once more ("Inserted once more: P2 blue"), lands on the equal row and becomes one with it: "It lands on the equal row and becomes one. Rows: 4 → 4 · Same relation as A".',
      'This is the relational model\'s relation. An SQL table without a key or unique constraint can hold the same row twice (a multiset), which is why DISTINCT and UNION versus UNION ALL exist; SQL also promises no row order without ORDER BY. Order B is fixed data, not a random shuffle. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays its five steps by itself and stops with the row count still 4.',
        'A Replay button and a playback strip sit below it. Holding the move step shows the same four rows sitting in different seats in the two columns.',
      ],
    },

    useWhen: [
      'The article states that a relation has no row order and no duplicates, and needs both shown on one small relation instead of asserted.',
      'A reader relies on the order rows were inserted in; seeing a reordered copy judged equal row for row makes the point that the order was never part of the data.',
    ],

    avoidWhen: [
      'The article is about sorting results with ORDER BY or about how an engine stores rows physically. Neither appears.',
      'The subject is SQL\'s duplicate-row behaviour, such as bag semantics or UNION ALL. The screen follows the set model; SQL\'s difference is only a premise.',
      'The point is keys or constraints rejecting a duplicate. No key is declared; the duplicate simply merges.',
    ],

    contrastWith: [
      {
        concept: 'rowIsAFact',
        note: 'Seeing a relation as a set concerns the collection: its order and repeats carry no information. Seeing a row as a fact concerns one row\'s meaning, and explains why a repeat adds nothing.',
      },
      {
        concept: 'primaryKeyIdentifies',
        note: 'A declared key forbids two rows sharing a key value even when other columns differ. Set semantics only merges rows that are equal in every column.',
      },
      {
        concept: 'relationalTablesAndKeys',
        note: 'Tables drawn as grids suggest rows with positions. The set view says those positions are presentation, and that the rows are identified by their values alone.',
      },
    ],
  },
};
