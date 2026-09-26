/**
 * cacheCoherence 개념 선언.
 *
 * canonical facet 은 `facet:cacheCoherence` — 앱 서버 넷(`api-1`..`api-4`)이 키 `qty:31` 의 사본을 50 으로 들고,
 * 한 판에서 `api-1` 이 잇달아 쓰고(쓰기마다 DB −1, 제 캐시에 write-through) 나머지 셋이 한 번씩 읽는다. 네 판.
 * 손잡이 둘: "On write"(None · Invalidate · Update, 처음 Invalidate) · "Writes in a row"(1 · 2 · 3 · 4 · 6, 처음 3).
 * 계기 셋: Messages sent · Reads from DB · Stale reads.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `staleCopy` 는 알림 없는 쓰기 뒤 옛 사본이 읽히는 문제 한 장면, `invalidateOthers` 는 "버려라" 가 사본을 비우는
 * 한 장면이다. 이쪽은 **세 길(없음 · 무효화 · 갱신)을 견주고, 잇단 쓰기 수가 무효화와 갱신의 비용을 가른다**는
 * 맞바꿈을 쥔다. definition 은 notify · push updates · consecutive writes · message count 를 쥐고, 조각들의
 * keep the previous value · vanish · refill 을 쓰지 않는다.
 *
 * 전제 (설명 글 `cacheCoherence.md`):
 *  - 한 서버만 쓴다. 쓰기와 알림 사이 경쟁이 없다(쓰기 걸음 안에서 알림이 끝난다).
 *  - 읽는 서버 셋이 판마다 한 번씩 읽는다. 만료(TTL) 없음.
 *  - 통과 DB 읽기를 각각 한 번으로 센다(크기 · 지연은 셈하지 않는다). 걸음 = 쓰기 하나 또는 읽기 하나, 시각 없음.
 *  - CPU 의 MESI 가 아니라 앱 서버 캐시 사본의 일관성이다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const cacheCoherenceConcept: FacetConceptSource = {
  id: 'cacheCoherence',
  label: 'Cache Coherence Across Servers (None vs Invalidate vs Update)',
  canonicalFacet: 'facet:cacheCoherence',

  surface: {
    definition:
      'When one application server writes a key other servers also cache, it can notify nobody, send invalidations, or push updates; the number of consecutive writes decides whether invalidate or update costs fewer messages.',
    exemplarKeywords: [
      'distributed cache coherence',
      'write-invalidate vs write-update',
      'cache invalidation strategy',
      'push updates to cache replicas',
      'near cache consistency',
      'local cache on each app server',
      'Redis pub/sub cache invalidation',
      'invalidation messages vs database reloads',
      'keeping multiple caches in sync',
      'write-through cache',
    ],
  },

  briefing: {
    observable: [
      'Four server boxes, `api-1` (marked "writer") to `api-4`, each hold a cached value of `qty:31`; a DB box in the middle holds the original, starting at 50. Below run three tally rows: Messages, DB reads, Stale reads, one tile per event.',
      'A round is a run of writes by `api-1`, each selling one unit so the DB drops by 1, followed by one read each from `api-2`, `api-3`, `api-4`. Four rounds play in a row, and caches carry over between rounds. Captions read "Round 2 · write 1/3 · Messages from this write: 3" and "Round 1 · api-2 reads".',
      'Invalidate (the default, 3 writes in a row): the first write of a round sends three value-less envelopes and the other slots turn "empty"; the next two writes send 0, because no one else holds the key. Each read then fetches from the DB ("from DB → 47"). The run ends at DB 38 with 12 messages, 12 DB reads and 0 stale reads.',
      'Update: every write sends three envelopes carrying the new value and the other slots change to it, so reads never go to the DB. Messages grow as 12 × writes in a row: 12, 24, 36, 48, 72.',
      'None: nothing flies. The readers keep returning 50 while the DB falls, each marked "stale", and Stale reads reaches 12 at every setting while Messages and DB reads stay 0.',
      'When the handle changes, a new run starts from the beginning and the lengths reached by the previous run stay as dashed outlines, so a row can be seen growing or shrinking against it.',
      'Invalidate holds at 12 messages plus 12 DB reads whatever the run length; update is cheaper at 1 write in a row, equal at 2 if a message and a DB read are counted as one each, and more expensive from 3. The screen keeps the two counts separate and never adds them.',
      'Only one server writes, notifications finish inside the write with no racing read, there is no TTL, and message size and latency are not counted. The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "On write" with None, Invalidate, Update (starting at Invalidate) and "Writes in a row" with 1, 2, 3, 4, 6 (starting at 3). Each setting plays four rounds and waits.',
        'The move that makes the idea land is holding "Writes in a row" at 6 and switching between Invalidate and Update: the Messages row jumps from 12 to 72 while DB reads goes from 12 to 0.',
        'Three readouts under the controls: Messages sent, Reads from DB, Stale reads.',
        'The code panel, labelled "Write, notify, read", starts empty with a "+ Add language" button. Its `coherence` function returns the message count and fills `result` with stale reads, messages and DB reads, matching the three readouts. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article must justify picking invalidation over pushing new values (or the reverse) for application caches, and needs the write pattern that makes each one cheaper.',
      'A design discussion lists the three options for keeping per-server caches consistent and wants their costs — stale reads, messages, database reloads — counted on the same workload.',
    ],

    avoidWhen: [
      'The subject is CPU cache coherence, MESI, cores or a bus. The copies here live in application servers in front of a database.',
      'The article is about TTL expiry or time-based staleness. Nothing expires; staleness ends only by a message.',
      'The point is concurrent writers or races between a write and its notification. One server writes and notifications never lose a race.',
    ],

    contrastWith: [
      {
        concept: 'staleCopy',
        note: 'Old copies being read is the failure itself; the options for preventing it each trade that failure for a different cost, and which cost is smaller depends on the write pattern.',
      },
      {
        concept: 'invalidateOthers',
        note: 'Dropping copies on a write is one of the remedies; it is cheap when writes come in bursts and pays for it with a database reload on the next read.',
      },
      {
        concept: 'eventuallyAgrees',
        note: 'Replicas exchanging values until they converge accept a window of disagreement; a writer that notifies every cache on each write closes that window at once at a message cost.',
      },
      {
        concept: 'cacheTtl',
        note: 'An expiry bounds how long an old answer can be served without any message; notification on write removes the old answer immediately but needs the writer to know who holds a copy.',
      },
    ],
  },
};
