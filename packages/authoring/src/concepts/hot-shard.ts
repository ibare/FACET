/**
 * hotShard 개념 선언.
 *
 * canonical facet 은 `facet:hotShard` — 표 `orders` 를 `order_id` 구간으로 샤드 셋에 나눴다(1 – 400 · 401 – 800 · 801 – ∞).
 * 있던 줄 열둘이 넷씩 고르게 서 있고, 자동 증가 번호 1191 .. 1198 인 새 줄 여덟이 하나같이 샤드 2 로 간다. 끝에 있는 줄
 * 4 · 4 · 12, 새 쓰기 0 · 0 · 8. 열 걸음, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `sharding` 은 해시와 구간을 맞바꾸고 범위 질의까지 잰다. 이쪽은 **구간 + 늘 커지는 번호 = 한 샤드만 쓰기를 받음**
 * 한 장면이다. 그래서 definition 은 monotonically increasing · auto-increment · last, open-ended range · no writes 를
 * 독점하고, 해시 · 범위 질의 · 연 샤드 · 조회는 쓰지 않는다.
 *
 * 전제 (설명 글 `hotShard.md`): 표와 번호는 예. 구간은 양 끝 포함. 쏠림은 커지는 번호 탓만이 아니라 인기 있는 열쇠 하나로도
 * 생기지만 여기서는 앞의 것만 보인다. 쏠림을 푸는 쪼개기 · 옮기기는 다루지 않는다. 코드 패널은 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const hotShardConcept: FacetConceptSource = {
  id: 'hotShard',
  label: 'Hot Shard (Increasing Keys Under Range Sharding)',
  canonicalFacet: 'facet:hotShard',

  surface: {
    definition:
      'With range sharding on a monotonically increasing key such as an auto-increment id, every new row lands in the last, open-ended range, so one shard takes all inserts while the others receive no writes.',
    exemplarKeywords: [
      'hot shard',
      'write hotspot',
      'auto-increment shard key',
      'monotonically increasing key',
      'timestamp as shard key',
      'uneven write load',
      'hot partition',
      'HBase region hotspotting',
      'sequential key skew',
    ],
  },

  briefing: {
    observable: [
      'Three shard columns carry their ranges: "Shard 0 · 1 – 400", "Shard 1 · 401 – 800", "Shard 2 · 801 – ∞", each with "Rows" and "New writes" counters. Twelve existing rows sit four per shard (120 · 250 · 310 · 395 | 430 · 590 · 700 · 780 | 820 · 910 · 1050 · 1190), and a dashed line marks that equal height.',
      'A counter reads "Next order_id in orders: 1191". The key is auto-increment: each new number is the largest so far plus one.',
      'Eight new rows arrive one per step, "New row, order_id 1191 → shard 2" through 1198. Every one is 801 or more, so every one goes to Shard 2; only that column rises above the dashed line while the other two stay at their starting height.',
      'The last step counts the new writes: "New writes on shard 2: 8 / 8 · other shards: 0". At the end Rows read 4 · 4 · 12 and New writes 0 · 0 · 8. Ten steps in all.',
      'The table and numbers are examples, and ranges include both ends. Skew can also come from one popular key rather than growing numbers, and splitting or moving shards to relieve it is not shown. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the ten steps by itself and stops after the write count.',
        'A Replay button and a playback strip sit below it. Holding the first step shows the evenly split existing rows; holding the last shows the single column above the dashed line.',
      ],
    },

    useWhen: [
      'The article warns against using an auto-increment id or a timestamp as the range shard key, and needs the case where the table looks balanced yet every new insert goes to one server.',
      'A reader distinguishes stored data from incoming load: the Rows counts can look acceptable while New writes show 8 on one shard and 0 on the others.',
    ],

    avoidWhen: [
      'The article compares hash and range sharding side by side or is about range scans. Only range placement is shown and no query is sent.',
      'The subject is a single popular key or celebrity-user skew. The skew here comes from increasing numbers.',
      'The point is how to fix a hotspot by splitting, salting or rebalancing. Nothing is moved.',
    ],

    contrastWith: [
      {
        concept: 'sharding',
        note: 'All inserts landing on one shard is the cost of range placement for growing keys; the full trade-off sets that cost against range scans that stay on a single shard, and against hashing which spreads inserts but scatters scans.',
      },
      {
        concept: 'splitByKey',
        note: 'A hash of the key spreads consecutive numbers across shards; a range keeps consecutive numbers together, which is exactly why new ones all arrive at the same place.',
      },
    ],
  },
};
