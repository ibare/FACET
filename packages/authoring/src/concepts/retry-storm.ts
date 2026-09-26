/**
 * retryStorm 개념 선언.
 *
 * canonical facet 은 `facet:retryStorm` — 새 요청 틱마다 4, 감당 6, 서버는 틱 1 · 2 · 3 에 끊긴다. 실패한 요청은 바로
 * 다음 틱에 다시 와서 다시 올 무더기가 4 → 8 → 12 로 불어나고, 살아난 틱 4 에 몰림 16 이 감당 6 을 덮쳐 10 이 또 실패한다.
 * 그 뒤 무더기는 틱마다 2 씩만 줄어 틱 9 에야 실패 0. 살아난 뒤 실패한 틱 5, 실패 합 30. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `retryAndBackoff` 는 다시 오는 법 셋과 장애 길이를 손잡이로 견준다. 이쪽은 **곧바로 재시도 하나**가 만드는 두 장면 —
 * 끊긴 동안 새 요청 위에 얹혀 불어남, 살아난 순간 덮침과 느린 빠짐 — 만 말한다. 이웃 조각 `jitteredBackoff` 는 끊김도 새
 * 요청도 없이 함께 실패한 무리가 돌아오는 칸을 말한다. 그래서 definition 은 next tick · stack on new traffic · backlog grows ·
 * drains only by spare capacity 를 독점하고, exponential · jitter · slots 는 쓰지 않는다.
 *
 * 전제: 틱은 예로 정한 단위, 새 요청 4 · 감당 6 · 끊김 세 틱은 예로 정한 값, 망 지연 0, 받은 요청은 그 틱 안에 끝난다.
 * 넘친 요청은 줄을 서지 않고 곧바로 실패한다. 재시도는 "바로 다음 틱에 다시" 한 가지뿐이고 포기가 없다. 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const retryStormConcept: FacetConceptSource = {
  id: 'retryStorm',
  label: 'Retry Storm: Retries Pile Up and Knock the Server Down Again',
  canonicalFacet: 'facet:retryStorm',

  surface: {
    definition:
      'Requests that fail while a server is down and retry on the very next tick stack on top of new traffic, so the backlog grows every down tick, overwhelms the server the moment it recovers, and drains only by its spare capacity.',
    exemplarKeywords: [
      'retry storm',
      'retry amplification',
      'thundering herd after recovery',
      'second outage caused by retries',
      'immediate retry without delay',
      'backlog after an outage',
      'cascading failure from retries',
      'metastable failure',
      'why the server fell over again',
    ],
  },

  briefing: {
    observable: [
      'A tick axis from 0 to 9 with one column per tick and a "Capacity: 6" line across them. Each column stacks new requests and retried requests in two colours, with the ones beyond capacity marked Failed. A "Coming back next tick" counter shows how many will retry.',
      'Tick 0, server up: "Load 4 = new 4 + retried 0 · capacity 6 → served 4 · failed 0".',
      'Ticks 1 to 3, server down: "everything that arrives fails". The load reads 4, then "8 = new 4 + retried 4", then "12 = new 4 + retried 8" — the new requests stay at four, and the pile coming back grows 4 → 8 → 12.',
      'Tick 4: "the server is back up — the pile rushes in all at once." Load 16 = new 4 + retried 12; six are served and 10 fail. This is the tallest column.',
      'From there the load falls only by two per tick — 14, 12, 10, 8, 6 — because four of the six served each tick are the new requests of that tick. Within a tick, requests that first arrived earlier are served first.',
      'Tick 9 is the first tick after recovery with no failures, and the screen closes with "Ticks still failing after recovery: 5 · their failures: 30". Without retries, the load after recovery would have been four per tick, inside capacity.',
      'Ticks are an example time unit; four new requests per tick, capacity 6 and a three-tick outage are example values. Network delay is zero, served requests finish within the tick, and requests beyond capacity fail immediately instead of queueing. The screen does not footnote these choices.',
    ],

    screen: {
      affordances: [
        'The screen plays itself from before tick 0 through tick 9 and stops. There are no handles; the outage and rates are fixed.',
        'A Replay button and a playback strip sit below it. Scrubbing to tick 4 holds the tallest column, 16 against a capacity line of 6, right as the server comes back.',
      ],
    },

    useWhen: [
      'The article explains why a service that recovers from a short outage immediately falls over again, and needs the retry pile growing during the outage and landing all at once on recovery.',
      'A postmortem-style article argues that failures continuing after the root cause is fixed come from client retries, and wants the arithmetic of new plus retried against capacity made visible tick by tick.',
    ],

    avoidWhen: [
      'The article compares backoff strategies or argues for jitter. Every request here retries on the very next tick; no waiting rule is shown.',
      'The subject is a queue building up in front of a slow server. Nothing waits in line here; requests beyond capacity fail and come back.',
      'The topic is a circuit breaker or rate limiter stopping the retries. No mechanism here holds any request back.',
    ],

    contrastWith: [
      {
        concept: 'retryAndBackoff',
        note: 'A retry storm is the failure mode of retrying at once; choosing a retry policy sets it against backoff and jitter and asks which lowers the recovery peak without making clients wait too long.',
      },
      {
        concept: 'jitteredBackoff',
        note: 'A retry storm grows because failures keep adding to fresh traffic during an outage; jitter addresses a different part, a group that failed together returning together.',
      },
      {
        concept: 'arrivalVsService',
        note: 'A queue grows whenever arrivals outpace service; in a retry storm the arrivals themselves are inflated by earlier failures, so the overload feeds itself.',
      },
      {
        concept: 'tripAfterFailures',
        note: 'A tripped breaker stops sending to a failing server and so starves the storm of retries; the storm is what happens when every caller keeps sending.',
      },
    ],
  },
};
