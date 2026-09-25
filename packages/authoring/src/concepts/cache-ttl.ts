/**
 * cacheTtl 개념 선언.
 *
 * canonical facet 은 `facet:cacheTtl` — 리졸버가 `www.shop.example` 의 답을 TTL 60 초 동안 들고 있다. 0 초에 원본에서
 * `203.0.113.10` 을 받고, 30 초에 원본이 `203.0.113.20` 으로 바뀌어도 50 초의 질문에는 옛 주소가 나간다(남은 10 초).
 * 60 초에 남은 시간이 0 에 닿아 답이 버려지고, 75 초의 질문이 새 주소를 받아 온다. 질문 5 · 적중 3 · 다시 물음 2 · 옛 답 1.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `dns` 는 TTL 을 여러 값으로 돌려 질의 수와 옛 답을 견주고, 이웃 `delegateDownTheTree` 는 답을 누가 가졌는지 찾아
 * 내려간다. 이쪽의 주장은 하나 — **들고 있는 답은 남은 시간이 닳아 0 이 될 때 버려지고, 그 전에는 원본이 바뀌어도 옛 답이
 * 나간다.** 그래서 definition 은 counts down · remaining · expires · discarded · old address 쪽 낱말을 쥐고, raising the TTL ·
 * queries · delegation · referral 을 쓰지 않는다.
 *
 * 전제 (설명 글 `cacheTtl.md` 가 밝힌 것): 이름 · 주소(문서용 대역) · TTL 60 · 질문 시각 · 바뀜 시각은 예로 정한 값 ·
 * 권한 서버에 묻는 시간 0 · 만료는 제 시각의 걸음 · 마지막 만료(135 초)는 걸음이 아니다 · 위임 · 부정 캐시는 그리지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const cacheTtlConcept: FacetConceptSource = {
  id: 'cacheTtl',
  label: 'A Cached Answer Held Until Its TTL Runs Out',
  canonicalFacet: 'facet:cacheTtl',

  surface: {
    definition:
      'A resolver reuses a cached record while its remaining TTL counts down, so after the origin changes it still hands out the old address until the countdown reaches zero and the entry is discarded.',
    exemplarKeywords: [
      'time to live',
      'TTL countdown',
      'remaining TTL in a cached answer',
      'cache expiry',
      'expired entry dropped',
      'outdated cached address',
      'why DNS changes take time to appear',
      'time-based cache invalidation',
      'answer served from cache',
    ],
  },

  briefing: {
    observable: [
      'One time axis in seconds with three rows: Origin server (the address it currently gives), Resolver (the answer held, as a bar from insertion to expiry), Queries (when a question came and what it got). Each address has its own colour. "Name: www.shop.example · TTL: 60s".',
      'At 0 s nothing is held, so the resolver asks the origin and gets `203.0.113.10`, "expires at 60s".',
      'At 25 s the question is answered from what is held: "Answer: 203.0.113.10 · TTL left: 35s". A vertical now-line moves along the bar, fading the part already used.',
      'At 30 s the origin switches to `203.0.113.20`; the resolver still holds `203.0.113.10` with 30 s left. At 50 s the answer goes out as "203.0.113.10 · TTL left: 10s · origin now: 203.0.113.20" and is marked "outdated".',
      'At 60 s "TTL left reaches 0" and the bar drops to the discard line — "Dropped: 203.0.113.10".',
      'At 75 s nothing is held again, so the origin is asked and `203.0.113.20` is held until 135 s; at 100 s a hit returns it with 35 s left. The tally ends "Hits: 3 · Asked origin: 2 · Outdated: 1".',
      'Name, TTL, addresses and times are chosen for the example (documentation range); asking the origin takes no time; the final expiry at 135 s is not a step. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one event per step — question, origin change or expiry — eight steps including the start.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to 50 s holds the moment the old address goes out while the origin row already shows the new one.',
        'Times, addresses and remaining TTLs are fixed, so the table of events can be quoted exactly.',
      ],
    },

    useWhen: [
      'The reader expects a record change to reach clients immediately; the answer at 50 s, still the old address with 10 s left, shows that only expiry lets the new one in.',
      'An article explains what the TTL number in a DNS answer means and why a resolver passes on a smaller remaining TTL than it received.',
    ],

    avoidWhen: [
      'The subject is choosing a TTL value or comparing short and long TTLs. One TTL, 60 s, is used throughout.',
      'The article is about eviction by capacity, LRU or cache replacement policies. Entries here leave only when their time runs out.',
      'The point is how the resolver finds the authoritative server. The origin is asked directly, with no hierarchy drawn.',
    ],

    contrastWith: [
      {
        concept: 'dns',
        note: 'The countdown on one answer is the mechanism; setting the TTL longer or shorter trades that stale window against how many lookups reach the name servers.',
      },
      {
        concept: 'delegateDownTheTree',
        note: 'The TTL governs how long an answer may be reused. Finding the server that owns the answer in the first place is the delegation walk.',
      },
      {
        concept: 'arpCache',
        note: 'Both keep a looked-up mapping to avoid asking again. The ARP claim is that one exchange fills tables on both ends; this claim is that time alone ends a held answer, even a wrong one.',
      },
      {
        concept: 'lruCache',
        note: 'An LRU cache removes entries when space runs out, choosing the least recently used. A TTL cache removes an entry when its own time runs out, regardless of use or space.',
      },
    ],
  },
};
