/**
 * retryAndBackoff 개념 선언.
 *
 * canonical facet 은 `facet:retryAndBackoff` — 손님 36 명(틱 1 에 무리 12 + 틱 0..11 에 틱마다 2)이 감당 6 의 서버를
 * 찾는다. 서버는 틱 1 부터 장애 길이만큼 죽는다. 손잡이 "How to come back"(Immediately · Exponential ·
 * Exponential + jitter, 처음 Immediately)과 "Outage length"(1..5, 처음 3)를 돌린다. 장애 3 에서 살아난 뒤 몰림은
 * 20 · 16 · 9, 마지막으로 받은 틱은 11 · 31 · 11.
 *
 * ── 묶음 안에서의 자리
 *
 * 조각 둘이 이 완제품에서 나왔다 — 곧바로 재시도가 끊긴 동안 무더기를 불리는 한 장면(`retryStorm`)과, 함께 실패한 무리가
 * 흩음 유무에 따라 한 칸으로 / 여러 칸으로 돌아오는 한 장면(`jitteredBackoff`). 이쪽은 **다시 오는 법 셋을 같은 장애에
 * 갈아 끼우고 장애 길이를 돌리는 조작**을 맡는다 — 곧바로는 몰림이 크고, 지수는 몰림이 낮아도 한 덩이로 늦게 오고, 흩음이
 * 둘 다 푼다. 그래서 definition 은 three retry policies · recovery · peak · last served 를 쥐고, 조각들이 쥔
 * backlog grows · stacks on new traffic · collide again · slots 는 쓰지 않는다.
 *
 * 전제 (설명 글 `retryAndBackoff.md`): 틱은 예로 정한 단위, 망 지연 0, 포기 없음(최대 시도 수 없음). 지수 창 2^k (k 상한 5),
 * 흩음은 full jitter 에서 0 을 뺀 1..창. 무작위는 선형 합동 생성기 x ← (75·x + 74) mod 65537, 씨앗 42 로 손님마다 · 실패
 * 차례마다 미리 뽑는다. 다른 씨앗(7 · 99 · 1234 · 31337)에서도 흩음의 몰림이 가장 낮았다. 코드 패널은 IR 하나를 여섯 언어로.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const retryAndBackoffConcept: FacetConceptSource = {
  id: 'retryAndBackoff',
  label: 'Retry Policies After an Outage (Immediate, Exponential Backoff, Jitter)',
  canonicalFacet: 'facet:retryAndBackoff',

  surface: {
    definition:
      'Three retry policies against the same outage: immediate retries create the largest peak on recovery, plain exponential backoff lowers it but returns clients late in one clump, and exponential backoff with jitter both lowers the peak and finishes early.',
    exemplarKeywords: [
      'retry with exponential backoff',
      'exponential backoff and jitter',
      'full jitter',
      'retry policy comparison',
      'recovering from an outage',
      'retry storm after recovery',
      'AWS SDK retry strategy',
      'resilience4j retry',
      'gRPC retry backoff',
      'how long to wait before retrying',
      'client retry best practices',
    ],
  },

  briefing: {
    observable: [
      'A row of columns numbered tick 0 to 31. Each dot stacked on a column is one customer arriving at that tick, numbered in arrival order. A red background marks ticks when the Server is down; a dashed line across the columns marks "cap: 6", what the server can accept in one tick.',
      'Each step is one tick in which someone arrives: "Tick 4 · arrived: 20 · served: 6 · failed: 14". While the server is up the lowest six dots go in; the rest fail and fly to the column of the tick they will come back on, waiting there as dashed red rings marked "coming back".',
      'With Immediately and a 3-tick outage (ticks 1–3), every failed customer jumps to the next column: 14, 16 and 18 arrive during the outage, and 20 arrive on tick 4, the tick the server returns. The pile then drains six at a time and the last customer is served on tick 11.',
      'With Exponential, a customer waits 2^k ticks after its k-th failure, so customers that failed together return together: 16 arrive as one block on tick 7, eight together on tick 15 where two fail again, and those two come back on tick 31.',
      'With Exponential + jitter, each customer draws its own wait between 1 and 2^k, so one tick\'s failures scatter over several columns. With a 3-tick outage the largest pile after recovery is 9 and the last customer is served on tick 11.',
      'Four readouts compare the policies. For a 3-tick outage, Immediately / Exponential / Exponential + jitter give Peak after recovery 20 / 16 / 9, Failures after recovery 32 / 12 / 6, Last served tick 11 / 31 / 11, Attempts 116 / 80 / 76. Under Immediately the peak grows straight with the outage: 16, 18, 20, 22, 24 for lengths 1 to 5.',
      'Ticks are an example time unit, network delay is zero, and customers never give up. The exponential window stops doubling at 2^5, jitter drops the zero wait from full jitter, and draws come from a fixed linear congruential generator with seed 42, drawn per customer and per failure so a draw stays the same across handle changes. The screen does not footnote these choices.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "How to come back" with Immediately, Exponential and Exponential + jitter (starting at Immediately), and "Outage length" from 1 to 5 ticks (starting at 3). Ticks nobody visits are skipped, so Exponential jumps straight from tick 15 to 31.',
        'The move that makes the idea land is keeping the outage at 3 and stepping through the three policies: the tall column on tick 4 becomes a block on tick 7 and a late pair on tick 31, then breaks into short columns that finish by tick 11.',
        'The code panel, labelled "Retries against a server that goes down", starts empty with a "+ Add language" button; `simulateRetries` runs the same count as the screen and highlights the branch of the chosen policy on ticks with a failure. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article recommends exponential backoff with jitter and needs to justify both halves: that backoff alone lowers the peak but leaves one late clump, and that adding jitter is what spreads it out.',
      'A reader wants to see how the length of an outage changes the damage done by naive retries, and turning the outage handle under Immediately makes the recovery peak rise step by step.',
    ],

    avoidWhen: [
      'The article is about Ethernet or wireless collision backoff between stations sharing a medium. Here many clients retry against one server with a fixed capacity.',
      'The subject is a circuit breaker that stops calls to a failing service. Every customer here keeps retrying until served; nothing decides to stop calling.',
      'The topic is idempotency or duplicate side effects of retried requests. Each request here is simply served or failed.',
    ],

    contrastWith: [
      {
        concept: 'retryStorm',
        note: 'Why immediate retries overwhelm a recovering server is one failure mode; choosing a retry policy weighs that against the lateness of fixed backoff and the spreading effect of jitter.',
      },
      {
        concept: 'jitteredBackoff',
        note: 'That randomized waits split a group that failed together is the core of jitter; a retry policy comparison also counts what it costs and gains against immediate retry and plain backoff during an outage.',
      },
      {
        concept: 'collisionAndBackoff',
        note: 'Collision backoff resolves contention between peers on a shared medium; client retry backoff protects a single overloaded server from its own callers.',
      },
      {
        concept: 'circuitBreaker',
        note: 'Backoff decides when each client tries again; a circuit breaker decides whether to try at all, stopping calls for a while after repeated failures.',
      },
      {
        concept: 'backpressure',
        note: 'Retry policy shapes how rejected clients return; overload policy decides what the server does with more than it can hold in the first place.',
      },
    ],
  },
};
