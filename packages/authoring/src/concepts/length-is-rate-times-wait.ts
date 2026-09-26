/**
 * lengthIsRateTimesWait 개념 선언.
 *
 * canonical facet 은 `facet:lengthIsRateTimesWait` — 서버 하나 · 먼저 온 차례. 0~16 초 동안 요청 여덟이 들어오고,
 * 요청마다 머문 시간(2 · 4 · 5 · 3 · 1 · 2 · 4 · 3 초)이 한 합 24 로 쌓인다. 그 합을 요청 수로 나누면 W = 3,
 * 관측 시간으로 나누면 L = 1.5, λ = 0.5 이므로 λ × W = 1.5. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `queueingModel` 은 같은 부하에서 들쭉날쭉함이 기다림을 가르는 것을 견주고, `arrivalVsService` 는 줄이
 * 끝없이 자라는 경우, `kneeOfTheCurve` 는 여유가 줄 때 머묾이 치솟는 모양을 말한다. 이쪽은 세 평균 사이의
 * **곱셈 관계**와 그 까닭(같은 칸을 가로 · 세로로 센다) 하나다. 그래서 definition 은 Little's law · average
 * number in the system · multiplied by · same total 을 쥐고, 줄이 자람 · 치솟음 · 들쭉날쭉 같은 말을 쓰지 않는다.
 *
 * 전제 (설명 글 `lengthIsRateTimesWait.md`):
 *  - L 은 시스템 안 전체(기다림 + 처리 중)의 수다. 기다리는 요청만 센 줄과 정의가 다르다.
 *  - 초는 예로 정한 단위. 모든 일이 정수 초에 일어나도록 고른 값. 무작위 없음.
 *  - 리틀의 법칙은 정상 상태에서 분포와 무관하게 선다. 여기서는 비어서 시작해 비어서 끝나는 구간이 그 자리를 대신해
 *    두 합이 정확히 같다.
 *  - 화면에 코드가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const lengthIsRateTimesWaitConcept: FacetConceptSource = {
  id: 'lengthIsRateTimesWait',
  label: "Little's Law (L = λW)",
  canonicalFacet: 'facet:lengthIsRateTimesWait',

  surface: {
    definition:
      "Little's law: the average number of requests in a system equals their arrival rate multiplied by the average time each spends there, because both count the same total of request-seconds.",
    exemplarKeywords: [
      "Little's law",
      'L = λW',
      'average queue length',
      'mean time in system',
      'throughput times latency',
      'concurrency equals rate times latency',
      'how many requests are in flight',
      'sizing a connection pool or thread pool',
      'area under the occupancy curve',
    ],
  },

  briefing: {
    observable: [
      'Eight requests, q1 to q8, one per row, are observed from 0 s to 16 s at one first-come-first-served server; the system is empty at the start and the end. On each row a bold tick marks the arrival time and a dotted cell block marks the service time, one cell per second.',
      'The first screen shows only arrivals and service times: "Stays are not known yet." Then eight steps go request by request, not in time order. Each request\'s service block slides right until the one before it clears, the gap it slid over stays as hollow waiting cells, and a caption reads like "q3: arrives at 1 s, starts at 5 s, leaves at 6 s. Stay: 5 s."',
      'Each stay, waiting plus service, flies to a column on the right under "Stay of each request". The stays are 2, 4, 5, 3, 1, 2, 4 and 3 seconds — uneven — and the column\'s "Sum" reaches 24.',
      'In the last step the same cells drop straight down into "Requests in the system at each second". The number in the system goes up and down between 0 and 3, but its "Sum" is again 24.',
      'The ending shows the same sum divided twice: "λ = 8/16 = 0.5/s · W = 24/8 = 3 s · L = 24/16 = 1.5", then "λ × W = 0.5 × 3 = 1.5". L and λW match because they count the same 24 cells — across rows as stays, down columns as occupancy.',
      'L here counts everything in the system, waiting and in service; a request is in the system at time t when arrival ≤ t < departure. Arrival and service times are fixed values chosen so that everything happens on whole seconds. Little\'s law holds in steady state for any distribution; here a window that starts and ends empty stands in for that, so the two sums are exactly equal.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself through ten steps — the first screen, one step per request, and the final regrouping — and stops. A Replay button and a scrub strip sit below it.',
        'The moment that makes the idea land is the last step, where the cells counted row by row as stays fall into columns counted second by second, and the sum stays 24.',
        'All values are fixed, so the article can quote each stay and every step of the arithmetic exactly.',
      ],
    },

    useWhen: [
      'The article uses L = λW, for example to estimate how many requests are in flight from throughput and latency, and the reader needs to see why it holds rather than accept it as a formula.',
      'A reader doubts that the law can hold when stays and queue length are irregular, and the article needs a case where stays vary from 1 to 5 seconds and the product still matches exactly.',
    ],

    avoidWhen: [
      'The article needs to predict how long requests will wait from the arrival rate alone. The law relates three averages; it does not compute wait from load.',
      'The subject is a queue that grows without end or a system that never empties. The observation window here starts and ends empty.',
      'The article defines queue length as waiting requests only. L here includes the request in service.',
    ],

    contrastWith: [
      {
        concept: 'queueingModel',
        note: 'Little\'s law ties averages together whatever the traffic looks like; how large the time in system actually becomes depends on the traffic\'s variability, which the law does not determine.',
      },
      {
        concept: 'kneeOfTheCurve',
        note: 'The law turns a measured time in system into an average count and back; the rise of that time toward capacity comes from a queueing model with distributional assumptions the law does not need.',
      },
      {
        concept: 'arrivalVsService',
        note: 'The law needs a system whose inflow and outflow balance over the window; when arrivals keep outpacing service there is no stable average to relate.',
      },
    ],
  },
};
