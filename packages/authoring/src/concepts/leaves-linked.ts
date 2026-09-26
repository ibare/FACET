/**
 * leavesLinked 개념 선언.
 *
 * canonical facet 은 `facet:leavesLinked` — B+ 트리 `orders_price_idx`(뿌리 R · 안쪽 I1 I2 · 잎 L1..L6) 에서
 * `SELECT * FROM orders WHERE price BETWEEN 22 AND 60` 을 푼다. 아래 끝 22 로 R → I1 → L2 까지 한 번 내려가고, 그 뒤로는
 * 잎의 이음을 따라 L3 → L4 → L5 로 옆으로 건너가 L5 의 66 에서 멈춘다. 읽은 페이지 6 (내려가기 3 · 옆으로 3), 잡은 열쇠 열.
 * 부모가 다른 L3 → L4 도 위로 올라가지 않는다. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `indexChoice` 는 같은 질의를 세 길에 걸어 가장 싼 길을 고른다. 형제 `allDataInLeaves` 는 한 열쇠 찾기가 왜
 * 잎까지 가는지, 이쪽은 **범위 하나를 훑는 걸음의 모양** — 한 번 내려가고 옆으로 — 을 쥔다. 그래서 definition 은
 * descends once · sibling pointers · sideways · lower bound · upper bound 를 독점하고, 값 · 사본 · 가름 열쇠 · 비용 견줌은 쓰지 않는다.
 *
 * 전제 (설명 글 `leavesLinked.md`): 예로 정한 트리 · 한 걸음 = 페이지 하나 읽기(옆 잎으로 건너가는 것도) · 캐시 없음 ·
 * 페이지 안의 열쇠 견줌은 세지 않는다 · 트리 짓기와 표의 줄을 실제로 읽어 오는 일은 다루지 않는다 · SQL 은 그대로 쓴 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const leavesLinkedConcept: FacetConceptSource = {
  id: 'leavesLinked',
  label: 'B+ Tree Range Scan Along Linked Leaves',
  canonicalFacet: 'facet:leavesLinked',

  surface: {
    definition:
      'A B+ tree answers a range by descending from the root only once, to the leaf holding the lower bound, then following sibling-leaf pointers sideways until a key exceeds the upper bound.',
    exemplarKeywords: [
      'B+ tree range query',
      'BETWEEN on an indexed column',
      'leaf node linked list',
      'sibling pointers between leaves',
      'index range scan',
      'B+Tree leaf chain',
      'why B+ trees suit range queries',
      'sequential leaf traversal',
      'InnoDB index range scan',
    ],
  },

  briefing: {
    observable: [
      'The index `orders_price_idx` stands as a three-level tree: root `R` (key 42), inner pages `I1` (18, 30) and `I2` (55, 71), and six leaves `L1` to `L6`, each leaf holding keys with their row positions (`r1`, `r15` …) and pointing to the next leaf. The query is `SELECT * FROM orders WHERE price BETWEEN 22 AND 60`.',
      '"Start at the root and look for the leaf where 22 belongs." Then "Read R. Key 22 leads down to I1.", "Read I1. Key 22 leads down to L2.", and "Reached leaf L2. Keys below 22 are passed over." — 18 is skipped, 22 and 27 are picked.',
      'From here the reading moves along the leaf links: "Over to the next leaf by its link: L3" picks 30, 34, 39. Moving to `L4`, whose parent is `I2` rather than `I1`, the caption reads "A different parent, yet no climb back up. Straight across: L4".',
      '`L4` gives 42, 47, 51 and `L5` gives 55 and 60; then "Leaf L5: 66 > 60, so stop here." `L6` is never read.',
      'Readouts count "Down: 3", "Sideways: 3", "Pages read: 6" and "Picked: 10" — the ten keys 22 to 60 with rows `r1` · `r15` · `r6` · `r13` · `r3` · `r17` · `r8` · `r12` · `r5` · `r16`. Without the links, finding the four leaves separately from the root would have cost twelve reads.',
      'The tree is an invented example; one step is one page read, a sideways move included; there is no cache; comparisons inside a page are not counted. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the scan by itself, one page per step, and stops at `L5`.',
        'A Replay button and a playback strip sit below it. Holding the step that crosses from `L3` to `L4` shows the reading moving between leaves of different parents without touching `I1`, `I2` or `R` again.',
      ],
    },

    useWhen: [
      'The article explains why a B+ tree handles `BETWEEN` and `>` / `<` queries well, and needs the concrete path: one descent, then leaf after leaf along the chain.',
      'A reader imagines each key in a range being looked up from the root separately; the down-3, sideways-3 count against twelve independent lookups corrects that picture.',
    ],

    avoidWhen: [
      'The article is about how a B+ tree grows, splits or rebalances on insert. The tree here is fixed.',
      'The subject is a single-key equality lookup. The query here is a range.',
      'The point is comparing an index scan against a table scan or another index. Only the B+ tree is shown.',
    ],

    contrastWith: [
      {
        concept: 'indexChoice',
        note: 'The linked-leaf walk is how one index serves a range; choosing among indexes asks when that walk is still cheaper than scanning the table outright.',
      },
      {
        concept: 'allDataInLeaves',
        note: 'Both concern the B+ tree\'s leaf level. Keeping values only in leaves explains why every search ends there; linking the leaves explains why a range can continue there without climbing.',
      },
      {
        concept: 'bTree',
        note: 'A classic B-tree keeps values in inner nodes and has no leaf chain, so a range needs an in-order walk up and down the tree; a B+ tree trades that for a flat chain at the bottom.',
      },
    ],
  },
};
