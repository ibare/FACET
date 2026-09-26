/**
 * tripAfterFailures 개념 선언.
 *
 * canonical facet 은 `facet:tripAfterFailures` — 부름 열 개가 차례로 부르는 쪽 → 브레이커 → 서비스를 지난다. 답은
 * ok · ok · fail · ok · fail · fail · fail(부름 5 부터 서비스가 죽음). 잇단 실패는 실패에 오르고 성공에 0 으로 돌아가며,
 * 부름 7 에서 3/3 에 닿아 브레이커가 열린다. 부름 8 · 9 · 10 은 브레이커에서 막혀 0 ms 에 돌아온다. 걸음 열하나.
 * 스스로 재생하고 멈춘다. 코드 패널 없음.
 *
 * ── 묶음 안에서의 자리
 *
 * `circuitBreaker`(완제품)는 두 손잡이의 맞바꿈, `halfOpenProbe` 는 열린 뒤 되돌아오는 길이다. 이쪽은 **닫힘 → 열림**
 * 하나 — 잇단 실패 셈이 성공에 지워지고 문턱에서 끊긴 뒤 부름이 서비스에 닿지 않는다는 것. definition 은
 * consecutive · resets on success · opens at the threshold · returns immediately · caller wait 를 쥐고, 완제품의
 * trade-off · open wait, 조각 형제의 half-open · trial call · recovery 를 쓰지 않는다.
 *
 * 전제 (설명 글 `tripAfterFailures.md`): 문턱 3 과 기다림 100 · 1000 · 0 ms 는 예로 정한 값 · 문턱은 잇단 실패 수 꼴
 * (창 안 실패율 꼴도 흔하다) · 시계 없음, 가로축은 부름 차례 · 모든 부름이 열림 기다림 안에 온다 · 재시도 없음.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const tripAfterFailuresConcept: FacetConceptSource = {
  id: 'tripAfterFailures',
  label: 'Circuit Breaker Tripping on Consecutive Failures',
  canonicalFacet: 'facet:tripAfterFailures',

  surface: {
    definition:
      'A closed circuit breaker counts consecutive failed calls, resets the count on any success, and opens when it hits the threshold; later calls then return instantly without reaching the failing service or waiting for its timeout.',
    exemplarKeywords: [
      'circuit breaker trips',
      'consecutive failure count',
      'failure threshold',
      'closed to open transition',
      'fail fast',
      'stop calling a failing service',
      'timeout wait vs immediate rejection',
      'CircuitBreakerOpenException',
      'Hystrix',
      'resilience4j',
    ],
  },

  briefing: {
    observable: [
      'A Caller, a Breaker and a Service stand in a column, with ten slots across for calls 1 to 10 and a "Wait (ms)" bar row at the bottom. The breaker starts "Closed" with "Failures in a row 0/3"; counters read "Calls reached: 0", "Blocked: 0", "Total: 0 ms".',
      'Calls 1 and 2 reach the service and come back OK, each waiting 100 ms. Call 3 fails with a 1000 ms timeout and the count goes to 1/3; call 4 succeeds and the count drops back to 0 — one success erases the earlier failure.',
      'From call 5 the service is dead. Calls 5, 6 and 7 fail, 1000 ms each, and the count climbs 1/3, 2/3, 3/3. On call 7 the caption reads "Failures in a row: 3/3. Breaker opens", and the switch blades for the slots not yet reached flip open together.',
      'Calls 8, 9 and 10 bounce off the breaker ("stopped at the breaker. Wait: 0 ms") and are marked Blocked; "Calls reached" stays at 7 from then on.',
      'The run ends with 7 calls reached, 3 blocked, 4 failures (3 of them in a row) and a total wait of 4300 ms.',
      'Threshold 3 and the waits of 100, 1000 and 0 ms are example values. The threshold counts consecutive failures; breakers that open on a failure rate over a window also exist. There is no clock — the horizontal axis is call order — and every call arrives before the open period would end, so nothing reopens. Failed calls are not retried. The breaker belongs to the caller: "Blocked" means the caller chose not to send, not that the service refused.',
    ],

    screen: {
      affordances: [
        'The screen plays the ten calls by itself, one call per step, eleven steps counting the opening, and stops after call 10.',
        'A Replay button and a playback strip sit below. Dragging back and forth between call 3 and call 4 shows the count going to 1/3 and back to 0; between calls 7 and 8 shows the switch from a 1000 ms timeout to a 0 ms block.',
        'Every answer, count and wait is fixed, so an article can quote them exactly.',
      ],
    },

    useWhen: [
      'The article explains when a circuit breaker opens and needs the counting rule made concrete: only an unbroken run of failures reaches the threshold, and a single success in between starts it over.',
      'A reader asks what a breaker actually buys the caller; the wait bars dropping from 1000 ms timeouts to 0 ms blocked calls, with the service-call count frozen, show the saving.',
    ],

    avoidWhen: [
      'The article is about how a breaker recovers — half-open, trial calls, closing again. The run ends with the breaker still open.',
      'The subject is choosing threshold or timeout values. Both are fixed here.',
      'The topic is retrying failed calls or backing off between attempts. Each call is made once.',
    ],

    contrastWith: [
      {
        concept: 'circuitBreaker',
        note: 'The opening rule by itself says a breaker trips after enough consecutive failures; setting the threshold is a trade between tripping on short blips and wasting timeouts on a real outage.',
      },
      {
        concept: 'halfOpenProbe',
        note: 'Tripping moves a breaker from closed to open on the caller\'s own failures; the half-open trial is the way back, and it depends on time passing rather than on counting.',
      },
      {
        concept: 'retryStorm',
        note: 'Retries multiply calls to a failing service; tripping does the opposite, cutting the number of calls that reach it to zero once failures line up.',
      },
      {
        concept: 'shedToSurvive',
        note: 'Shedding is a busy server rejecting work it receives; tripping is a caller withholding work before sending it, based on failures it has already seen.',
      },
    ],
  },
};
