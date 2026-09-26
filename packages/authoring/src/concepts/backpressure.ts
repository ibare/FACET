/**
 * backpressure 개념 선언.
 *
 * canonical facet 은 `facet:backpressure` — 서버 한 대(힘 틱당 요청 둘)에 보내는 쪽이 틱마다 요청을 보낸다.
 * 손잡이 "When overloaded"(다 받음 · 버림 · 배압, 처음 다 받음)와 "Send rate"(1..4, 처음 3)를 돌리면
 * 보냄 1 · 2 에서는 셋이 같고, 보냄 3 · 4 에서 다 받음만 제때 6 · 4 로 꺼진다. 버림과 배압은 제때 36 으로 같고
 * 잃음이 쌓이는 자리(문 앞 503 ↔ 보내는 쪽 곁)만 갈린다.
 *
 * ── 묶음 안에서의 자리 (완제품 셋 + 조각 다섯, flow-control)
 *
 * 이 완제품 아래 조각은 둘이다 — 크레딧이 되돌아가 보내는 쪽을 멈춰 세우는 한 장면(`tellThemToSlowDown`)과
 * 다 받는 서버 ↔ 거절하는 서버 두 대를 나란히 둔 한 장면(`shedToSurvive`). 이쪽은 **세 방식을 한 서버에 갈아 끼우고
 * 보내는 빠르기를 올리는 조작**을 맡는다. 그래서 definition 은 three policies · on-time · where the losses land 를 쥐고,
 * 조각들이 쥔 credit · stalls · 503 at once · every client times out 은 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `backpressure.md` 가 밝힌 것):
 *  - 틱은 예로 정한 단위, 20 틱. 기한 4 틱 · 한도 4 도 예로 정한 값. 망 지연 0, 취소 없음.
 *  - 고르게 나눠 쓰기(processor sharing): 요청 하나 12 조각, 서버 힘 틱당 24 조각을 든 수로 정수 나눔, 나머지는 먼저 든 것부터.
 *  - 배압은 크레딧이 아니라 한도로 그렸다. 보내는 쪽은 기한을 헤아려 늦을 것을 제 곁에서 버린다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const backpressureConcept: FacetConceptSource = {
  id: 'backpressure',
  label: 'Backpressure vs Load Shedding vs Accept-All (Overload Policies)',
  canonicalFacet: 'facet:backpressure',

  surface: {
    definition:
      'Three overload policies for one server — accept everything, reject at the door, or hold the excess at the sender — where accepting everything collapses on-time throughput and the other two finish equally many, differing only in where the losses land.',
    exemplarKeywords: [
      'backpressure',
      'overload handling strategies',
      'load shedding vs backpressure',
      'unbounded queue collapse',
      'goodput vs throughput',
      'wasted work after deadline',
      'request deadline propagation',
      'HTTP 503 Service Unavailable',
      'HTTP/2 flow control',
      'reactive streams demand',
      'what happens when a server is overloaded',
    ],
  },

  briefing: {
    observable: [
      'One Sender feeds one Receiver whose capacity reads "24 units per tick" — one request is 12 units, so the receiver finishes two requests per tick. Four piles sit around them: "Dropped by sender" beside the sender, "At the door: 503" in front of the receiver, and "On time" and "Wasted (late)" behind it.',
      'Each tick plays as a work step then an arrive step. The caption reads, for example, "Tick 4 · work: split among 9 · 2 units each (+1 for the first 6) · finished 0", then "Tick 4 · 3 arrive: all taken in", and a status line keeps "Held … · sender line … · on time …% of … made".',
      'Under Accept all at send rate 3, the held count keeps climbing — 3, 6, 9, 12, dipping only when a few finish — until it reaches 36, and each request\'s share of the 24 units shrinks with it. Requests past their 4-tick deadline keep receiving work and end up in "Wasted (late)". After 20 ticks: On time 6, Wasted 18.',
      'Under Reject the receiver never holds more than 4; arrivals beyond that go to "At the door: 503". Under Backpressure the receiver also holds at most 4, and the overflow waits in a line beside the sender, which drops a request itself when it would miss its deadline. At rate 3 both finish 36 on time; Reject shows 20 at the door, Backpressure 12 dropped by the sender.',
      'At send rates 1 and 2 the three policies draw the same picture: 19 and 38 on time, 95%. At rate 4 Accept all falls to 4 on time with 28 wasted, while Reject and Backpressure stay at 36 on time, with 40 rejected at the door or 28 dropped by the sender.',
      'The model uses integer ticks as an example time unit, a 4-tick deadline and a limit of 4 as example values, zero network delay, and a receiver that never cancels work for a client that gave up. Capacity is shared evenly among the requests held (processor sharing). Backpressure is drawn as a limit on what the receiver admits rather than as returned credits, and the sender checks whether a request can still finish in time before sending it. The screen does not footnote these choices.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "When overloaded" with Accept all, Reject and Backpressure (starting at Accept all), and "Send rate" from 1 to 4 requests per tick (starting at 3). Each change replays the 20 ticks.',
        'Four readouts follow the run: On time, Wasted (late), 503, and Dropped by sender.',
        'The move that makes the idea land is holding the rate at 3 and switching policy: On time jumps from 6 to 36 when leaving Accept all, and between Reject and Backpressure only the pile that fills moves, from the door to the sender side. Dropping the rate to 2 makes all three identical.',
        'The code panel, labelled "One overloaded server", starts empty with a "+ Add language" button; the function `overload` runs the same count as the screen and highlights the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article must argue that taking every request under overload is worse than refusing some, and wants a single server where switching the policy moves on-time completions from 6 to 36.',
      'A design discussion weighs rejecting with 503 against pushing back on the producer, and needs to show they finish the same work so the real choice is where the excess waits and gets dropped.',
    ],

    avoidWhen: [
      'The article is about TCP receive windows or congestion windows at the packet level. The sender and receiver here exchange whole requests in ticks, with no acknowledgments or segments.',
      'The subject is queue length and waiting time as utilisation approaches one. There is no arrival randomness here; the send rate is fixed per tick.',
      'The topic is rate limiting a client by a quota such as a token bucket. The limit here is the receiver\'s capacity to hold work, not an allowance per client.',
    ],

    contrastWith: [
      {
        concept: 'tellThemToSlowDown',
        note: 'Credits flowing back to pace a sender are one mechanism for backpressure; comparing backpressure with shedding and with accepting everything asks what each policy does to on-time work once the sender outruns the receiver.',
      },
      {
        concept: 'shedToSurvive',
        note: 'That refusing some requests beats sharing capacity among all of them is one pairwise claim; the three-way comparison adds that pushing back on the sender finishes the same amount as refusing, with the loss moved to the sender side.',
      },
      {
        concept: 'receiverWindow',
        note: 'A receive window is the transport-layer way for a receiver to cap what is in flight; backpressure as an overload policy is the same idea stated for request-serving systems, where deadlines decide whether held work is still worth doing.',
      },
      {
        concept: 'queueingModel',
        note: 'Queueing theory predicts how waiting time grows as arrivals approach service capacity; overload policies decide what to do once arrivals already exceed it.',
      },
      {
        concept: 'rateLimiting',
        note: 'A rate limiter enforces an agreed allowance per client whether or not the server is busy; overload policies react to the server\'s own capacity being exceeded.',
      },
      {
        concept: 'kafkaPattern',
        note: 'A durable log lets a slow consumer fall behind without losing messages, which is one way to absorb a rate mismatch; backpressure instead slows or drops at the producer so no unbounded backlog forms.',
      },
    ],
  },
};
