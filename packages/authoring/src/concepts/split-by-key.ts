/**
 * splitByKey 개념 선언.
 *
 * canonical facet 은 `facet:splitByKey` — 표 `users`(`user_id` | `points`) 의 줄 여덟이 셈 문 `user_id mod 3` 을 하나씩 지나
 * 샤드 0 · 1 · 2 로 흩어진다(3 · 2 · 3 줄). 이어 조회 `user_id = 47` 이 같은 셈으로 47 mod 3 = 2 를 얻어 샤드 2 로만 가고,
 * 그 안에서 (47, 15) 를 찾는다. 들여다본 샤드 1 / 3. 열한 걸음, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `sharding` 은 해시와 구간을 맞바꾸며 범위 질의와 쓰기 몰림을 잰다. 이쪽은 **줄을 보내는 셈과 조회가 같은 셈**이라
 * 열쇠 조회가 샤드 하나로 곧장 간다는 한 장면이다. 그래서 definition 은 key value alone · same computation · single shard ·
 * without asking the others 를 독점하고, 구간 · 범위 질의 · 커지는 번호 · 몫은 쓰지 않는다.
 *
 * 전제 (설명 글 `splitByKey.md`): 데이터는 예. 해시 샤딩을 열쇠 자체의 나머지로 줄였다(실제로는 해시 함수를 먼저 거친다).
 * 샤드 안 차례는 도착 차례. 열쇠가 아닌 열로 찾기 · 샤드 수 변경 · 구간 샤딩은 다루지 않는다. 코드 패널은 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const splitByKeyConcept: FacetConceptSource = {
  id: 'splitByKey',
  label: 'Split Rows by Key (Shard Key Routing)',
  canonicalFacet: 'facet:splitByKey',

  surface: {
    definition:
      'In hash sharding each row\'s shard is computed from its key value alone, and a lookup by that key runs the same computation, so it goes straight to a single shard without asking the others.',
    exemplarKeywords: [
      'shard key',
      'partition key',
      'hash partitioning',
      'key mod N',
      'query routing to a shard',
      'single-shard lookup',
      'how rows are distributed across nodes',
      'key-based partitioning',
    ],
  },

  briefing: {
    observable: [
      'A table labelled "users (user_id | points)" holds eight rows; three empty shards, "Shard 0" to "Shard 2", each show "Rows: 0". A gate between them reads "user_id mod 3". "Rows still together in users: 8."',
      'Rows pass the gate one per step in data order, each with its sum written out: "Row with user_id 58 goes to shard 1." The results are 58 → 1, 23 → 2, 91 → 1, 36 → 0, 47 → 2, 72 → 0, 15 → 0, 80 → 2.',
      'After the eighth row, Shard 0 holds (36, 80) (72, 210) (15, 95), Shard 1 holds (58, 120) (91, 300), Shard 2 holds (23, 45) (47, 15) (80, 60); rows inside a shard sit in arrival order.',
      'A lookup "Lookup user_id = 47" passes the same gate, "47 mod 3 = 2", and "goes straight to shard 2."',
      '"Row found in shard 2: (47, 15). Shards looked into: 1 / 3." The other two shards are never asked. Eleven steps in all.',
      'The data is an example. Real hash sharding feeds the key to a hash function before reducing it to the shard count; here the key itself is reduced with a remainder. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the eleven steps by itself and stops after the row is found.',
        'A Replay button and a playback strip sit below it. Holding the lookup step shows the same `mod 3` sum used for placing rows now sending the query to one shard.',
      ],
    },

    useWhen: [
      'The article introduces sharding and needs to show how a database knows where a row lives: the placement is recomputed from the key, so no directory is searched.',
      'A reader asks why queries that filter on the shard key are cheap in a sharded database; the lookup that visits one shard out of three is the direct picture.',
    ],

    avoidWhen: [
      'The article compares hash and range sharding or discusses range scans. Only one computation and one exact-match lookup appear.',
      'The subject is resharding or consistent hashing when the shard count changes. The count stays at three.',
      'The point is uneven load or hot keys. The eight rows spread without any skew being discussed.',
    ],

    contrastWith: [
      {
        concept: 'sharding',
        note: 'Routing by a computed key is the mechanism; weighing hash against range placement for range queries and sequential inserts is the design decision built on it.',
      },
      {
        concept: 'hotShard',
        note: 'A key computation decides where each row goes; whether rows then spread evenly depends on the keys that arrive and on the placement rule, and sequential keys under ranges do not.',
      },
      {
        concept: 'hashToBucket',
        note: 'Reducing a key to one of a fixed number of slots is the same arithmetic as choosing a bucket in a hash table; applied across machines it tells each query which server holds its row.',
      },
    ],
  },
};
