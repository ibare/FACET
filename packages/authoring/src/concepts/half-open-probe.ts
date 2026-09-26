/**
 * halfOpenProbe 개념 선언.
 *
 * canonical facet 은 `facet:halfOpenProbe` — t=0 에 이미 열린 브레이커가 기다림 5 초 뒤(t=5) 반열림이 되고, t=6 에 온
 * 부름 하나를 시험 부름으로 보낸다. 서비스는 아직 죽어 t=7 에 fail → 다시 열림 · 반열림 예정 t=12. 서비스는 t=10 에
 * 되살아나지만 브레이커는 열림 그대로다. t=12 반열림 → t=13 시험 부름 · t=13.5 부름은 시험 부름이 나가 있어 막힘 →
 * t=14 ok → 닫힘. t=15 부름은 그대로 지나 t=16 ok. 걸음 열둘. 스스로 재생하고 멈춘다. 코드 패널 없음.
 *
 * ── 묶음 안에서의 자리
 *
 * `circuitBreaker`(완제품)는 기다림 길이의 맞바꿈을 손잡이로, `tripAfterFailures` 는 닫힘 → 열림의 셈을 보인다. 이쪽은
 * **되돌아오는 길** 하나 — 기다림이 차면 반열림, 시험 부름은 하나, 실패하면 기다림을 처음부터, 되살아남을 브레이커는
 * 보지 못한다. definition 은 half-open · exactly one trial call · restarts the wait · cannot observe recovery 를 쥐고,
 * 완제품의 tuning · threshold trade-off, 형제의 consecutive count · trips 를 쓰지 않는다.
 *
 * 전제 (설명 글 `halfOpenProbe.md`): 시각 단위 초 · 기다림 5 초 · 답까지 1 초(ok · fail 같다) · 되살아나는 시각 t=10 ·
 * 부름 시각 여섯은 1차 데이터 · 어떻게 열렸는지는 그리지 않는다 · 시험 부름 하나(나가 있는 동안 온 부름은 막힘) ·
 * 기다림은 같은 길이로 다시 센다(지수로 늘리는 구현도 있다).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const halfOpenProbeConcept: FacetConceptSource = {
  id: 'halfOpenProbe',
  label: 'Circuit Breaker Half-Open Trial Call',
  canonicalFacet: 'facet:halfOpenProbe',

  surface: {
    definition:
      'When its wait expires an open circuit breaker turns half-open and lets exactly one trial call through; a failed trial reopens it and restarts the wait, and only a successful one closes it, since the breaker cannot observe recovery.',
    exemplarKeywords: [
      'half-open state',
      'trial request',
      'probe request after cooldown',
      'circuit breaker reset timeout',
      'how does a circuit breaker close again',
      'open to half-open to closed',
      'permitted calls in half-open state',
      'sleep window',
      'resilience4j waitDurationInOpenState',
      'Hystrix sleepWindowInMilliseconds',
    ],
  },

  briefing: {
    observable: [
      'A Caller, a Breaker drawn as a lever over a wire, and a Service marked Down sit above a time axis from 0 to 16. The opening caption reads "Open since t = 0. Half-open at: t = 5."; counters show "Blocked", "Sent to service" and "Trial calls".',
      'The breaker lever is raised high for Open, lowered half-way for Half-open and lies on the wire for Closed, turning on the step where the state changes. A band under the axis colours the state; an open stretch is first drawn as a dashed frame up to its half-open time and fills as the clock hand moves.',
      'At t = 2 a call drops under the breaker: "blocked, the breaker is open". At t = 5, with no call present, "Wait over at t = 5: the breaker turns half-open."',
      'At t = 6 a call arrives and "goes out as the trial call", ringed, and waits at the service. At t = 7 it fails: "open again. Half-open at: t = 12." A new frame stands from 7 to 12. The t = 9 call is blocked.',
      'At t = 10 the service comes back ("Service back at t = 10. Breaker unchanged: Open.") and a dashed line marks it on the axis; the breaker does not move.',
      'At t = 12 the breaker is half-open again; the t = 13 call goes out as the trial call, and the t = 13.5 call is blocked because "the trial call is still out". At t = 14 the trial succeeds and the breaker closes, 4 seconds after the service came back. The t = 15 call goes straight through and is answered at t = 16.',
      'The run ends with 2 trial calls (1 failed, 1 succeeded), 3 blocked calls and 3 calls sent to the service.',
      'Times are example values in seconds: a 5-second wait, 1 second from sending to answer for ok and fail alike, recovery at t = 10, calls arriving at 2, 6, 9, 13, 13.5 and 15. How the breaker opened is not shown. Only one trial call is allowed out at a time, a trial call is simply the next arriving call rather than a retry, and after a failed trial the wait restarts at the same length (some implementations grow it exponentially).',
    ],

    screen: {
      affordances: [
        'The screen plays twelve steps by itself, one event per step — a call arriving, the switch to half-open, a trial answer, the recovery — and stops after the t = 15 call.',
        'A Replay button and a playback strip sit below. Dragging between t = 10 and t = 12 holds the stretch where the service is already up but every call is still refused.',
        'All times are fixed, so an article can quote each event and the 4-second gap between recovery and closing.',
      ],
    },

    useWhen: [
      'The article explains how an open circuit breaker ever closes again and needs the half-open step made concrete: the wait, a single trial call, and a failed trial sending it back to wait again.',
      'A reader assumes calls resume the moment the dependency recovers; the gap between recovery at t = 10 and closing at t = 14 shows the breaker only learns through its next trial.',
    ],

    avoidWhen: [
      'The article is about when and why a breaker opens in the first place. The breaker is already open at t = 0 and no failure count appears.',
      'The subject is tuning the wait length or comparing settings. The wait is fixed at 5 seconds.',
      'The topic is retry backoff with growing delays for one request. The trial call is a fresh call, and the wait does not grow.',
    ],

    contrastWith: [
      {
        concept: 'circuitBreaker',
        note: 'The half-open step says how a breaker tests for recovery; choosing the wait length is the separate trade between probing a dead service more often and closing sooner after it returns.',
      },
      {
        concept: 'tripAfterFailures',
        note: 'Opening is driven by counting the caller\'s failures; half-open is driven by elapsed time, and a single result decides the next state with no count at all.',
      },
      {
        concept: 'jitteredBackoff',
        note: 'Backoff spaces out repeated attempts of the same request; a half-open breaker spaces out tests of the dependency and uses whichever call happens to arrive as the test.',
      },
    ],
  },
};
