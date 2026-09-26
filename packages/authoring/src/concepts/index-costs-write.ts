/**
 * indexCostsWrite 개념 선언.
 *
 * canonical facet 은 `facet:indexCostsWrite` — 같은 표 `users (id, email, city)` 둘을 나란히 둔다. 왼쪽은 인덱스 없음,
 * 오른쪽은 `users_pkey` · `users_email_idx` · `users_city_idx` 셋. 읽기 `SELECT * FROM users WHERE email = 'kai@ex.com'`
 * 은 6 → 3 페이지로 좁혀지고, 쓰기 `INSERT INTO users VALUES (24, 'zoe@ex.com', 'Busan')` 는 1 → 4 페이지로 퍼진다.
 * 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `indexChoice` 는 질의 꼴에 따라 가장 싼 읽기 길이 옮겨 가는 것을 쥔다. 이쪽은 **인덱스가 읽기에 준 것을 쓰기가
 * 되갚는다** — 넣는 줄 하나가 표와 인덱스마다의 잎으로 갈라져 퍼진다 — 를 쥔다. 그래서 definition 은 trade · write
 * amplification 쪽 낱말 · fans out · every index 를 독점하고, 질의 꼴 · 범위 · 해시 · 표 훑기가 이긴다는 말은 쓰지 않는다.
 *
 * 전제 (설명 글 `indexCostsWrite.md`): 페이지 읽기 1 · 쓰기 1 · 캐시 없음 · 표 페이지당 줄 넷 · 세 인덱스 모두 높이 2 인 B+ 트리이고
 * 속은 그리지 않았다 · 잎에 자리가 넉넉해 나눔이 없다 · 자리를 찾느라 읽는 페이지(합쳐 6)는 화면의 수에 넣지 않았다 ·
 * 읽기와 쓰기를 한 수로 합치지 않는다 · SQL 은 그대로 쓴 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const indexCostsWriteConcept: FacetConceptSource = {
  id: 'indexCostsWrite',
  label: 'Indexes Speed Reads but Slow Writes',
  canonicalFacet: 'facet:indexCostsWrite',

  surface: {
    definition:
      'Indexes trade write cost for read speed: a lookup narrows to a few pages, but each inserted row must also be written into a leaf of every index, so one write fans out into several.',
    exemplarKeywords: [
      'index overhead on writes',
      'too many indexes slow down inserts',
      'secondary index maintenance',
      'write amplification from indexes',
      'read vs write tradeoff of indexing',
      'INSERT cost with indexes',
      'over-indexing',
      'should I add another index',
      'OLTP write-heavy table indexing',
    ],
  },

  briefing: {
    observable: [
      'Two copies of the table `users (id, email, city)` stand side by side, 23 rows on six table pages with one free slot on the last. The left is labelled "No index"; the right "Indexes: 3" carries `users_pkey (id)`, `users_email_idx (email)` and `users_city_idx (city)`, each drawn as a Root and a Leaf.',
      '"One read goes to both tables." with `SELECT * FROM users WHERE email = \'kai@ex.com\'`. The left reads every page: "No index: table pages read 1–6. Page of the match: 5" — it cannot stop at the match because nothing promises `email` is unique. The right: "With indexes: users_email_idx root, then leaf, then table page 5." Pages read: 6 on the left, 3 on the right.',
      '"One write goes to both tables." with `INSERT INTO users VALUES (24, \'zoe@ex.com\', \'Busan\')`. The left: "No index: new row → table page 6." Pages written: 1.',
      'The right: "With indexes: the row splits into table page 6 and one leaf per index." The single row branches into four destinations. Pages written: 4.',
      'Reads go 6 → 3 and writes go 1 → 4; the two counts stay separate rather than being added into one cost.',
      'Pages are counted one per read or write with no cache; the leaves have room so no index page splits; finding each index\'s target leaf would also read a root and a leaf per index, which the screen does not count. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays the read and then the write by itself on both tables at once, and stops after the insert.',
        'A Replay button and a playback strip sit below it. Holding the insert step shows one row on the left landing in one place and on the right splitting into four.',
      ],
    },

    useWhen: [
      'The article warns against adding an index to every column and needs a side-by-side count showing the read that got cheaper and the write that got more expensive.',
      'A reader thinks an index is free once created; the single INSERT branching into the table and three index leaves shows the ongoing cost on every write.',
    ],

    avoidWhen: [
      'The article is about page splits, fill factor or index fragmentation. The leaves have room and never split.',
      'The subject is choosing between index types or when an index is skipped for a table scan. All three indexes here are the same kind and the read always uses one.',
      'The point is the internal structure of a B+ tree. The indexes are drawn only as a root and a leaf.',
    ],

    contrastWith: [
      {
        concept: 'indexChoice',
        note: 'The write penalty holds for every index regardless of query; which index pays for itself also depends on which query shapes it speeds up.',
      },
      {
        concept: 'leavesLinked',
        note: 'Reading through an index is one descent and possibly a walk along leaves; writing through it means finding and changing a leaf in every index, one per index.',
      },
      {
        concept: 'bitPerRow',
        note: 'A B+ tree index absorbs a new row as one more leaf entry; a bitmap index must extend every value\'s bit string by one position, one reason bitmap indexes are kept for tables that are rarely written.',
      },
    ],
  },
};
