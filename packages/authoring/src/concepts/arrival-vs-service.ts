/**
 * arrivalVsService 개념 선언.
 *
 * canonical facet 은 `facet:arrivalVsService` — 서버 하나가 먼저 온 차례로 요청을 처리한다. 요청 열둘 r0..r11 이
 * 1 초마다 하나씩 오고 처리는 하나에 2 초라, 줄은 2 초마다 하나씩 길어지고 한 번도 줄지 않는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `queueingModel` 은 부하가 1 아래일 때 들쭉날쭉함이 기다림을 가르는 것을 손잡이로 견준다. 조각
 * `lengthIsRateTimesWait` 는 평균 사이의 곱셈 관계, `kneeOfTheCurve` 는 여유가 줄 때 평균 머묾이 치솟는 모양을 말한다.
 * 이쪽은 부하가 1 을 **넘는** 한 장면 — 들어옴이 나감보다 빠르면 줄이 두 빠르기의 차로 끝없이 자란다 — 하나다.
 * 그래서 definition 은 faster than · difference of the two rates · never drains · backlog 를 쥐고, 평균 · 무작위 ·
 * 여유 같은 말을 쓰지 않는다.
 *
 * 전제 (설명 글 `arrivalVsService.md`):
 *  - 초는 예로 정한 단위다. 두 빠르기의 비만 뜻이 있다.
 *  - 도착은 고르게 1 초 간격, 처리는 모두 2 초. 무작위 없음. 줄에 용량이 없어 버림 · 거절 · 재시도 없음.
 *  - 줄은 기다리는 요청만 센다 — 늘 들어옴 − 나감 = 줄 + 1.
 *  - 같은 초의 차례: 떠남 → 도착 → 서버가 비면 줄 머리가 처리에 들어간다.
 *  - 화면에 코드가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const arrivalVsServiceConcept: FacetConceptSource = {
  id: 'arrivalVsService',
  label: 'Arrivals Faster Than Service Make the Queue Grow Without End',
  canonicalFacet: 'facet:arrivalVsService',

  surface: {
    definition:
      'When requests arrive faster than a single server can finish them, the backlog of waiting requests grows by the difference between the two rates and never drains while arrivals continue.',
    exemplarKeywords: [
      'arrival rate greater than service rate',
      'utilization above 1',
      'unbounded queue growth',
      'overloaded server',
      'backlog keeps growing',
      'producer faster than consumer',
      'cumulative arrivals and departures',
      'unstable queue',
      'throughput lower than incoming load',
    ],
  },

  briefing: {
    observable: [
      'A server stands on the right and its line grows to the left. Requests r0 to r11 arrive one per second; each new one walks in from the left and joins the tail ("Joined the tail: r3"). Finished requests move to a "Done" pile to the right of the server ("Done, left: r0").',
      'The server takes 2 seconds per request, so every other second the head of the line moves into service ("Into service: r1") and the rest shift forward — and a request arriving in the same second immediately fills the gap.',
      'Below, a "Total count" panel draws two staircases over "Time (s)": In rises one step every second, Out one step every two seconds. A bracket between them at the current time shows "In − Out".',
      'Readouts track the round: "In", "Out", "In − Out" and "Waiting". The line counts only requests waiting, not the one in service, so In − Out is always Waiting + 1.',
      'The line lengthens by one every 2 seconds and never gets shorter: Waiting reads 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6 over seconds 0 to 11. At second 11 the round ends with In 12, Out 5 and In − Out 7 — r5 in service and six waiting.',
      'Arrivals are exactly 1 second apart and every service takes exactly 2 seconds; there is no randomness. The line has no capacity limit, so nothing is dropped, rejected or retried. The second is a unit chosen for the example; only the ratio of the two rates matters.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one second per step, twelve steps from second 0 to second 11, and stops. A Replay button and a scrub strip sit below it.',
        'Dragging the strip back and forth shows the gap between the In and Out staircases widening step by step while the Waiting count only ever rises.',
        'The rates and requests are fixed, so every count on the screen can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article states that a system receiving more than it can process will build an ever-longer queue, and the reader needs to see the backlog rise by a fixed amount every two seconds without ever falling.',
      'A reader believes a busy server eventually "catches up", and the article needs two diverging cumulative lines to show that it cannot while arrivals continue at the higher rate.',
    ],

    avoidWhen: [
      'The article is about waiting when arrivals are slower than service but irregular. Here arrivals always outpace service and there is no randomness.',
      'The subject is dropping, rejecting or slowing senders when the queue is full. The line here has no limit and nothing pushes back.',
      'The reader should see the queue shrink or reach a steady length. Arrivals never stop within the round, so the line only grows.',
    ],

    contrastWith: [
      {
        concept: 'queueingModel',
        note: 'Above capacity the rates alone decide the outcome and the queue diverges; below capacity the queue stays finite and how irregular the traffic is decides how long requests wait.',
      },
      {
        concept: 'kneeOfTheCurve',
        note: 'Delay shooting up as load nears capacity is the approach to this boundary from below; once arrivals exceed service there is no steady average left to shoot up.',
      },
      {
        concept: 'tellThemToSlowDown',
        note: 'A growing backlog is the problem; backpressure is one response to it, making the sender lower its rate to what the server can finish.',
      },
      {
        concept: 'queueFifo',
        note: 'First-in-first-out fixes the order in which queued items leave; whether the queue grows depends on the rates at which they enter and leave.',
      },
    ],
  },
};
