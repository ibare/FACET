/**
 * slidingWindowCount 개념 선언.
 *
 * canonical facet 은 `facet:slidingWindowCount` — 한도 "10 초에 4 건" 을 고정 창과 미는 창(로그 꼴)이 같은 걸음에
 * 판정한다. 요청 여덟 s1..s8 이 6 · 8 · 9 · 9 · 10 · 10 · 11 · 13 초에 온다. 고정 창은 10 초 경계에서 셈이 0 으로
 * 돌아가 여덟을 모두 받고(7 초 사이에 8 건, 한도의 두 배), 미는 창은 넷을 받고 넷을 거절한다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `rateLimiting` 은 같은 한도의 네 제한기가 몰림을 흘려보내는 모양을 견준다. 형제 조각 `tokenBucket` 은
 * 쌓아 둔 여유를 한꺼번에 쓰는 쪽, `leakyBucket` 은 줄에 붙들어 같은 간격으로 내보내는 쪽이다. 이쪽은 **창을
 * 세는 두 규칙** — 칸을 고정하느냐 요청마다 밀어 보느냐 — 의 경계 차이 한 장면이다. 그래서 definition 은
 * fixed-window counter · resets at each boundary · twice the limit · sliding log · preceding interval 을 쥐고,
 * 토큰 · 같은 간격 · 줄 같은 말을 쓰지 않는다.
 *
 * 전제 (설명 글 `slidingWindowCount.md`):
 *  - 초는 예로 정한 단위. 모든 일이 정수 초에 일어난다.
 *  - 두 제한기 모두 받아들인 요청만 센다. 거절은 셈에 들지 않는다.
 *  - 고정 칸은 ⌊t / 10⌋, [0,10) · [10,20). 미는 창은 로그 꼴로 (t − 10, t] 를 센다. 가중 어림 꼴이 아니다.
 *  - 손잡이 없음. 화면에 코드가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const slidingWindowCountConcept: FacetConceptSource = {
  id: 'slidingWindowCount',
  label: 'Fixed Window vs Sliding Window Rate Counting',
  canonicalFacet: 'facet:slidingWindowCount',

  surface: {
    definition:
      'A fixed-window request counter resets at each interval boundary, so requests packed just before and after it reach twice the limit, while a sliding log counting the preceding interval never exceeds it.',
    exemplarKeywords: [
      'fixed window counter',
      'sliding window log',
      'sliding window rate limiter',
      'fixed window boundary problem',
      'burst at window edge',
      'requests per minute limit',
      'counter reset at the minute boundary',
      'Redis sorted set rate limiter',
      'limit exceeded twice across windows',
    ],
  },

  briefing: {
    observable: [
      'The limit is "Limit: 4 per 10 s" for both limiters. A top row places eight requests, s1 to s8, at 6, 8, 9, 9, 10, 10, 11 and 13 s on a 0–20 s axis; the two at the same second are stacked and judged in data order.',
      'Two lanes judge each request in the same step: "Fixed window" with two cells, 0–10 s and 10–20 s, and "Sliding window" with a 10-second frame that follows the request time. Captions give the rule used, such as "Cell 0–10 s · accepted before: 3" and "Last 10 s up to 9 s · accepted before: 3", with an Accept or Reject mark on each side.',
      'For s1 to s4 both lanes accept, and both counters reach 4/4.',
      'When s5 arrives at 10 s, the fixed window\'s highlight jumps to the next cell and its count goes back to 0, then 1/4 — "Cell 10–20 s · accepted before: 0 · Accept". The sliding frame moves to 10 s but s1 to s4 are still inside it, so it stays at 4/4 and rejects: "Last 10 s up to 10 s · accepted before: 4 · Reject".',
      'The same happens for s6, s7 and s8: the fixed window accepts all eight, the sliding window accepts 4 and rejects 4, the rejected ones left above the lid of its lane.',
      'Beside each lane "Accepted in the last 10 s" measures the same interval for both. On the fixed-window side it climbs 1 to 8 — eight requests between 6 s and 13 s, twice the limit — while on the sliding side it rises to 4 and stays there.',
      'Both limiters count accepted requests only. The fixed cell is ⌊t / 10⌋ with the start included and the end excluded; the sliding window is the log kind, keeping every accepted time and counting those in (t − 10, t], not the approximation that weights the previous window. The second is a unit chosen for the example.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself through nine steps — the setup and one step per request — and stops. A Replay button and a scrub strip sit below it.',
        'Scrubbing between step 4 and step 5 shows the moment that matters: crossing 10 s, the fixed window starts over at 0 while the sliding window still sees four.',
        'The requests and limit are fixed, so every count can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article warns that a "N per minute" limit implemented with a fixed window lets up to 2N through around a minute boundary, and needs a concrete case where both halves are individually within the limit.',
      'A reader needs to see why a sliding log is stricter: it rejects at the boundary because the requests just before it are still inside its interval.',
    ],

    avoidWhen: [
      'The subject is the TCP sliding window or any flow-control window. The windows here are time intervals for counting requests.',
      'The article is about SQL window functions or sliding-window algorithms over arrays. This is request counting for rate limiting.',
      'The article wants the approximate sliding window counter that blends the previous and current window counts. The sliding window here keeps exact timestamps.',
    ],

    contrastWith: [
      {
        concept: 'tokenBucket',
        note: 'Window counters limit how many were accepted within an interval of time; a token bucket limits by allowance saved up, so its burst depends on how long the client has been idle rather than on where a boundary falls.',
      },
      {
        concept: 'rateLimiting',
        note: 'The boundary flaw is specific to fixed windows; the wider comparison is how every limiter with the same average rate shapes a burst differently.',
      },
      {
        concept: 'receiverWindow',
        note: 'A TCP receive window limits bytes outstanding by the receiver\'s free buffer space; a rate-limiting window limits requests per interval of time.',
      },
    ],
  },
};
