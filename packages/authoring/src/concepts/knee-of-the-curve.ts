/**
 * kneeOfTheCurve 개념 선언.
 *
 * canonical facet 은 `facet:kneeOfTheCurve` — 서버 하나, 처리율 μ = 10 건/초. 도착률 λ 를 1 부터 9 까지 한 걸음에
 * 1 씩 같은 크기로 올리며 M/M/1 의 평균 머묾 W = 1000 / (μ − λ) ms 를 기둥으로 세운다. 여유는 9 에서 1 로 고르게
 * 주는데 늘어난 몫은 14 → 500 ms 로 커진다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `queueingModel` 은 같은 부하에서 들쭉날쭉함을 돌려 기다림이 갈리는 것을 견준다. 이쪽은 부하를 고르게
 * 올릴 때 평균 머묾이 **고르게 늘지 않고 끝에서 치솟는** 모양 하나다. `arrivalVsService` 는 부하가 1 을 넘어
 * 줄이 끝없이 자라는 쪽, `lengthIsRateTimesWait` 는 평균들의 곱 관계다. 그래서 definition 은 equal steps ·
 * spare capacity · slowly at first · shoots up · nears capacity 를 쥐고, 들쭉날쭉 · 끝없이 · 곱을 쓰지 않는다.
 *
 * 전제 (설명 글 `kneeOfTheCurve.md`):
 *  - 수는 시뮬레이션이 아니라 M/M/1 식에서 셈한 정상 상태 평균이다(포아송 도착 · 지수 처리 · 서버 하나 · 줄 한도 없음).
 *  - 처리율 10 건/초는 예로 정한 값. 시간 축은 없다 — 걸음 하나는 도착률을 한 칸 올려 다시 본 것이다.
 *  - 도착과 처리가 고르면 λ < μ 에서 기다림은 0 — 무릎을 만드는 것은 들쭉날쭉함이다 (화면 밖 전제).
 *  - λ ≥ μ 는 다루지 않는다.
 *  - 화면에 코드가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const kneeOfTheCurveConcept: FacetConceptSource = {
  id: 'kneeOfTheCurve',
  label: 'The Knee of the Latency Curve (Delay Shoots Up Near Capacity)',
  canonicalFacet: 'facet:kneeOfTheCurve',

  surface: {
    definition:
      "Raising a server's arrival rate in equal steps shrinks its spare capacity evenly, yet mean response time rises slowly at first and then shoots up as the load nears capacity.",
    exemplarKeywords: [
      'latency vs utilization curve',
      'hockey stick latency',
      'knee of the curve',
      'response time at high utilization',
      'why not run servers at 90% utilization',
      'headroom and capacity planning',
      '1/(μ − λ)',
      'M/M/1 mean response time',
      'nonlinear latency growth',
    ],
  },

  briefing: {
    observable: [
      'A "Server" band at the top has ten cells for its capacity, "Capacity: 10/s". Filled cells are the arrival rate and empty cells are the spare capacity; readouts show "Arrivals", "Spare" and "Utilization". The first screen has the server and capacity only: "Capacity: 10 per second. No arrivals yet."',
      'Each step raises the arrival rate by exactly 1 per second, from 1 to 9, so one more cell fills and the spare count drops by one: 9, 8, 7 … 1.',
      'Below, a chart titled "Mean time in system W (ms)" over "Arrival rate λ (per second)" gains one bar per step. A dashed line marks "Service time alone: 100 ms"; the part of each bar above it is time spent waiting in line.',
      'Each new bar rises from the previous height to its own, and the added part stays highlighted with a "+… ms" label giving its size. The increments grow every step: 13.9, 17.9, 23.8, 33.3, 50.0, 83.3, 166.7 and 500.0 ms.',
      'W goes 111.1, 125.0, 142.9, 166.7, 200.0, 250.0, 333.3, 500.0 and 1000.0 ms. The five steps from λ 1 to 6 add 138.9 ms in total, while the single step from 8 to 9 adds 500 ms; the last caption reads "Arrivals: 9/s · spare: 1/s · W: 500.0 → 1000.0 ms · 9.0× the first".',
      'The numbers are steady-state averages from the M/M/1 formula W = 1 / (μ − λ), not a simulation: arrivals are random (Poisson), service times exponential, one server, unlimited line. There is no time axis — each step is the same server re-examined at a higher arrival rate. The capacity of 10 per second is an example value, and λ never reaches μ.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself through ten steps, the empty server and then λ = 1 to 9, and stops. A Replay button and a scrub strip sit below it.',
        'Scrubbing between the early and late steps sets the evenly shrinking spare cells against bars whose highlighted increments grow larger each time.',
        'All values are fixed, so the table of W and increments can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article argues for keeping headroom — not running a service near full utilization — and needs to show that the last few steps of load cost far more delay than all the earlier ones.',
      'A reader assumes latency grows in proportion to load, and the article needs equal load steps producing increments that climb from about 14 ms to 500 ms.',
    ],

    avoidWhen: [
      'The article is about overload, where arrivals exceed capacity. Every rate here stays below the service rate.',
      'The subject is how a queue changes over time under one load. There is no time axis; each step is a different load.',
      'The article needs measured latency from a real system. The bars come from a formula with specific randomness assumptions.',
    ],

    contrastWith: [
      {
        concept: 'queueingModel',
        note: 'The knee is what random arrivals and service produce as load rises; holding load fixed and removing the randomness removes the waiting and with it the knee.',
      },
      {
        concept: 'arrivalVsService',
        note: 'The knee describes delay just below capacity, where averages still exist; past capacity the backlog diverges and there is no finite average to plot.',
      },
      {
        concept: 'lengthIsRateTimesWait',
        note: 'Little\'s law converts a time in system into an average number in the system at a given rate; the knee concerns how that time itself grows as the rate approaches capacity.',
      },
      {
        concept: 'shedToSurvive',
        note: 'The steep delay near capacity is why systems turn work away before they are full; load shedding is a response to the knee, not a description of it.',
      },
    ],
  },
};
