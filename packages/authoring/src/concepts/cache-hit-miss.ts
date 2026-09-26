/**
 * cacheHitMiss 개념 선언.
 *
 * canonical facet 은 `facet:cacheHitMiss` — 요청 여덟(`user:7` · `user:3` · `user:7` · `user:7` · `user:9` ·
 * `user:3` · `user:7` · `user:9`)이 서버 → 캐시 → (없으면) DB 로 간다. 적중 1 ms, 실패 1 + 20 = 21 ms.
 * 끝: 적중 5 · 실패 3 · 누계 68 ms. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `lruCache` 는 용량이 찬 캐시의 교체(최근 사용 순서)와 자료 구조를 보인다. 이쪽은 캐시가 넘치지 않는다 —
 * 주장은 "한 요청의 길이 두 갈래이고, 실패가 키를 남겨 다음 요청을 짧게 한다" 하나다. definition 은 cache-aside ·
 * short trip · on to the database · leaves the key 를 쥐고 evict · capacity · recency 를 쓰지 않는다.
 * 형제 `originPull` 은 한 키에 겹친 요청이 오리진을 몇 번 부르는가 — 이쪽에는 겹치는 요청이 없다.
 *
 * 전제 (설명 글 `cacheHitMiss.md`):
 *  - ms 는 예로 정한 값이다 — 캐시 보기 1 ms, DB 읽기 20 ms. 캐시에 넣는 시간은 0.
 *  - 용량 4 에 키 셋이라 교체가 일어나지 않는다. 만료(TTL) 없음. 값의 내용은 그리지 않는다.
 *  - 화면에 코드가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const cacheHitMissConcept: FacetConceptSource = {
  id: 'cacheHitMiss',
  label: 'Cache Hit vs Miss (Short Path, Long Path)',
  canonicalFacet: 'facet:cacheHitMiss',

  surface: {
    definition:
      'In a cache-aside read, a request whose key is cached returns from the cache after a short trip, while a missing key goes on to the database and is stored on the way back, so its next request is short.',
    exemplarKeywords: [
      'cache hit',
      'cache miss',
      'cache-aside pattern',
      'lazy loading cache',
      'Redis in front of a database',
      'Memcached',
      'miss penalty',
      'cold cache',
      'why caching reduces latency',
      'total response time with a cache',
    ],
  },

  briefing: {
    observable: [
      'Eight requests wait in a row — `user:7`, `user:3`, `user:7`, `user:7`, `user:9`, `user:3`, `user:7`, `user:9` — beside a Server, a Cache and a DB. Readouts start at "Total: 0 ms · Hits: 0 · Misses: 0" and "Requests waiting: 8 · Keys in cache: 0".',
      'Each request first reaches the cache. On a hit it turns back there ("Hit: user:7 is in the cache — turned back there · This request: 1 ms").',
      'On a miss it continues to the DB and, coming back, leaves the key in the cache ("Miss: user:7 is not in the cache — fetched from the DB and kept in the cache · This request: 21 ms").',
      'A strip below chains each request\'s time: three long pieces of 21 and five short pieces of 1. The total runs 21, 42, 43, 44, 65, 66, 67, 68 ms.',
      'Keys enter the cache only on misses, one each for `user:7`, `user:3`, `user:9`; every later request for those keys is a hit. The run ends at 5 hits, 3 misses (the number of distinct keys) and 68 ms.',
      'The times are example values — 1 ms to check the cache, 20 ms for a database read, 0 to store. The cache has room for four keys and receives three, so nothing is ever evicted, and nothing expires. Cached values are not drawn. The screen has no code.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one request per step, nine steps including the start, and stops.',
        'A Replay button and a playback strip sit below it. After the run, dragging between steps 1 and 3 sets the first `user:7` miss beside its hit two requests later.',
        'Keys and times are fixed, so every total can be quoted; without the cache the same eight requests would take 8 × 20 = 160 ms, a figure the screen does not show.',
      ],
    },

    useWhen: [
      'The article explains what a cache buys a single request: the same lookup ends in 1 ms or 21 ms depending on whether the key is already there.',
      'A reader needs to see why the first request for each key is slow and the repeats are fast — the cache fills itself only through misses.',
    ],

    avoidWhen: [
      'The article is about what to evict when a cache is full. This cache never fills.',
      'The subject is many simultaneous requests for one missing key, or a CDN. Requests here come one at a time to a single cache.',
      'The point is stale data or expiry. Values never change and nothing expires.',
    ],

    contrastWith: [
      {
        concept: 'lruCache',
        note: 'The hit-or-miss split holds for any cache; which key to discard once it is full, and the structure that tracks recency, only matters after capacity runs out.',
      },
      {
        concept: 'originPull',
        note: 'A miss sending one request to the backing store is simple when requests arrive one by one; when many ask for the same missing key at once, the question becomes how many fetches that causes.',
      },
      {
        concept: 'evictLeastFrequent',
        note: 'Filling on a miss adds keys; eviction is the opposite decision, which key leaves when there is no room for the next one.',
      },
    ],
  },
};
