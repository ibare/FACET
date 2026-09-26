/**
 * allDataInLeaves 개념 선언.
 *
 * canonical facet 은 `facet:allDataInLeaves` — `id` 열의 B+ 트리 `users_pkey` (뿌리 R · 가운데 I1 I2 I3 · 잎 L1..L6).
 * 안쪽 페이지의 값 칸은 빈 점선이고 잎만 `name` 을 쥔다. 찾기 셋 — 60(뿌리에서 곧바로 보인다) · 45(가운데 층에서 보인다) ·
 * 22(잎에서야 보인다) — 모두 세 페이지를 읽어 잎에서 값(Ivy · Gus · Dan)을 쥔다. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 형제 `leavesLinked` 는 범위를 잎 사슬로 훑는 걸음, 이쪽은 **한 열쇠 찾기가 위층에서 열쇠를 이미 만나도 멈추지 않는다**는
 * 것을 쥔다. 그래서 definition 은 inner pages · routing copies · separator · no row data · keeps descending 을 독점하고,
 * 범위 · 옆으로 · 이음은 쓰지 않는다.
 *
 * 전제 (설명 글 `allDataInLeaves.md`): 예로 정한 트리 · 가름 열쇠 규칙 `k ≥ s → 오른쪽` · 페이지 하나 읽기 = 1, 다시 읽으면
 * 다시 센다 · 트리 짓기는 다루지 않는다 · 안쪽 노드에 값을 두는 B-Tree 와의 차이는 설명 글이 말하고 화면은 B+ 트리 하나만 보인다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const allDataInLeavesConcept: FacetConceptSource = {
  id: 'allDataInLeaves',
  label: 'B+ Tree Values Live Only in the Leaves',
  canonicalFacet: 'facet:allDataInLeaves',

  surface: {
    definition:
      'In a B+ tree, keys on inner pages are routing copies that carry no row data, so a lookup keeps descending past a matching separator key until the leaf, making every search the same depth.',
    exemplarKeywords: [
      'B+ tree vs B-tree',
      'internal nodes store only keys',
      'separator keys',
      'data stored only in leaf nodes',
      'why B+ tree search always reaches a leaf',
      'higher fanout from key-only inner nodes',
      'clustered index leaf pages',
      'primary key index lookup',
      'InnoDB clustered index',
    ],
  },

  briefing: {
    observable: [
      'The index `users_pkey` on column `id` has three levels: root `R` (30, 60), middle pages `I1` (15), `I2` (45), `I3` (75), and leaves `L1` to `L6`, each leaf holding two whole rows with `id` and `name`. Every page has a lower value row; on inner pages that row is an empty dashed box.',
      'Search `WHERE id = 60`: at `R` the caption reads "60 is on this page, but no value is stored here. Next page: I3." The search follows the right-hand branch of 60 to `I3`, then `L5`: "Leaf L5: the row is here. Value: Ivy."',
      'Search `WHERE id = 45`: "No 45 on this page. Next page: I2." at the root, then 45 is seen on `I2` without a value, and the value `Gus` is taken at `L4`.',
      'Search `WHERE id = 22`: 22 appears only when leaf `L2` is reached, which gives `Dan`.',
      'All three searches read 3 pages ("Pages read" rises by 3 each time). A ruler on the right keeps one column per search, its rows level with the tree\'s levels: a red ring marks "key seen, no value" (60 on the top row, 45 on the middle row), a filled dot marks "value", and all three dots sit on the bottom row. The inner keys 15, 30, 45, 60 and 75 each appear once more in a leaf.',
      'The tree is an invented example; at an inner page a key equal to or greater than the separator goes right, so meeting an equal key never stops the search. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the three searches by itself, one page per step, and stops after the third reaches its leaf.',
        'A Replay button and a playback strip sit below it. Holding the first step of the search for 60 shows the key found on the root with an empty value box beneath it.',
      ],
    },

    useWhen: [
      'The article explains the difference between a B-tree and a B+ tree and needs to show that finding a key in an upper level is not enough — the value is only at the bottom.',
      'A reader wonders why every primary-key lookup in a B+ tree costs the same number of page reads regardless of where the key first appears.',
    ],

    avoidWhen: [
      'The article is about range scans or following leaf-to-leaf links. Each search here stops at one leaf.',
      'The subject is B+ tree insertion, splitting or how the separator keys got there. The tree is fixed.',
      'The point is a B-tree that stores values in inner nodes and can stop early. Only the B+ layout is shown.',
    ],

    contrastWith: [
      {
        concept: 'leavesLinked',
        note: 'Holding values only in the leaves decides where a single search ends; linking those leaves decides how a range continues from there.',
      },
      {
        concept: 'indexChoice',
        note: 'The fixed descent to a leaf is the fixed part of a B+ tree\'s cost; whether that cost beats another access path depends on how many rows the query then fetches.',
      },
      {
        concept: 'bTree',
        note: 'A B-tree keeps a value with every key, so a search can stop at whichever level it finds the key; a B+ tree gives that up to fit more keys per inner page and keep the tree shallower.',
      },
    ],
  },
};
