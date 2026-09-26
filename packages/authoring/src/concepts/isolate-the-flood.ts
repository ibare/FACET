/**
 * isolateTheFlood 개념 선언.
 *
 * canonical facet 은 `facet:isolateTheFlood` — 스레드 여섯을 칸 둘로 나눴다(리뷰 a 셋 · 결제 b 셋). 리뷰 서비스는 멎어
 * 호출이 돌아오지 않고, 결제는 1 틱 만에 돌아온다. 틱 1 에 리뷰 칸이 차고 그 뒤 리뷰 호출 다섯이 곧바로 튕기지만, 결제 칸은
 * 틱 8 까지 잡았다 돌려주기를 계속해 결제 쪽 자리 없음 0. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `bulkhead` 는 a 가 **느릴 뿐**이고 칸막이 위치를 돌려 거절의 맞바꿈을 보인다. 이쪽은 칸을 고정하고, **멎은** 의존
 * 하나가 제 칸만 채우고 멈추며 옆 칸은 계속 돈다는 보호 한 장면만 말한다. 그래서 definition 은 stalled · never returns ·
 * holds every thread in its own compartment · neighboring compartment 를 쥐고, trade · divider · sizing 은 쓰지 않는다.
 *
 * 전제: 틱은 예로 정한 단위, 망 지연 0. "멎었다" 는 이 창(틱 0..8) 안에 호출이 돌아오지 않는 것으로 두었다 — 실제로는
 * 호출 기한이 붙은 스레드를 언젠가 놓게 하며, 벌크헤드는 그 기한까지의 피해를 가둔다. 칸 크기 3 · 3 은 예로 정한 값.
 * 한 틱 안에서는 돌아옴 → 도착, 칸 사이에 빌려주지 않는다. 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const isolateTheFloodConcept: FacetConceptSource = {
  id: 'isolateTheFlood',
  label: 'A Stalled Dependency Fills Only Its Own Compartment',
  canonicalFacet: 'facet:isolateTheFlood',

  surface: {
    definition:
      'When a stalled downstream service never returns, its calls hold every thread in their own compartment and later calls to it bounce immediately, while calls to another service keep getting threads from the neighboring compartment.',
    exemplarKeywords: [
      'bulkhead isolation',
      'hung dependency',
      'thread starvation from a stuck service',
      'per-dependency thread pool',
      'contain the blast radius',
      'failure isolation',
      'one bad dependency takes down the app',
      'Hystrix bulkhead',
      'fail fast when pool is full',
    ],
  },

  briefing: {
    observable: [
      'A "Thread pool: 6" split into two bays: "Bay for Reviews" with 3 threads, marked Stalled, and "Bay for Checkout" with 3 threads, marked Up. Each bay has a gauge like "2 / 3" and two counters, "No free thread" and "Returned". Reviews never answers; a Checkout call returns one tick after it arrives.',
      'Ticks 0 to 3 bring two Reviews calls and one Checkout call each; ticks 4 to 7 bring one Checkout call each.',
      'Tick 0: "Reviews never answers: each call to it keeps its thread." a1 and a2 take Reviews threads; b1 takes a Checkout thread.',
      'Tick 1: "The Reviews bay is full: the next call to Reviews bounces off." a3 takes the last Reviews thread and a4 is turned away at once without waiting. b1 returns and b2 takes the thread it released.',
      'Ticks 2 and 3 read "No free thread for Reviews calls. Checkout calls still find one." a5 to a8 bounce; Reviews "No free thread" reaches 5. Ticks 4 to 7 read "Checkout keeps turning: one call returns, the next takes its thread."',
      'Tick 8: "The last Checkout call returns. The Reviews bay is still full." Final counts: Reviews 3 / 3 held, No free thread 5, Returned 0; Checkout Returned 8, No free thread 0. Checkout never used more than one thread at a time. The run stops with the Reviews bay still occupied.',
      'Ticks are an example time unit, network delay is zero, and bay sizes 3 and 3 are example values. "Stalled" means no call returns within ticks 0 to 8; a real service would put a timeout on calls so held threads are eventually released, and the bulkhead contains the damage until then. The screen does not footnote these choices.',
    ],

    screen: {
      affordances: [
        'The screen plays itself from the starting state through tick 8 and stops. There are no handles; the bays, the stall and the arrivals are fixed.',
        'A Replay button and a playback strip sit below it. Scrubbing to tick 2 holds the moment Reviews calls are bouncing off a full bay while a Checkout call still takes a thread next door.',
      ],
    },

    useWhen: [
      'The article explains how giving each dependency its own thread pool keeps one hung service from taking the whole application down, and wants calls to a healthy service still succeeding beside a full bay.',
      'A reader asks what "failing fast" means once a dependency is stuck, and the calls to Reviews bouncing immediately with no free thread — rather than piling up — answer it.',
    ],

    avoidWhen: [
      'The article is about how to size the pools or the trade-off between them. The bays are fixed at three and three here.',
      'The subject is detecting failure and stopping calls, as a circuit breaker does. Calls to Reviews keep being attempted and are refused only because the bay is full.',
      'The topic is server-wide overload where every request competes for the same capacity. Only calls to the stalled service are refused here.',
    ],

    contrastWith: [
      {
        concept: 'bulkhead',
        note: 'The protection is that a flooded compartment cannot reach its neighbor; the design question is where to set the partition, since the flooding side is refused more the smaller its share.',
      },
      {
        concept: 'shedToSurvive',
        note: 'Shedding refuses any caller once the whole server is full; compartment isolation refuses only calls bound for the full compartment, for the reason that that compartment is full.',
      },
      {
        concept: 'tripAfterFailures',
        note: 'A breaker trips on repeated errors and stops calls before they are made; a compartment fills with calls that simply never return, and refuses later ones only for lack of a free thread.',
      },
      {
        concept: 'deadlock',
        note: 'Deadlocked threads wait on each other and none can proceed; threads held by a stalled dependency wait on something outside, and isolation keeps the remaining threads working.',
      },
    ],
  },
};
