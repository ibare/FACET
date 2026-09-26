/**
 * evictLeastFrequent 개념 선언.
 *
 * canonical facet 은 `facet:evictLeastFrequent` — 용량 3 빈 캐시에 경로 요청 아홉
 * (`/home` ×3 · `/cart` · `/sale` · `/faq` · `/cart` · `/faq` · `/blog`)이 차례로 온다. 적중은 횟수 +1,
 * 가득 찬 캐시의 실패는 횟수가 가장 적은 키를 밀어낸다(동률은 마지막 쓴 때가 오래된 키). 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `lfuCache` 는 세는 창을 돌려 지난 인기와 적중을 견준다. 이쪽은 창이 없다(끝없이 센다) —
 * 주장은 "버릴 키는 최근이 아니라 횟수가 정한다" 하나다. definition 은 fewest · tie · 오래전에 많이 쓴 키가
 * 남는다는 낱말을 쥐고, window · aging · scan · hit rate 를 쓰지 않는다.
 * 같은 서브도메인 `cacheHitMiss` 는 캐시가 넘치지 않고 ms 를 말한다 — 이쪽에는 DB · ms 가 없다.
 *
 * 전제 (설명 글 `evictLeastFrequent.md`):
 *  - 캐시 안 LFU — 밀려난 키는 횟수를 잃고 돌아오면 1 부터 센다.
 *  - 동률은 마지막으로 쓴 때가 가장 오래된 키를 버려 푼다.
 *  - 시간 · 뒤쪽 저장소 · 만료(TTL) 없음. 화면에 코드가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const evictLeastFrequentConcept: FacetConceptSource = {
  id: 'evictLeastFrequent',
  label: 'LFU Eviction (Fewest Hits Leaves First)',
  canonicalFacet: 'facet:evictLeastFrequent',

  surface: {
    definition:
      'When a full cache needs room, LFU evicts the resident key with the fewest hits, breaking ties by oldest last use, so a key used heavily long ago outlasts newer keys that were used only once.',
    exemplarKeywords: [
      'LFU eviction',
      'least frequently used eviction',
      'which key gets evicted',
      'eviction victim',
      'access count per key',
      'frequency tie-break',
      'evicted key loses its count',
      'new entries evicted first',
      'cache full new key',
    ],
  },

  briefing: {
    observable: [
      'A row of nine numbered requests runs along the top: `/home`, `/home`, `/home`, `/cart`, `/sale`, `/faq`, `/cart`, `/faq`, `/blog`. Below it a "Cache" with three slots, all "empty" at the start, and an "Evicted" area.',
      'Each slot shows a key, its count as a small stack, and "last used: #n". A miss admits a key at count 1 ("Miss: /home · enters with count: 1"); a hit adds one to the stack ("Hit: /home · count: 3").',
      '`/home` reaches count 3 by request 3 and is never requested again. The cache fills at request 5 with `/home`(3), `/cart`(1), `/sale`(1).',
      'Request 6 (`/faq`) finds `/cart` and `/sale` tied at count 1; the caption reads "Tied at lowest count: 1 · oldest last use: #4" and `/cart` drops into the Evicted area with its count.',
      '`/cart` comes back at request 7 and starts again at count 1, not 2; this time `/sale` (last used #5) leaves. Request 8 raises `/faq` to 2, and at request 9 `/cart` is the only key at count 1 ("Lowest count: 1 · held by one key") and leaves a second time.',
      'The run ends with `/home`(3), `/faq`(2), `/blog`(1) in the cache and `/cart`, `/sale`, `/cart` in the Evicted area. `/home`, the key used longest ago, survives every eviction.',
      'Counts are kept only while a key is in the cache; there is no time, no backing store and no expiry. The screen has no code.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one request per step, ten steps including the empty start, and stops.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to step 6 holds the first tie, with `/home` untouched at count 3 while the two count-1 keys are compared by last use.',
        'The request list and capacity are fixed, so every count and eviction can be quoted exactly.',
      ],
    },

    useWhen: [
      'The reader assumes a cache always throws out what was used longest ago, and needs to see an idle but heavily used key kept while recent one-hit keys go.',
      'The article explains the LFU weakness that new entries start at the bottom and get pushed straight out, and wants a key evicted twice to show it.',
    ],

    avoidWhen: [
      'The article is about how long LFU should remember counts, aging or decay. Counting here never forgets while the key is resident.',
      'The subject is hit latency or a cache in front of a database. No database, milliseconds or hit ratio appear.',
      'The point is CPU cache lines or page frames in an operating system. The keys here are request paths counted as requests.',
    ],

    contrastWith: [
      {
        concept: 'lfuCache',
        note: 'Picking the lowest count is the eviction rule itself; the horizon over which counts are kept is a separate choice that decides whether old popularity should still weigh.',
      },
      {
        concept: 'evictLeastRecent',
        note: 'Recency and frequency pick opposite victims on the same history: the key untouched the longest is the first to go by recency and the safest by count.',
      },
      {
        concept: 'cacheHitMiss',
        note: 'A miss costing a trip to the backing store is what makes a cache worth having; eviction only arises once the cache is full and something must leave to admit the missed key.',
      },
      {
        concept: 'cacheReplacement',
        note: 'Replacement policy is the general choice of what a full cache gives up; this is one policy, frequency, with its tie-break made explicit.',
      },
    ],
  },
};
