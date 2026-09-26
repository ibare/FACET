/**
 * staleCopy 개념 선언.
 *
 * canonical facet 은 `facet:staleCopy` — 키 `price:42` 의 DB 값 100, 서버 `a` · `b` · `c` 가 모두 캐시에 100.
 * `a` 에 120 을 쓰면 DB 와 `a` 의 캐시만 바뀌고, 이어지는 읽기 넷(a · b · c · b) 가운데 셋이 100 을 받는다.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `cacheCoherence` 는 세 알림 방식의 비용을 견주고, `invalidateOthers` 는 "버려라" 로 사본을 비운다.
 * 이쪽은 **아무 알림이 없을 때 생기는 문제**만 보인다 — 한 키에 두 값이 살아 있고 옛값 읽기가 쌓인다.
 * definition 은 only the database and its own cache · previous value · indefinitely 를 쥐고, invalidate ·
 * notify · update 방식 이름을 쓰지 않는다.
 *
 * 전제 (설명 글 `staleCopy.md`):
 *  - 사본을 든 것은 앱 서버의 캐시, 원본은 DB 하나다. CPU 캐시 일관성이 아니다.
 *  - 쓰기는 DB 와 쓴 서버의 캐시만 고친다(제 캐시에 write-through). 만료(TTL) 없음, 경쟁 없음.
 *  - 옛값 판정 = 돌려준 값 ≠ 그때 DB. 화면에 코드가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const staleCopyConcept: FacetConceptSource = {
  id: 'staleCopy',
  label: 'Stale Cached Copy (Other Servers Keep the Old Value)',
  canonicalFacet: 'facet:staleCopy',

  surface: {
    definition:
      'If a write changes only the database and the writing server\'s own cache, copies cached on other servers keep the previous value, and reads through those servers go on returning it with nothing to correct them.',
    exemplarKeywords: [
      'stale cache',
      'stale read',
      'serving outdated data',
      'cache inconsistency between servers',
      'local in-memory cache per instance',
      'why do users see the old price',
      'two values for the same key',
      'cache not updated after write',
      'horizontal scaling with local caches',
    ],
  },

  briefing: {
    observable: [
      'A DB box holds `price:42` at 100, and three boxes, Server a, Server b and Server c, each cache 100 ("Cached on each server — price:42: 100"). A "Returned to readers" row sits empty below, and a count reads "Different values of price:42: 1".',
      'Step 1 writes 120 on server a ("Write on server a — price:42: 120"). The new value goes to a\'s cache and to the DB and nowhere else; b and c keep 100 and are tagged "stale". The count becomes "Different values of price:42: 2".',
      'Each read adds a card to the Returned to readers row: server a returns 120 marked "current"; server b returns 100, then server c returns 100, then server b again returns 100, each marked "stale".',
      'The tally "Stale reads" climbs 0 / 1, 1 / 2, 2 / 3, 3 / 4. The run ends with three of four reads stale and b and c still holding 100.',
      'Nothing reaches b or c at any step, and their copies never refresh on their own. A read is stale when the value returned differs from the DB at that moment. There is no expiry and no race; events happen one at a time. The screen has no code.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one write or read per step, six steps including the start, and stops.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip back to step 1 holds the moment the DB reads 120 while two of the three servers still show 100.',
        'The key, values and read order are fixed, so each returned value can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces the problem that motivates cache invalidation: adding a per-server cache made reads fast, and now a price change shows on one server but not on the others.',
      'A reader assumes writing through to the database is enough to keep caches correct, and needs to see that it corrects only the writer\'s own copy.',
    ],

    avoidWhen: [
      'The article is about fixing staleness with invalidation or update messages. No message is sent here; the screen shows only the problem.',
      'The subject is database replication lag between a leader and followers. These copies are application caches that never catch up by themselves.',
      'The point is TTL expiry. Nothing expires; the old copies simply stay.',
    ],

    contrastWith: [
      {
        concept: 'invalidateOthers',
        note: 'Old copies persist because nothing tells the other servers a write happened; a drop message sent by the writer is what turns those stale reads into database reloads.',
      },
      {
        concept: 'cacheCoherence',
        note: 'Staleness is the cost of sending no notice; weighing it against the message and reload costs of the other options is a separate question.',
      },
      {
        concept: 'replicationLag',
        note: 'A lagging follower returns an old value only until the write arrives; a cache that is never told keeps the old value with no arrival to wait for.',
      },
      {
        concept: 'cacheTtl',
        note: 'With an expiry the old value has a deadline; without expiry or notification it has none, and every later read through that server is stale.',
      },
    ],
  },
};
