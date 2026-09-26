/**
 * originPull 개념 선언.
 *
 * canonical facet 은 `facet:originPull` — 경로 `/video/intro.mp4`, 빈 엣지 하나, 오리진 하나, 가져오기 100 ms.
 * 요청 여섯이 `r1` 0 · `r2` 15 · `r3` 40 · `r4` 70 · `r5` 130 · `r6` 160 ms 에 도착한다. `r1` 이 가져오기를 열고,
 * `r2`..`r4` 는 가는 중인 가져오기에 붙어 기다리다 100 ms 에 함께 받는다. 오리진 요청은 끝까지 1.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `cachingCdn` 은 여러 엣지 · 계층의 전체, 형제 `serveFromNear` 는 이미 든 엣지를 거리로 고르는 장면이다.
 * 이쪽은 **시간 속에서 겹친 요청들이 한 가져오기에 모인다** — 엣지 하나 · 거리 없음. definition 은 in-flight fetch ·
 * wait on · contacted once · request collapsing 을 쥐고, closest · round trip · tier 를 쓰지 않는다.
 * `cacheHitMiss` 와는 "실패가 가져오기를 부른다" 가 겹치지만 거기에는 겹치는 요청이 없다.
 *
 * 전제 (설명 글 `originPull.md`):
 *  - ms 는 모두 예로 정한 값이다. 엣지 ↔ 사용자 시간은 0 — 기다림 = 받은 ms − 도착 ms.
 *  - 가져오기 끝과 도착이 같은 ms 면 끝이 먼저(이 데이터에는 없다). 만료(TTL) 없음. 화면에 코드가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const originPullConcept: FacetConceptSource = {
  id: 'originPull',
  label: 'Origin Pull With Request Collapsing',
  canonicalFacet: 'facet:originPull',

  surface: {
    definition:
      'When an empty edge cache receives several requests for the same object before its origin fetch returns, the later requests wait on that single in-flight fetch, so the origin is contacted once and all waiters are answered together.',
    exemplarKeywords: [
      'origin pull',
      'request collapsing',
      'request coalescing',
      'cache stampede',
      'thundering herd',
      'dog-piling',
      'singleflight',
      'NGINX proxy_cache_lock',
      'Varnish request coalescing',
      'origin shield',
      'cold edge cache',
    ],
  },

  briefing: {
    observable: [
      'An Edge marked "empty" and an Origin sit side by side, with "Fetch: 100 ms", a clock "Time: 0 ms" and a count "Origin requests: 0". Six requests, `r1` to `r6`, wait with their arrival times: 0, 15, 40, 70, 130, 160 ms.',
      'At 0 ms `r1` misses and the edge opens a fetch to the origin ("Miss: r1. The edge opens a fetch to the origin"); Origin requests becomes 1 and a dot starts along the round trip to the origin, advancing with the clock.',
      'At 15, 40 and 70 ms `r2`, `r3` and `r4` arrive to the still-empty edge and hang in a line beneath it ("Miss: r2. It joins the fetch already on its way"). The Waiting count rises 1, 2, 3, 4 while Origin requests stays at 1.',
      'At 100 ms the dot returns: "Origin response arrives. Kept at the edge and handed out together. Delivered: 4". The edge now shows `/video/intro.mp4`, and the four waits read 100, 85, 60 and 30 ms.',
      'At 130 and 160 ms `r5` and `r6` are served straight from the edge with "Wait: 0 ms". Origin requests ends at 1.',
      'All times are example values; the time between edge and user is taken as zero, so a wait is delivery time minus arrival time. There is no expiry. The screen does not footnote these and has no code.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one arrival or origin response per step, eight steps including the start, and stops.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to step 4 holds four requests waiting under the edge with Origin requests still at 1.',
        'Arrival times and fetch time are fixed, so every wait can be quoted exactly; without collapsing the four early misses would each have gone to the origin, four requests instead of one, which the screen does not draw.',
      ],
    },

    useWhen: [
      'The article discusses a cache stampede after new content is published or a cache is flushed, and needs to show the requests that arrive during a fetch joining it instead of hitting the origin.',
      'A reader asks why an origin behind a CDN survives a sudden burst for a brand-new file; the origin count staying at 1 while four requests wait is the answer.',
    ],

    avoidWhen: [
      'The article is about choosing the closest edge or latency across geography. There is one edge and no distance.',
      'The subject is TTL expiry or revalidation of a stale object. The edge starts empty and nothing expires.',
      'The point is a single request\'s hit or miss cost. The claim here is about how many origin calls a burst produces.',
    ],

    contrastWith: [
      {
        concept: 'cacheHitMiss',
        note: 'One miss causing one fetch is the base rule; collapsing is what keeps that one-to-one when many misses for the same key overlap in time.',
      },
      {
        concept: 'serveFromNear',
        note: 'Serving from a close edge assumes the content is already there; pulling it from the origin, once per empty edge rather than once per request, is how it gets there.',
      },
      {
        concept: 'cachingCdn',
        note: 'Edge caches exist to offload the origin; that offload would collapse at the moment an object is new unless concurrent misses share one fetch.',
      },
    ],
  },
};
