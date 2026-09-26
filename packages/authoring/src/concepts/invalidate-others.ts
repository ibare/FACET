/**
 * invalidateOthers 개념 선언.
 *
 * canonical facet 은 `facet:invalidateOthers` — 키 `stock:7` 의 DB 값 5, 서버 `s1`..`s4` 가 모두 캐시에 5.
 * `s1` 에 4 를 쓰고, 그 키를 든 다른 서버 셋에 값 없는 "버려라" 를 한 통씩 보낸다. 받은 자리는 빈다(사본 4 → 1).
 * 이어지는 읽기(s3 · s2 · s3)가 DB 에서 다시 채운다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `staleCopy` 는 알림이 없을 때의 문제, 완제품 `cacheCoherence` 는 세 방식의 비용 견줌이다. 이쪽은 **무효화 한 번이
 * 사본을 어떻게 바꾸는가** — 새 값이 되지 않고 사라지며, 읽기가 온 서버만 다시 채운다 — 한 장면이다.
 * definition 은 delete · vanish · refill on the next read 를 쥐고, 견줌 낱말(consecutive writes · cost)을 쓰지 않는다.
 *
 * 전제 (설명 글 `invalidateOthers.md`):
 *  - write-invalidate 이지 write-update 가 아니다. 무효화에는 값이 없다.
 *  - 쓰기와 무효화가 끝난 뒤에 읽기가 온다 — 그 사이 경쟁은 이 모형에 없다(실제로는 옛값이 새는 틈).
 *  - 시간은 셈하지 않고 차례만. 만료(TTL) 없음. 앱 서버 캐시 + DB. 화면에 코드가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const invalidateOthersConcept: FacetConceptSource = {
  id: 'invalidateOthers',
  label: 'Invalidating Other Caches (Drop, Not Update)',
  canonicalFacet: 'facet:invalidateOthers',

  surface: {
    definition:
      'After a write, the writing server tells every other server holding the key to delete it; their copies vanish instead of receiving the new value, and only servers that are read again refill from the database.',
    exemplarKeywords: [
      'cache invalidation',
      'invalidate on write',
      'write-invalidate',
      'cache eviction message',
      'delete key from other caches',
      'invalidation broadcast',
      'cache-aside refill after invalidation',
      'purge cached copies',
      'lazy reload after invalidation',
    ],
  },

  briefing: {
    observable: [
      'A DB box holds `stock:7` at 5 and four boxes, Server s1 to Server s4, each cache 5 ("Every server caches a copy of stock:7"). Two counts read "Copies held · 4" and "Reads sent to the DB · 0".',
      'Step 1 writes 4 at s1 ("Write at server s1 · New value: 4 · Stale copies: 3"): the DB and s1 change, s2, s3 and s4 still show 5 tagged "stale".',
      'Step 2 sends the invalidations ("Server s1 sends "drop" with no value · Messages: 3"). The envelopes carry no number; s2, s3 and s4 turn "empty" and Copies held falls from 4 to 1.',
      'A read at s3 misses, goes to the DB and refills with 4 ("Read at server s3: miss, refilled from the DB"); s2 does the same. A second read at s3 is a hit. Copies held climbs to 2, then 3; Reads sent to the DB ends at 2.',
      'Server s4 is never read and stays empty to the end. No read returns 5; stale reads are zero.',
      'All reads come after the write and its invalidations have finished; the race where a read slips in between is not modelled. Time is not counted and there is no expiry. The screen has no code.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one write, invalidation batch or read per step, six steps including the start, and stops.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to step 2 holds the three empty slots right after the drop message, before any read has refilled them.',
        'The key, servers and read order are fixed, so the counts 4 → 1 → 3 copies and 2 database reads can be quoted exactly.',
      ],
    },

    useWhen: [
      'The reader pictures invalidation as sending the new value to other caches, and needs to see the copies disappear and come back only on demand.',
      'The article explains why an invalidation costs a database read later, and why a server that is never read again costs nothing.',
    ],

    avoidWhen: [
      'The article is about whether invalidation or pushing updates is cheaper. Only invalidation is shown, on a single write.',
      'The subject is CDN purging or HTTP cache-control headers. The copies here sit in application servers in front of one database.',
      'The point is the race between a write and a concurrent read. The model lets every invalidation land before any read.',
    ],

    contrastWith: [
      {
        concept: 'staleCopy',
        note: 'Without a message the old copies stay readable; a drop message removes them, so what would have been stale reads become misses that fetch the current value.',
      },
      {
        concept: 'cacheCoherence',
        note: 'Invalidation is one policy among no-notice and update; whether it beats sending values depends on how many writes arrive before the next read.',
      },
      {
        concept: 'eventuallyAgrees',
        note: 'Gossip lets replicas disagree for a while and converge later; invalidation removes disagreement at the moment of the write by leaving nothing old to read.',
      },
      {
        concept: 'cacheHitMiss',
        note: 'A miss that goes to the database and stores the result is the ordinary cache-aside read; invalidation deliberately creates such misses so the next read picks up the new value.',
      },
    ],
  },
};
