/**
 * shedToSurvive 개념 선언.
 *
 * canonical facet 은 `facet:shedToSurvive` — 같은 도착(틱 0..3 에 셋씩, r1..r12)을 두 서버가 받는다. 위는 다 받고
 * 힘 1 을 든 요청 수로 나눠(1/3 → 1/6 → 1/9 → 1/12) 기한 3 틱 안에 하나도 못 끝내고 손님 열둘이 모두 떠난다.
 * 아래는 한도 1 이라 틱마다 첫째만 들이고 둘을 `503` 으로 곧바로 튕겨, 들인 넷을 한 틱 만에 끝낸다 (0/12 ↔ 4/12).
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `backpressure` 는 세 방식 · 보내는 빠르기 손잡이로 잃음이 쌓이는 자리를 견준다. 이쪽은 **둘만**, 보내는 쪽 없이,
 * 한 순간의 몰림에서 "나눠 가지면 모두 놓친다 / 튕기면 나머지가 산다" 한 장면을 말한다. 이웃 조각 `tellThemToSlowDown` 은
 * 되돌아가는 신호로 속도를 늦추는 쪽이다. 그래서 definition 은 turns away at once · full capacity · every client gives up 을
 * 쥐고, credit · sender · where the losses land 는 쓰지 않는다. `isolateTheFlood` 와는 "누구나 거절" ↔ "찬 칸으로 가는 것만" 으로 가른다.
 *
 * 전제: 틱은 예로 정한 단위, 망 지연 0, 기한 3 틱 · 한도 1 은 예로 정한 값. 다 받는 쪽은 고르게 나눠 쓰기이고 떠난 손님의 일도
 * 계속 나눈다(취소 없음). 거절 판정은 "든 요청이 한도에 닿았는가" 하나로 줄였다. 몫은 분수로 셈하고 소수 둘째 자리로 적는다.
 * 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const shedToSurviveConcept: FacetConceptSource = {
  id: 'shedToSurvive',
  label: 'Load Shedding: Reject Some to Finish the Rest',
  canonicalFacet: 'facet:shedToSurvive',

  surface: {
    definition:
      'Under a burst beyond capacity, a server that turns extra requests away at once and gives full capacity to what it holds finishes some on time, while one that splits capacity among all of them lets every client give up.',
    exemplarKeywords: [
      'load shedding',
      'fail fast under overload',
      'admission control',
      'reject requests to stay alive',
      'HTTP 503',
      'processor sharing collapse',
      'thundering herd on a server',
      'serving fewer requests to serve them well',
      'client timeout during overload',
    ],
  },

  briefing: {
    observable: [
      'An Arrivals column on the left lists twelve requests, three per tick at ticks 0 to 3 (r1 to r12). Each arrival flies to two servers stacked one above the other, which receive exactly the same requests. Both servers do 1 unit of work per tick, and each request needs 1 unit.',
      'The upper server, "Accepts everything", takes all three each tick and splits its power bar among what it holds: "Split the tick 3 ways — 1/3 each", then 1/6, 1/9, and from tick 4 "1/12 each, gone clients included". Each request\'s progress is written under it, such as 0.61 or 0.36.',
      'Three dots under each request count ticks since it arrived; when all three fill, its client leaves: "Past the deadline, left: r1, r2, r3" at tick 3, at progress 0.61. The server keeps sharing work with requests whose clients have gone, so its tubes keep filling in grey.',
      'The lower server, "Sheds load — limit: 1", holds one request at a time. Each tick the first of the three (r1, r4, r7, r10) takes the place, and the other two reach the entrance and bounce straight to a Rejected line tagged 503: "Took r1. Turned away at once with 503: r2, r3."',
      'Each accepted request gets the whole power bar the next tick and finishes into the Done line. From tick 5 the lower server has nothing to do: "Nothing held — the server sits idle."',
      'The last step, tick 6, reads "done in time: accept-all 0 / 12 · shedder 4 / 12". The upper server shows Left: 12 with work still unfinished; the lower shows Done: 4 and Rejected: 8, every rejection given in the tick the request arrived.',
      'Ticks are an example time unit, the 3-tick deadline and limit of 1 are example values, network delay is zero, and the accepting server never cancels work for a client that left. Real shedders usually decide by queue length or latency; here the rule is only whether the held count has reached the limit. The screen does not footnote these choices.',
    ],

    screen: {
      affordances: [
        'The screen plays itself from before tick 0 through tick 6 and stops. There are no handles; both servers always see the same twelve arrivals.',
        'A Replay button and a playback strip sit below it. Scrubbing to tick 3 holds the moment the first three clients leave the accepting server while the shedding server has already finished r1, r4 and r7 and has just taken r10.',
      ],
    },

    useWhen: [
      'The article claims that refusing work can raise the number of requests completed in time, and needs a side-by-side where the kinder server finishes none and the stricter one finishes four.',
      'A reader objects that returning 503 is just failing users, and the article wants to show that the alternative is every user waiting until they give up while the server keeps working for nobody.',
    ],

    avoidWhen: [
      'The article is about slowing the producer down with a signal sent back to it. Nothing here travels back to the senders except the individual rejections.',
      'The subject is isolating one failing dependency from others. Rejection here applies to any request once the server is full, whatever it is for.',
      'The topic is how queue waiting time grows with utilisation. There is no queue on either server.',
    ],

    contrastWith: [
      {
        concept: 'backpressure',
        note: 'Refusing versus sharing everything is one pairwise claim about a single burst; the wider overload comparison also includes holding excess at the sender and asks where each policy puts the loss as the send rate rises.',
      },
      {
        concept: 'tellThemToSlowDown',
        note: 'Shedding lets excess arrive and refuses it at the door; credit-based flow control keeps the excess from being sent at all by pacing the producer.',
      },
      {
        concept: 'isolateTheFlood',
        note: 'A shedder refuses whoever arrives once the whole server is full; a bulkhead refuses only calls headed to a full compartment, so traffic to other dependencies is untouched.',
      },
      {
        concept: 'tripAfterFailures',
        note: 'A circuit breaker stops the caller from sending to a callee that keeps failing; load shedding is the callee protecting itself from more work than it can finish.',
      },
      {
        concept: 'kneeOfTheCurve',
        note: 'The knee explains why delay explodes as load nears capacity; shedding is a response to that, capping what is admitted so admitted work still meets its deadline.',
      },
    ],
  },
};
