/**
 * leakyBucket 개념 선언.
 *
 * canonical facet 은 `facet:leakyBucket` — 통(먼저 온 차례의 줄) 용량 3, 짝수 초마다 하나를 흘린다. 요청 a b c 는
 * 0 초, d e 는 1 초, f 는 5 초에 들어온다. e 는 통이 차서 버려지고, 나간 간격은 모두 2 초다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `rateLimiting` 은 같은 한도의 네 제한기를 견준다. 형제 조각 `tokenBucket` 은 쌓아 둔 여유를 한꺼번에
 * 쓰는 쪽, `slidingWindowCount` 는 창 셈의 경계 차이다. 이쪽은 **뭉쳐 들어온 요청을 줄에 붙들어 같은 간격으로
 * 내보낸다** 한 장면이다. 그래서 definition 은 bounded FIFO · fixed interval · evenly spaced · clustered ·
 * dropped 를 쥐고, 토큰 · 쌓아 둔 · 한꺼번에 · 창 · 경계 같은 말을 쓰지 않는다.
 *
 * 전제 (설명 글 `leakyBucket.md`):
 *  - 대기열 꼴(shaper)이다. 받거나 거절만 하는 계량기 꼴(meter)도 누출 버킷이라 부르지만 다루지 않는다.
 *  - 같은 초의 차례: 들어옴 → 흘림. 흘림 시계는 통이 비어도 돈다.
 *  - 초는 예로 정한 단위. 버림은 용량 셈의 결과일 뿐, 재전송 · 늦추라는 알림은 없다.
 *  - 화면에 코드가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const leakyBucketConcept: FacetConceptSource = {
  id: 'leakyBucket',
  label: 'Leaky Bucket (Bursty In, Evenly Spaced Out)',
  canonicalFacet: 'facet:leakyBucket',

  surface: {
    definition:
      'A leaky bucket holds incoming requests in a bounded FIFO and releases them at a fixed interval, so clustered arrivals leave evenly spaced and any arriving while it is full are dropped.',
    exemplarKeywords: [
      'leaky bucket',
      'leaky bucket algorithm',
      'traffic shaping',
      'smoothing bursty traffic',
      'constant output rate',
      'shaper vs policer',
      'NGINX limit_req queue',
      'request queue with fixed drain rate',
      'pacing requests to a backend',
    ],
  },

  briefing: {
    observable: [
      'An "Arrive" axis runs across the top and a "Leave" axis across the bottom, seconds 0 to 8. On the left sits a bucket with room for 3 ("In bucket: 2 / 3") and a hole in its floor that lets one request out on every even second — 0, 2, 4, 6, 8.',
      'Six requests arrive: a, b and c at 0 s, d and e at 1 s, f at 5 s. At second 0 all three drop in and a leaks out the same second ("Second 0 · in: a b c · Leaks out: a · the first one").',
      'At second 1 d fills the bucket again and e, arriving in the same second, spills over the rim into "Dropped": "Second 1 · in: d e · bucket full, dropped: e".',
      'From then on the bucket lets one out from the head every 2 seconds, and the rest settle down a place: b at 2, c at 4, d at 6, f at 8, each captioned "gap since the last one: 2 s". Odd seconds read "Not a leak second · nothing leaks". At 8 the bucket is empty.',
      'The final caption sets the two axes side by side: "Gaps in (s): 0 0 1 0 4 · gaps out (s): 2 2 2 2". Up to three came in within one second; at most one ever leaves per second. One request, e, was dropped.',
      'This is the queueing kind of leaky bucket (a shaper): the bucket is a first-come-first-served line and overflow is dropped. Within a second, arrivals come before the leak. The second is a unit chosen for the example. Dropped requests are not resent, and no one is told to slow down.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one second per step, nine steps from second 0 to second 8, and stops. A Replay button and a scrub strip sit below it.',
        'The end screen, where the gaps on the Arrive axis read 0 0 1 0 4 and those on the Leave axis read 2 2 2 2, is the one to point at.',
        'All values are fixed, so the article can quote each request and gap exactly.',
      ],
    },

    useWhen: [
      'The article explains how a limiter protects a backend that must see requests at a steady pace, and needs to show clustered arrivals turned into evenly spaced departures.',
      'A reader must see the price of smoothing: requests are held in the bucket and leave later than they arrived, and an arrival that finds the bucket full is lost.',
    ],

    avoidWhen: [
      'The article describes the meter form of the leaky bucket, which only accepts or rejects without queueing. Here the bucket is a queue and requests wait in it.',
      'The subject is letting a saved-up burst through at once. Nothing here ever leaves faster than one per two seconds.',
      'The article is about a leaking memory or a leaky abstraction. The bucket here is a request queue.',
    ],

    contrastWith: [
      {
        concept: 'tokenBucket',
        note: 'A token bucket lets requests through immediately and spends saved allowance on bursts; a queueing leaky bucket never lets a burst through as a burst and pays for smoothness with waiting.',
      },
      {
        concept: 'arrivalVsService',
        note: 'Both hold requests in a line in front of a fixed pace, but a leaky bucket has a capacity and drops overflow, so its line cannot grow without end.',
      },
      {
        concept: 'rateLimiting',
        note: 'Among limiters with the same average rate, the leaky bucket is the one whose output never exceeds that rate, trading higher peaks for added delay.',
      },
    ],
  },
};
