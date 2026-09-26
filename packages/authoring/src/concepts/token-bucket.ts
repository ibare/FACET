/**
 * tokenBucket 개념 선언.
 *
 * canonical facet 은 `facet:tokenBucket` — 통 용량 토큰 4, 1 초마다 토큰 하나 채움, 비어서 시작. 1~4 초에 토큰이
 * 쌓여 통이 차고, 5 · 6 초의 채움은 넘쳐 버려진다. 6 초에 요청 여섯이 한꺼번에 오면 토큰 넷이 한 번에 빠져나가
 * 넷이 지나가고 둘은 거절된다. 7 초 하나 지나감, 8 초 둘 중 하나 지나감. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `rateLimiting` 은 같은 한도를 네 제한기에 걸어 몰림의 모양을 견준다. 형제 조각 `leakyBucket` 은 요청을
 * 통에 넣어 같은 간격으로 흘리는 쪽(기다리게 한다), `slidingWindowCount` 는 창을 세는 두 규칙의 경계 차이다.
 * 이쪽은 **쉬는 동안 쌓아 둔 여유를 한꺼번에 쓴다** 한 장면이다. 그래서 definition 은 saves unused permits ·
 * idle · at once · rejected immediately 를 쥐고, 같은 간격 · 줄 · 경계 · 창 같은 말을 쓰지 않는다.
 *
 * 전제 (설명 글 `tokenBucket.md`):
 *  - 초는 예로 정한 단위. 실제 제한기는 대개 밀리초로 채우거나 흐른 시간만큼 몰아 채운다.
 *  - 같은 초의 차례: 채움 → 요청.
 *  - 통을 비워 두고 시작한 것은 "쌓아 둔 것" 을 보이려는 선택이다. 실제 구현은 흔히 가득 차서 시작한다.
 *  - 모자라면 거절한다(정책자 꼴). 기다리게 하는 셰이퍼 꼴은 다루지 않는다.
 *  - 화면에 코드가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const tokenBucketConcept: FacetConceptSource = {
  id: 'tokenBucket',
  label: 'Token Bucket (Saved Tokens Let a Burst Through at Once)',
  canonicalFacet: 'facet:tokenBucket',

  surface: {
    definition:
      'A token bucket saves unused permits up to its capacity while a client is idle, so a later burst passes all at once up to that many, and requests finding no token are rejected immediately.',
    exemplarKeywords: [
      'token bucket',
      'token bucket algorithm',
      'burst capacity',
      'refill rate',
      'bucket size vs refill rate',
      'bursty API traffic',
      'AWS API Gateway burst limit',
      'Guava RateLimiter',
      'policing with a token bucket',
      'allow short bursts above the average rate',
    ],
  },

  briefing: {
    observable: [
      'A bucket holds up to 4 tokens, "Tokens: 0 / 4" at the start. Every second one token drops in ("Refill: +1. Tokens in the bucket: 1."), and a "Refill: 1 per second" label sits beside it. One step is one second, from 0 to 8.',
      'Seconds 1 to 4 bring no requests ("No requests this second."), so the bucket fills to 4 / 4. At seconds 5 and 6 the refilled token has no room and spills over the rim: "The bucket is full. Tokens spilled: 1." The "Spilled" counter ends at 2.',
      'Requests do not enter the bucket. At the door each takes one token and goes straight through; a request with no token is turned away on the spot, with no waiting.',
      'At second 6 six requests arrive together. The four saved tokens leave at once with four requests, and the two left without a token are rejected: "Requests: 6 · Passed: 4 · Rejected: 2 · Tokens left: 0."',
      'After that only one token arrives per second: at 7 one request comes and passes, at 8 two come and one passes. The round totals 6 passed, 3 rejected, 2 tokens spilled.',
      'A "Passed per second" bar chart on the right has a dashed "Refill rate" line at 1. Only the bar at second 6, height 4, rises far above it — the bucket\'s capacity is how much burst it can absorb.',
      'The second is a unit chosen for the example; real limiters usually refill by milliseconds or catch up by the elapsed time. Within a second the refill comes first, then the requests. The bucket starts empty here to show saving up; real implementations often start full.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one second per step, nine steps from second 0 to second 8, and stops. A Replay button and a scrub strip sit below it.',
        'Scrubbing to second 6 holds the moment four saved tokens leave together while two requests are rejected; stepping back to seconds 1–4 shows where those tokens came from.',
        'All values are fixed, so the article can quote every count exactly.',
      ],
    },

    useWhen: [
      'The article explains why an API that allows "1 request per second" still accepts a sudden batch after a quiet period, and needs to show idle time turning into saved tokens that are spent in one instant.',
      'A reader must understand the two knobs of a token bucket, refill rate and bucket size, and see that the size caps the burst while the rate caps what follows.',
    ],

    avoidWhen: [
      'The article wants requests delayed and released at an even pace. Here requests either pass immediately or are rejected; nothing waits.',
      'The subject is counting requests in time windows, fixed or sliding. There is no window here, only a token count.',
      'The article is about authentication tokens, JWTs or session tokens. The tokens here are rate-limit permits.',
    ],

    contrastWith: [
      {
        concept: 'leakyBucket',
        note: 'Both use a bucket with a capacity, but for opposite ends: saved tokens let a burst through at once, while a queueing leaky bucket holds the burst and releases it evenly, adding delay instead.',
      },
      {
        concept: 'slidingWindowCount',
        note: 'A window counter asks how many were accepted recently; a token bucket asks how much unused allowance has built up, which is what lets idle time be spent later.',
      },
      {
        concept: 'rateLimiting',
        note: 'Among limiters with the same average rate, the token bucket is the one that allows its full burst allowance within a single instant.',
      },
    ],
  },
};
