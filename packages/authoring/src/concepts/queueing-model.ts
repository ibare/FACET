/**
 * queueingModel 개념 선언.
 *
 * canonical facet 은 `facet:queueingModel` — 요청 마흔이 서버 하나에 먼저 온 차례로 들어온다. 손잡이 둘은
 * 들쭉날쭉(고름 · 반쯤 · 지수, 처음 지수)과 부하 ρ(0.5 · 0.7 · 0.8 · 0.9, 처음 0.8). 같은 ρ 에서 고름은 아무도
 * 기다리지 않고, 반쯤 · 지수로 올릴수록 기다린 요청과 기다림이 는다. 기다림은 린들리 점화식으로 센다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 각각 한 장면이다 — 도착이 처리보다 빠르면 줄이 끝없이 는다(`arrivalVsService`) · 줄 길이는
 * 빠르기와 머묾의 곱(`lengthIsRateTimesWait`) · 여유가 고르게 줄 때 머묾이 끝에서 치솟는다(`kneeOfTheCurve`).
 * 이쪽의 주장은 **같은 부하에서 들쭉날쭉함이 기다림을 가른다** 이고, 손잡이 둘을 돌려 견주는 것이 몫이다.
 * 그래서 definition 은 same load · evenly spaced · random / exponential · most requests wait 를 쥐고,
 * 조각들이 쥔 grows without bound · arrival rate times · spare capacity · shoots up 을 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `queueingModel.md` 가 밝힌 것):
 *  - 시각은 처리 평균을 1 로 둔 단위 시간이다. 망 지연 0. 서버 하나, 먼저 온 차례, 줄 한도 없음.
 *  - 난수는 x ← (75·x + 74) mod 65537, 씨앗 42 의 선형 합동 생성기. 요청마다 u 둘(간격, 처리).
 *    손잡이를 어느 값으로 돌려도 같은 u 열을 쓴다.
 *  - 고름 = 늘 평균, 반쯤 = 평균의 0.5~1.5 배 고르게, 지수 = −ln(1 − u) × 평균 (M/M/1 모양).
 *  - 표본 마흔의 평균(0.75 ~ 1.77)은 M/M/1 식 ρ/(1−ρ) 와 다르다 — 식은 긴 시간의 평균이다.
 *  - 줄은 기다리는 요청만 센다. 처리 중인 하나는 세지 않는다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다. 난수 뽑기는 코드 패널 밖에서 한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const queueingModelConcept: FacetConceptSource = {
  id: 'queueingModel',
  label: 'Queueing Model (Variability Decides the Wait at the Same Load)',
  canonicalFacet: 'facet:queueingModel',

  surface: {
    definition:
      'Two single-server queues at the same load can wait very differently: with perfectly regular arrivals and constant service times nobody waits, while random, exponentially distributed gaps make most requests queue.',
    exemplarKeywords: [
      'queueing theory',
      'M/M/1 queue',
      'D/D/1 vs M/M/1',
      'variability causes waiting',
      'burstiness and queueing delay',
      'Poisson arrivals',
      'exponential service time',
      'server utilization ρ',
      'Lindley recursion',
      'why queues form below full capacity',
      'coefficient of variation',
    ],
  },

  briefing: {
    observable: [
      'Forty requests, q1 to q40, arrive at one first-come-first-served server. A time strip shows each request as a dot at its arrival time; one request arrives per step. The strip ends at 86.52 for every setting, so turning a handle moves the dots along a fixed axis.',
      'Above each dot a bar rises for that request\'s wait; a request that did not wait has no bar. Below the strip a "service" lane draws each service from start to departure, and the gaps between those bars are the time the server sat idle.',
      'At the bottom sits the server and its line as they were at the moment the current request arrived: if the server is busy the newcomer, marked in yellow, joins the tail of the line; if it is free the newcomer goes straight in. Captions read like "q3: arrives at 3.14 · waits 2.89 · leaves at 6.19" or "q1: arrives at 0.06 · server free, served at once · leaves at 1.24".',
      'The last step sums up: a dashed "mean" line is drawn across the wait bars and the caption gives the mean and longest wait, "exponential · ρ 0.8: mean wait 1.24 · longest wait 8.64" at the start. Two meters, "waited" and "longest line", count the requests that waited and the most requests standing in line when one arrived; the one in service is not counted.',
      'With even variability nobody waits at any load, 0.5 through 0.9 — waited 0, longest line 0. Halfway gives 2, 12, 18 and 25 waiting requests across the four loads; exponential gives 19, 24, 25 and 29, with mean waits 0.75, 1.06, 1.24 and 1.77 and longest lines of 3 or 4.',
      'At the starting setting, exponential and ρ 0.8, the round ends with mean wait 1.24, 25 of 40 requests waited and a longest line of 3.',
      'Time is in units where the mean service time is 1; network delay is zero and the line has no limit. Gaps and service times come from a fixed linear congruential generator with seed 42, and every handle setting reuses the same random draws, so only the shape of the spacing changes. Exponential is the M/M/1 shape; the 40-request averages are one sample and do not equal the long-run formula ρ/(1−ρ).',
    ],

    screen: {
      affordances: [
        'Playback controls (play, step, pause, reset, speed) plus two segmented handles: "Variability" with even, halfway and exponential (starting at exponential), and "Load ρ" with 0.5, 0.7, 0.8 and 0.9 (starting at 0.8). A round is 42 steps: the setup, one step per request, and the sum-up.',
        'The move that makes the idea land is holding the load and turning Variability from exponential to even: the wait bars vanish and both meters fall to 0, then return when turned back. Raising Load ρ instead squeezes the same dots leftward and makes bars rise where they crowd.',
        'The code panel, titled "Wait by the Lindley recursion", shows how each wait follows from the previous request\'s wait and service minus the next gap, with negative values cut to 0. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article claims that a server below 100 percent busy should not build a queue, and needs to show that at the same load perfectly regular traffic waits zero while random traffic makes most requests wait.',
      'A reader needs to see why queueing theory models arrivals as a Poisson process: the wait comes from clustering and uneven service, and the handle removes exactly that and nothing else.',
    ],

    avoidWhen: [
      'The article is about multiple servers, priority classes or dropping requests when a line is full. There is one server, first-come-first-served, with an unlimited line.',
      'The article needs the M/M/1 formulas as exact values. The screen shows one 40-request sample, whose averages differ from the long-run formula.',
      'The subject is a queue as a data structure (enqueue, dequeue, FIFO order). Here the queue is waiting time in front of a server.',
    ],

    contrastWith: [
      {
        concept: 'arrivalVsService',
        note: 'When arrivals outpace service the backlog grows without end whatever the pattern; below capacity the rate alone no longer decides, and how irregular the traffic is becomes the cause of waiting.',
      },
      {
        concept: 'kneeOfTheCurve',
        note: 'The steep rise of delay near full load is itself a product of randomness; with the same load and regular traffic there is no knee, because there is no waiting at all.',
      },
      {
        concept: 'lengthIsRateTimesWait',
        note: 'Little\'s law links average line length, arrival rate and time in system whatever the distribution; it says nothing about how long the wait will be, which is what variability decides.',
      },
      {
        concept: 'queueFifo',
        note: 'A FIFO queue as a data structure fixes the order of departure; a queueing model asks how long items spend in that order when a single server works through them.',
      },
    ],
  },
};
