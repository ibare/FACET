/**
 * rateLimiting 개념 선언.
 *
 * canonical facet 은 `facet:rateLimiting` — 같은 한도(평균 틱당 1 · 몰림 b)를 네 제한기 — 고정 창 · 미는 창 ·
 * 토큰 버킷 · 누출 버킷 — 로 걸어, 같은 요청 스물셋(틱 0 에 3, 틱 11 · 12 에 6 씩, 틱 16..23 에 1 씩)이 뒤쪽
 * 서버 축에 떨어지는 모양을 견준다. 손잡이 둘: 제한 방식(처음 고정 창) · 몰림 허용 b(2 · 3 · 4 · 6, 처음 3).
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 각각 한 제한기의 한 장면이다 — 쌓아 둔 토큰을 한꺼번에 쓴다(`tokenBucket`) · 몰려와도 같은
 * 간격으로 흘린다(`leakyBucket`) · 칸 경계에서 셈이 0 으로 돌아가 두 배가 지나간다(`slidingWindowCount`).
 * 이쪽은 **같은 한도를 넷에 걸어 몰림이 흘러가는 모양을 견주는 것**을 맡는다. 그래서 definition 은
 * same limit · burst allowance · shape 과 네 이름을 나란히 쥐고, 조각들이 쥔 saves unused permits ·
 * evenly spaced · resets at each boundary · twice the limit 을 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `rateLimiting.md` 가 밝힌 것):
 *  - 시간은 틱(정수)이고 틱은 예로 정한 단위다. 평균 한도 틱당 1.
 *  - 한 틱 안의 차례: 토큰 채움 → 그 틱의 도착을 번호 차례로 판정 → 누출은 통 머리 하나.
 *  - 토큰 버킷은 가득 차서 시작한다. 누출 버킷은 대기열 꼴, 틱당 하나 · 통 b(흘리기 전 통 안 수로 본다).
 *  - 미는 창은 로그 꼴(받은 시각을 적어 둔다)이고 거절은 세지 않는다. 가중 어림 꼴이 아니다.
 *  - 몰림을 틱 11 | 12 에 걸친 것은 창 경계를 보이려고 고른 데이터다.
 *  - 망 지연 0, 거절된 요청은 다시 오지 않는다 — 과부하 버리기나 배압이 아니다.
 *  - 코드 패널(`limitRequests`)은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const rateLimitingConcept: FacetConceptSource = {
  id: 'rateLimiting',
  label: 'Rate Limiting (Four Limiters, One Limit, Different Burst Shapes)',
  canonicalFacet: 'facet:rateLimiting',

  surface: {
    definition:
      'Fixed window, sliding log, token bucket and leaky bucket configured with one average rate and burst allowance let the same traffic spike through in different shapes: doubled, capped, all at once, or delayed.',
    exemplarKeywords: [
      'rate limiter algorithms compared',
      'API rate limiting',
      'throttling requests',
      'fixed window vs sliding window vs token bucket vs leaky bucket',
      'burst allowance',
      'requests per second limit',
      'HTTP 429 Too Many Requests',
      'NGINX limit_req',
      'Redis rate limiter',
      'choosing a rate limiting algorithm',
      'traffic shaping vs policing',
    ],
  },

  briefing: {
    observable: [
      'Three lanes share one tick axis: "Arrivals" on top, "Limiter" in the middle and "Server" below. Twenty-three requests arrive — 3 at tick 0, 6 each at ticks 11 and 12, then 1 per tick from 16 to 23 — and the axis runs to tick 25. Each step is one tick.',
      'Every tick the arriving requests are judged in order; the ones that pass drop onto the Server lane at the tick they get through, and the rest are rejected. A caption reads "Tick 11: arrived 6 · passed 3 · rejected 3".',
      'Inside the Limiter lane each method shows its own state: the two windows their current frame and how full it is ("Window 12–14: 3 of 3 used") — the fixed one jumping from cell to cell, the sliding one moving with the tick, the token bucket its remaining tokens ("Tokens: … of 3"), the leaky bucket the requests waiting in it ("In the bucket: … of 3").',
      'With b = 3 the four shapes differ on the same arrivals. Fixed window: two columns of 3 at ticks 11 and 12, 6 through in 3 ticks, 17 passed. Sliding window: one column at tick 11, all six at tick 12 rejected, 14 passed, never more than 3 in any 3 ticks. Token bucket: 3 in a single tick, 15 passed. Leaky bucket: never more than 1 per tick, the burst leaving as a staircase shifted right, 15 passed with a total wait of 8 ticks.',
      'Five meters carry the round: Passed, Rejected, Peak in a tick, Peak in b ticks and Total wait. A bracket under the Server lane marks the "busiest b ticks".',
      'Across b = 2, 3, 4, 6 the peak in b ticks is 4, 6, 8, 12 for the fixed window (twice b) and 2, 3, 4, 6 for the sliding window (b); the token bucket\'s peak in a tick is b, the leaky bucket\'s is always 1, and the leaky bucket\'s total wait grows 3, 8, 12, 39 as its tail stretches from tick 23 to 25.',
      'Time is in whole ticks, a unit chosen for the example, with an average limit of 1 per tick. The token bucket starts full, the leaky bucket is the queueing kind with room for b, and the sliding window is the log kind that records accepted times. Rejected requests do not come back, and network delay is zero. The burst is placed across ticks 11 and 12 on purpose, so a window boundary falls inside it for every b.',
    ],

    screen: {
      affordances: [
        'Playback controls (play, step, pause, reset, speed) plus two segmented handles: "Limiter" with Fixed window, Sliding window, Token bucket and Leaky bucket (starting at Fixed window), and "Burst b" with 2, 3, 4 and 6 (starting at 3).',
        'The move that makes the idea land is keeping b fixed and stepping through the four limiters: two columns, one column, a single tall column, then a staircase — the same limit producing four different traffic shapes at the server.',
        'The code panel, titled "Rate limiter", shows `limitRequests`, which records for each request the tick it got through, or −1 when rejected. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article must help a reader choose among rate limiting algorithms and needs one picture where the same limit visibly lets a burst through as a doubled spike, a capped column, a single tick of b, or a delayed staircase.',
      'A reader thinks "1 request per tick with bursts of b" fully specifies behaviour, and the article needs to show that the limiter choice still decides the peak and the added delay.',
    ],

    avoidWhen: [
      'The subject is distributed rate limiting across many nodes or a shared counter store. There is one limiter and one server here.',
      'The article is about load shedding, backpressure or retries after rejection. Rejected requests simply vanish; nobody is told to slow down and nothing is resent.',
      'The article needs the approximate sliding window that weights the previous window\'s count. The sliding window here keeps a log of accepted times.',
    ],

    contrastWith: [
      {
        concept: 'tokenBucket',
        note: 'Saving idle capacity as tokens is one limiter\'s mechanism; comparing it with windows and a leaky bucket shows that its distinguishing trait is allowing a whole burst in a single instant.',
      },
      {
        concept: 'leakyBucket',
        note: 'Smoothing output by holding requests is one limiter\'s mechanism; set beside the others it is the only one that trades rejections and peaks for added delay.',
      },
      {
        concept: 'slidingWindowCount',
        note: 'The boundary flaw of a fixed window is a claim about two counting rules; the comparison places that flaw among four limiters that all honour the same average rate.',
      },
      {
        concept: 'backpressure',
        note: 'A rate limiter enforces a quota decided in advance regardless of how the server is doing; backpressure reacts to the receiver actually falling behind.',
      },
    ],
  },
};
