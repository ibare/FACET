/**
 * circuitBreaker 개념 선언.
 *
 * canonical facet 은 `facet:circuitBreaker` — 틱 0..23 에 부름이 하나씩 부르는 쪽 → 브레이커 → 서비스 `inventory` 로 간다.
 * 서비스는 틱 1 · 2 에 삐끗하고 틱 6..15 에 죽었다가 틱 16 에 되살아난다. 손잡이 둘 — `문턱`(잇단 실패 1 · 2 · 3 · 5 · 8,
 * 처음 3) · `열림 기다림`(2 · 4 · 6 · 8 틱, 처음 4) — 을 돌리면 죽은 곳에 닿은 부름 · 막은 부름 · 삐끗에 열림 ·
 * 살아난 뒤 닫힘까지가 맞바뀐다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `tripAfterFailures` 는 닫힘 → 열림(잇단 실패 셈), `halfOpenProbe` 는 열림 → 반열림 → 닫힘(시험 부름 하나)의 한 장면이다.
 * 이쪽은 세 상태를 한 판에 잇고 **두 손잡이의 맞바꿈**을 쥔다 — definition 은 tuning · threshold · open wait · blip ·
 * wasted timeouts · after recovery 쪽 낱말을 쓰고, 조각이 쥔 consecutive count resets · returns immediately ·
 * exactly one trial call · restarts the wait 를 쓰지 않는다.
 *
 * 전제 (설명 글 `circuitBreaker.md`):
 *  - 틱은 예로 정한 단위 · 틱마다 부름 하나 · 망 지연 0 · 재시도 없음 · 실패는 모두 시간 초과로 친다.
 *  - 문턱은 잇단 실패 수 꼴(창 안 실패율 꼴도 흔하다) · 시험 부름 하나 · 기다림은 같은 길이로 다시 센다(지수로 늘리는 구현도 있다).
 *  - 브레이커는 되살아나는 때를 보지 못한다 · 살아난 뒤 닫힘까지는 단조롭지 않고 0 이상 기다림 − 1 이하만 선다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const circuitBreakerConcept: FacetConceptSource = {
  id: 'circuitBreaker',
  label: 'Circuit Breaker (Threshold and Open-Wait Trade-off)',
  canonicalFacet: 'facet:circuitBreaker',

  surface: {
    definition:
      'Tuning a circuit breaker trades errors: a low failure threshold trips on brief blips, a high one wastes more timeouts on a dead service, and a longer open wait probes less often but can keep calls blocked after recovery.',
    exemplarKeywords: [
      'circuit breaker pattern',
      'closed open half-open states',
      'circuit breaker configuration',
      'failure threshold tuning',
      'open state duration',
      'Hystrix',
      'resilience4j',
      'Polly circuit breaker',
      'fail fast on a dead dependency',
      'cascading failure in microservices',
      'timeout calls to a down service',
    ],
  },

  briefing: {
    observable: [
      'Across the top runs Caller → Breaker → Service `inventory`. The breaker is drawn as a switch whose lever sits Closed, lifts to Open or hangs half-way at Half-open; under it an "Open wait" bar fills while the breaker is open. A label reads "Failures in a row: n / k".',
      'Below is a row of marks for ticks 0 to 23 over a background band showing the service\'s health: Blip at ticks 1 and 2, Down from 6 to 15, back up at 16. Calls that reach the service fall on the Service line as Answered (●) or Timeout (✗); blocked calls fall on the Breaker line; trial calls are ringed with a diamond.',
      'At threshold 3 and wait 4 the tick-1 and tick-2 blips count to 2 / 3 and are wiped by the tick-3 answer. Ticks 6, 7 and 8 time out, and at tick 8 "a timeout reaches the threshold — the breaker opens". Ticks 9 to 11 are blocked.',
      'At tick 12 the breaker is half-open and that call is the trial call; the service is still down, so it times out and the wait bar empties and fills again. Ticks 13 to 15 are blocked; at tick 16 the trial call is answered and the breaker closes; ticks 17 to 23 go through.',
      'Four counters: "Calls to the dead service", "Blocked calls", "Opened on a blip", "Ticks to close after recovery". At the defaults they end at 4 (ticks 6, 7, 8, 12), 6, 0 and 0. Until the breaker closes after recovery the last counter shows 0 and the caption says "breaker not closed yet".',
      'Moving the threshold: at 1 or 2 the blips open the breaker once ("Opened on a blip" 1); from 3 up they do not. With wait 2, calls to the dead service go 5, 6, 6, 7, 9 as the threshold goes 1, 2, 3, 5, 8, and blocked calls at wait 4 go 12, 12, 6, 6, 3.',
      'Moving the wait: at threshold 3, calls to the dead service go 6, 4, 4, 3 for waits 2, 4, 6, 8. Ticks to close after recovery go 0, 0, 4, 0 — not in one direction, because trial calls land on a grid set by when the breaker opened; across all twenty combinations it stays between 0 and wait − 1.',
      'Simplifications the screen does not footnote: ticks are an example unit with one call per tick, delay is 0, there are no retries, every failure counts as a timeout, the threshold counts consecutive failures (failure-rate windows are also common), one trial call is sent per half-open, and the wait restarts at the same length (some implementations grow it exponentially). The breaker never sees the recovery directly.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Threshold" with 1, 2, 3, 5, 8 (default 3) and "Open wait" with 2, 4, 6, 8 ticks (default 4). Each setting replays the same 24 calls against the same health band.',
        'The move that makes the idea land is raising the threshold and watching the first blocked mark slide right while more ✗ marks pile up on the Service line inside the Down band; then lengthening the wait and watching the ringed trial calls spread apart.',
        'The code panel, labelled "Breaker over one run", starts empty with a "+ Add language" button; its `runBreaker(threshold, wait, back, health, tally)` counts the same run. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article discusses how to configure a circuit breaker and needs both knobs shown pulling against each other: sensitivity to transient errors versus timeouts spent on an outage, and probe frequency versus delay in resuming.',
      'A reader wants the whole closed-open-half-open cycle in one run, including a failed probe during the outage and a successful one after recovery, with the costs counted.',
    ],

    avoidWhen: [
      'The subject is retries, backoff or jitter. No call is sent twice.',
      'The article is about a server rejecting excess load to protect itself. The blocking here happens on the caller\'s side, before the call leaves.',
      'The topic is failure-rate windows or sliding-window breakers. The threshold here counts consecutive failures only.',
    ],

    contrastWith: [
      {
        concept: 'tripAfterFailures',
        note: 'Counting consecutive failures up to a threshold is the rule for opening; the tuning question is where to set that threshold when brief blips and real outages both produce failures.',
      },
      {
        concept: 'halfOpenProbe',
        note: 'A single trial call after a wait is how an open breaker finds out whether to close; tuning asks how long that wait should be, given that the recovery moment is invisible to it.',
      },
      {
        concept: 'retryAndBackoff',
        note: 'Retrying spends more attempts in the hope the next one succeeds; a breaker spends fewer, refusing to call at all once failures suggest the dependency is down.',
      },
      {
        concept: 'shedToSurvive',
        note: 'Load shedding is the overloaded server turning work away; a circuit breaker is the caller declining to send, so the refusal costs the dependency nothing.',
      },
      {
        concept: 'bulkhead',
        note: 'A bulkhead caps how much of the caller\'s capacity one slow dependency can occupy; a breaker cuts calls to it entirely once failures reach a threshold.',
      },
    ],
  },
};
