/**
 * bulkhead 개념 선언.
 *
 * canonical facet 은 `facet:bulkhead` — 자리(스레드) 여섯을 느린 의존 a(틱마다 2, 한 번 앉으면 6 틱 쥠)와 빠른 일
 * b(틱마다 2, 2 틱 쥠)가 12 틱 동안 나눠 쓴다. 손잡이 "a compartment size"(no split · 5:1 · 4:2 · 3:3 · 2:4, 처음 no split)를
 * 돌리면 칸막이가 옮겨 가고, b 거절은 22 → 18 → 12 → 6 → 0 으로 줄고 a 거절은 12 → 14 → 16 → 18 → 20 으로 는다.
 *
 * ── 묶음 안에서의 자리
 *
 * 조각 `isolateTheFlood` 는 칸을 3 · 3 으로 고정하고, **멎은**(돌아오지 않는) 의존 하나가 제 칸만 채우고 옆 칸은 계속
 * 도는 한 장면이다. 이쪽은 a 가 멎은 것이 아니라 **느릴 뿐**이고, 칸막이 위치를 돌려 **어느 쪽 거절을 얼마나 견딜지의
 * 맞바꿈**을 맡는다. 그래서 definition 은 partition · trade · where the divider sits · starve 를 쥐고, 조각이 쥔
 * stalled · never returns · neighboring compartment keeps turning 은 쓰지 않는다.
 *
 * 전제 (설명 글 `bulkhead.md`): 틱은 예로 정한 단위, 망 지연 0. 거절은 즉시 — 기다리는 줄이 없고 칸 사이에 자리를 빌려주지
 * 않는다. 쥐는 틱 6 · 2 와 틱마다 두 호출은 예로 정한 값. 한 풀일 때도 앞 번호 자리부터, 같은 틱에는 a 가 b 보다 먼저 온다.
 * 코드 패널은 IR 하나를 여섯 언어로.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bulkheadConcept: FacetConceptSource = {
  id: 'bulkhead',
  label: 'Bulkhead Pattern (Where to Put the Partition)',
  canonicalFacet: 'facet:bulkhead',

  surface: {
    definition:
      'Partitioning a fixed thread pool between a slow dependency and fast work trades one side\'s rejections for the other\'s: unsplit, the slow side starves the fast one, and moving the divider sets how much each may take.',
    exemplarKeywords: [
      'bulkhead pattern',
      'thread pool isolation',
      'separate connection pools per dependency',
      'resource partitioning',
      'Hystrix thread pool',
      'resilience4j bulkhead',
      'slow dependency exhausts the thread pool',
      'noisy neighbor',
      'sizing a bulkhead',
      'fault isolation in microservices',
    ],
  },

  briefing: {
    observable: [
      'Six seats (threads) stand in a row. Calls for "a · slow dependency" arrive along an upper corridor and calls for "b · fast work" along a lower one, both "2 per tick"; a holds a seat for 6 ticks and b for 2. A bar under each occupied seat shows the hold remaining.',
      'Each tick first releases calls whose hold is over ("Tick 6 · released: a1, a2"), then seats the a calls, then the b calls, each in the lowest-numbered free seat of its own compartment. A call that finds no free seat there is refused at once with ✗; there is no waiting line and no borrowing from the other compartment.',
      'With no split the row reads "one pool · seats 1–6". On tick 1, a fills the remaining seats; b got in only with its two calls on tick 0, and when those two release on tick 2, a takes the seats again. Over 12 ticks b is refused 22 of 24 times — although a never fails, it is only slow.',
      'With a split, the divider stands on the row and each side reads "compartment a · seats …" and "compartment b · seats …". Moving it toward a — 5:1, 4:2, 3:3, 2:4 — lowers b refused 22 → 18 → 12 → 6 → 0 and raises a refused 12 → 14 → 16 → 18 → 20. Each side takes only as much as its own compartment holds.',
      'Four readouts carry the totals: a taken, a refused, b taken, b refused. For the five settings, a taken / a refused / b taken / b refused are 12/12/2/22, 10/14/6/18, 8/16/12/12, 6/18/18/6, 4/20/24/0.',
      'Ticks are an example time unit, network delay is zero, rejection is immediate, and the hold times and arrival rates are example values. Within a tick a arrives before b, which in one shared pool makes b starve harder. The screen does not footnote these choices.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: "a compartment size" with no split, 5:1, 4:2, 3:3 and 2:4 (starting at no split). Turning it slides the divider along the row of seats and replays the 12 ticks.',
        'The move that makes the idea land is stepping from no split toward 2:4 while watching the two refused readouts move in opposite directions — the choice of where to put the divider is a choice of whose refusals to accept.',
        'The code panel, labelled "Bulkhead", starts empty with a "+ Add language" button; `runBulkhead` runs the same count as the screen and highlights the release, take or refuse line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article introduces the bulkhead pattern and must show that isolation has a price: the side that floods is refused more, so sizing each compartment is a trade-off, not a free win.',
      'A reader asks how one slow downstream service can make unrelated endpoints fail, and the article wants a shared pool where the fast work is refused 22 times out of 24 though nothing is broken.',
    ],

    avoidWhen: [
      'The article is about process or container isolation, memory limits or cgroups. The resource partitioned here is a pool of seats taken by calls.',
      'The subject is a circuit breaker opening after failures. Every call here is served or refused only by seat availability, and no call fails.',
      'The topic is queueing calls until a thread frees up. Calls here are refused at once; no one waits.',
    ],

    contrastWith: [
      {
        concept: 'isolateTheFlood',
        note: 'That a flooded compartment cannot spill into its neighbor is the protection a bulkhead gives; sizing the bulkhead adds the cost, that the flooding side is refused more the smaller its share.',
      },
      {
        concept: 'circuitBreaker',
        note: 'A bulkhead limits how many resources calls to one dependency can hold at once; a circuit breaker stops calling a dependency that keeps failing. One contains a slow callee, the other skips a broken one.',
      },
      {
        concept: 'shedToSurvive',
        note: 'Load shedding refuses any request once the whole server is full; a bulkhead refuses per compartment, so which caller gets refused depends on which dependency it needs.',
      },
      {
        concept: 'rateLimiting',
        note: 'A rate limiter caps how often a client may call; a bulkhead caps how many calls may be in progress at once, which is what a slow dependency exhausts.',
      },
    ],
  },
};
