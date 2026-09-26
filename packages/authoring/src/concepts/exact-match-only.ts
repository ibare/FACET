/**
 * exactMatchOnly 개념 선언.
 *
 * canonical facet 은 `facet:exactMatchOnly` — 표 `orders` 의 `id` 에 해시 인덱스, 버킷 다섯(h(k) = k mod 5), 열쇠 열.
 * `WHERE id = 38` 은 버킷 3 하나만 열어 1 페이지, `WHERE id BETWEEN 30 AND 50` 은 버킷 다섯을 모두 열어 5 페이지.
 * 맞는 넷(31 · 38 · 44 · 50)이 다섯 버킷 가운데 넷에 흩어져 있다. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `indexChoice` 는 질의가 넓어질 때 해시 → B+ → 표 훑기로 싼 길이 옮겨 가는 것을 쥔다. 이쪽은 **해시가 열쇠의 차례를
 * 흩어 놓는다는 한 까닭** 을 쥔다. 그래서 definition 은 hashing · scatters neighbouring keys · every bucket · equality 를 쥐고,
 * B+ 트리 · 표 훑기 · 가장 싼 길은 쓰지 않는다.
 *
 * 전제 (설명 글 `exactMatchOnly.md`): 예로 정한 데이터와 해시 함수 · 버킷 하나 = 페이지 하나 · 같은 열쇠가 여럿 들 수 있다고 쳐서
 * 버킷 안 항목을 전부 견준다 · 범위 안 정수를 하나씩 해시하는 길은 두지 않았다 — 실제 해시 인덱스는 범위 조건에 쓰이지 않는다 ·
 * 넘침 · 버킷 늘리기는 다루지 않는다 · SQL 은 그대로 쓴 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const exactMatchOnlyConcept: FacetConceptSource = {
  id: 'exactMatchOnly',
  label: 'Hash Index: Only an Exact Match Is Fast',
  canonicalFacet: 'facet:exactMatchOnly',

  surface: {
    definition:
      'A hash index sends an equality lookup straight to one bucket, but hashing scatters neighbouring keys across unrelated buckets, so a range predicate has no bucket to start from and must open every one.',
    exemplarKeywords: [
      'hash index',
      'hash index range query',
      'why hash indexes do not support ranges',
      'equality-only index',
      'hash index cannot serve BETWEEN',
      'bucket lookup',
      'PostgreSQL hash index limitations',
      'MySQL MEMORY engine hash index',
      'hashing destroys key order',
    ],
  },

  briefing: {
    observable: [
      'The header reads "Hash index on orders(id) · h(k) = k mod 5". A middle line lays the ten keys 12, 17, 23, 31, 38, 44, 50, 57, 63, 71 out in value order ("id in order"), and threads drop from each key to its bucket below: Bucket 0 [50], 1 [31, 71], 2 [12, 17, 57], 3 [23, 38, 63], 4 [44]. Neighbours on the line such as 31 and 38 land in buckets 1 and 3.',
      'First query `SELECT * FROM orders WHERE id = 38`: "38 mod 5 = 3: straight to bucket 3." Only bucket 3\'s lid lifts; its three entries are compared and 38 (`r5`) is found. "Only bucket 3 is read. Matches: 1."',
      'Second query `SELECT * FROM orders WHERE id BETWEEN 30 AND 50`: "A hash keeps no order. Keys from 30 to 50 could be in any bucket." The line shows 30–50 as one contiguous stretch, but the buckets open one by one, 0 to 4: "Bucket 1 read. Matches in it: 1."',
      'Each match rises back to its place on the ordered line — 50 from bucket 0, 31 from 1, 38 from 3, 44 from 4; bucket 2 is read and gives nothing. "Buckets holding a match: 4 of 5."',
      'The end sets the two side by side: "Pages read: 1 for =, 5 for the range." A tally line tracks each query separately — "Pages read: 1 · Entries compared: 3 · Matches: 1" for the lookup, ending at "Pages read: 5 · Entries compared: 10 · Matches: 4" for the range.',
      'The data and hash function are an invented example; one bucket is one page; hashing each integer from 30 to 50 separately is deliberately left out, since real databases simply do not use a hash index for range conditions. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays both queries by itself, one bucket per step for the range, and stops on the side-by-side page counts.',
        'A Replay button and a playback strip sit below it. Holding the range step where bucket 2 opens with no match shows the cost of not knowing where the keys went.',
      ],
    },

    useWhen: [
      'The article states that hash indexes only help equality conditions and needs the reason made visible: keys adjacent in value end up in unrelated buckets.',
      'A reader asks why a hash lookup is one page for `=` yet the same index is useless for `BETWEEN`; the 1 versus 5 page counts on one index answer it.',
    ],

    avoidWhen: [
      'The article is about hash table collision handling, load factor or resizing. There are no overflows or rehashing here.',
      'The subject is comparing a hash index with a B-tree or a table scan across many query shapes. Only the hash index appears.',
      'The point is hash joins or hash partitioning. The hash here only places index entries.',
    ],

    contrastWith: [
      {
        concept: 'indexChoice',
        note: 'Losing key order is the cause; the consequence for index choice is a rule that equality favours a hash index while ranges favour an ordered index or a scan.',
      },
      {
        concept: 'leavesLinked',
        note: 'An ordered index keeps neighbouring keys on neighbouring leaves, so a range is one contiguous walk; a hash index spreads the same keys across buckets, so a range has no place to start or stop.',
      },
      {
        concept: 'hashTableChaining',
        note: 'Chaining is about what happens inside one bucket when keys collide; the index question is about what a hash does to the order between buckets.',
      },
    ],
  },
};
