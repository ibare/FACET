/**
 * sharding 개념 선언.
 *
 * canonical facet 은 `facet:sharding` — 표 `orders` 의 있던 줄 1..1000 뒤로 새 줄 열둘(`order_id` 1001..1012)이 들어오고,
 * 가장 최근 여덟(1005..1012)을 번호 범위로 묻는다. 손잡이 둘 — 나누는 법(해시 `order_id mod n` / 구간, 처음 해시) ·
 * 샤드 수(2 · 3 · 4, 처음 3). 해시는 가장 바쁜 샤드 몫 50 · 33 · 25 % 에 연 샤드 2 · 3 · 4, 구간은 몫 100 % 에 연 샤드 1 로
 * 샤드 수를 따라 움직이지 않는다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * 조각 둘은 한 장면씩이다 — 열쇠 셈으로 흩어지고 열쇠 하나 조회가 한 샤드로 곧장 감(`splitByKey`) · 구간 + 커지는 번호 =
 * 한 샤드에만 쌓임(`hotShard`). 이쪽은 **범위 질의와 샤드 수를 더해 두 나누는 법을 맞바꾸는 것**을 쥔다. 그래서 definition 은
 * hash and range · range query · every shard · trade off 를 쥐고, 조각들이 독점한 lookup by that key · single shard ·
 * auto-increment · no writes 를 쓰지 않는다.
 *
 * 전제 (설명 글 `sharding.md`): 해시를 `mod` 로 줄였다(실제로는 열쇠를 해시 함수에 먼저 넣는다). 구간 폭은 있던 번호 범위의
 * 등분이고 마지막 구간은 끝이 없다. 샤드 수를 바꿀 때 있던 줄을 옮기는 재배치(일관 해싱의 이야기)는 다루지 않는다 — 손잡이를
 * 돌리면 빈 기둥에서 새로 시작한다. 코드 패널은 IR 하나를 여섯 언어로 옮긴 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const shardingConcept: FacetConceptSource = {
  id: 'sharding',
  label: 'Sharding (Hash vs Range Partitioning)',
  canonicalFacet: 'facet:sharding',

  surface: {
    definition:
      'Hash and range sharding trade off on sequential keys: hashing spreads new inserts evenly across shards but makes a range query open every shard, while ranges answer it from one shard but concentrate inserts.',
    exemplarKeywords: [
      'horizontal partitioning',
      'hash sharding vs range sharding',
      'choosing a shard key',
      'range query across shards',
      'scatter-gather query',
      'cross-shard query cost',
      'number of shards',
      'MongoDB hashed vs ranged shard key',
      'database partitioning strategy',
      'scaling writes by sharding',
    ],
  },

  briefing: {
    observable: [
      'Shards stand as columns, each with its rule label ("mod 3 = 0" for hash, "1..333" / "334..666" / "667..∞" for range at three shards) and a "Writes" count. The rows 1..1000 already exist; twelve new rows with `order_id` 1001 to 1012 arrive one per step: "New row 1001 → shard 2".',
      'Under Hash the caption reads "Hash split: each new row goes to the shard numbered order_id mod 3." New rows fall into the columns in turn and the columns grow evenly (4 · 4 · 4 at three shards).',
      'Under Range the caption reads "Range split: each shard takes one run of order_id values; the last run has no end." Every new number lands in the last, open-ended run, so a single column rises (0 · 0 · 12).',
      'Then a range query for the most recent eight rows, 1005..1012, is sent: "Range query 1005..1012 · Shards opened: n / total". Under Hash its arrows fan out to every column; under Range one arrow goes to the last column.',
      'The round ends with "Answer rows: 8 · Busiest shard share: p% (Writes: top / 12)". Across the handles: Hash at 2 / 3 / 4 shards gives busiest share 50 / 33 / 25 % and shards opened 2 / 3 / 4; Range gives 100 % and 1 at every shard count. When several shards tie for most writes, all are marked busiest.',
      'Fifteen steps per round. Hashing is reduced to `mod` (real systems hash the key first); range widths are an equal split of the existing 1..1000; shard numbers are names counted from 0. Moving existing rows when the shard count changes is not modelled — each turn of a handle starts from empty columns. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Split by", Hash or Range (starting Hash), and "Shards", 2, 3 or 4 (starting 3). On a change, the previous rows sink to the base, the columns rearrange for the new count, and the new rows fall again under the new rule.',
        'The move that makes the idea land is flipping between Hash and Range at the same shard count: the even columns and the fanned-out query swap for one tall column and a single arrow. Raising the shard count then widens the gap for Hash and leaves Range unchanged.',
        'Readouts under the controls: "Busiest shard %" and "Shards opened".',
        'The code panel, labelled "Routing rows to shards", starts empty with a "+ Add language" button. It shows `routeAll`, which picks each new row\'s shard with `shardOf`, counts writes and counts the shards the range query touches, and `busiestShare`; it carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article is choosing between hash and range partitioning for a table and needs both costs on the same data: how evenly new writes spread and how many shards a range scan must open.',
      'A reader expects that adding shards always helps; showing that more shards lowers the busiest share only under hashing, while also making range queries touch more shards, grounds the decision.',
    ],

    avoidWhen: [
      'The article is about consistent hashing or rebalancing data when shards are added. Existing rows are never moved; each setting starts fresh.',
      'The subject is replication or keeping copies of a shard. Each row lives on exactly one shard.',
      'The point is distributed joins or transactions across shards. Only inserts and one range read on a single table are shown.',
    ],

    contrastWith: [
      {
        concept: 'splitByKey',
        note: 'Computing the shard from the key is what lets a lookup on that key go to one place. Comparing split methods asks what that computation costs for range queries and for sequential inserts.',
      },
      {
        concept: 'hotShard',
        note: 'All inserts piling onto the last range is one side of the trade-off; the other side is that the same ranges let a scan of recent keys stay on a single shard.',
      },
      {
        concept: 'hashToBucket',
        note: 'Reducing a key to one of a fixed number of slots is the same arithmetic in a hash table; across machines the choice of reduction also decides how queries on neighbouring keys spread.',
      },
    ],
  },
};
