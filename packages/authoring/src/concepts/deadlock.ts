/**
 * deadlock 개념 선언.
 *
 * canonical facet 은 `facet:deadlock` — 스레드 셋이 자물쇠 둘씩을 고리 모양으로 잡는다(A: m1 → m2 · B: m2 → m3 ·
 * C: m3 → m1). 왼쪽은 세 프로그램, 가운데는 기다림 화살(잠든 스레드 → 기다리는 자물쇠의 지금 주인), 오른쪽은 돌림 몫
 * (1 ~ 5) × 잠금 사이 일(0 ~ 3) 스무 칸의 지도. 손잡이 셋 — 몫 · 사이 일 · 잠금 순서(쓴 대로 / 번호 차례). 쓴 대로면
 * 몫 ≤ 사이 일 + 1 인 열 칸이 교착(멈춘 틱 3 × (사이 일 + 2)), 번호 차례면 스무 칸 모두 끝나고 틱 수는 같다(15 · 18 ·
 * 21 · 24).
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 넷)
 *
 * 조각 넷은 네 조건 가운데 셋과 처방 하나의 장면이다 — 쥔 채 잠듦(`holdAndWait`) · 빼앗을 수 없음(`noPreemption`) ·
 * 고리가 닫힘(`waitCycle`) · 번호 차례(`lockOrdering`). 이쪽은 **어느 차례에서 교착이 나는가**를 지도로 펼치고,
 * 순서 하나가 모든 차례에서 그것을 없앤다는 것을 쥔다. 그래서 definition 은 depends on the time slice · how long ·
 * every combination · no extra ticks 를 쥐고, 조각들이 독점한 idle yet unavailable · priority · arrows return ·
 * point upward 를 쓰지 않는다.
 *
 * 전제 (설명 글 `deadlock.md`): CPU 하나 · 한 틱 한 줄 · 막힌 시도도 한 틱 · 목록 차례 돌림 · 넘겨주기 규약. 실제
 * 차례는 예측할 수 없다 — 몫과 사이 일 두 수로 드러냈다. 식탁 · 철학자 그림은 쓰지 않았다. 코드는 가상 표기이고
 * 코드 패널은 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const deadlockConcept: FacetConceptSource = {
  id: 'deadlock',
  label: 'Deadlock (Which Schedules Deadlock, and Lock Ordering)',
  canonicalFacet: 'facet:deadlock',

  surface: {
    definition:
      'Whether threads taking two locks in a circular pattern deadlock depends on the time slice and how long each holds its first lock; one fixed global acquisition order lets every combination finish, with no extra ticks.',
    exemplarKeywords: [
      'deadlock',
      'deadlock conditions',
      'Coffman conditions',
      'deadlock prevention',
      'intermittent deadlock',
      'deadlock depends on timing',
      'lock ordering discipline',
      'nested locks',
      'dining philosophers problem',
      'threads hang forever',
    ],
  },

  briefing: {
    observable: [
      'On the left are three programs, each `lock(a)`, `work()` repeated by the "Work between locks" value, `lock(b)`, `work()`, `unlock(b)`, `unlock(a)`: A takes m1 then m2, B takes m2 then m3, C takes m3 then m1. Each thread is marked Ready, Running or Asleep; lines run in the current chunk are coloured and a blocked line gets a red outline.',
      'In the middle each lock\'s tag travels beside its owner ("No owner" when free). When a thread sleeps, an arrow grows from it to the current owner of the lock it wants, captioned like "Asleep: A → B (m2)"; when an owner releases, the tag passes to the waiter and the arrow is drawn back.',
      'With the defaults (as written, slice 2, work between 1) the round is six chunks: A, B and C each take their first lock and do one line of work, then A sleeps on m2, B on m3, C on m1. It ends "Cycle: A → B → C → A · Ticks: 9".',
      'On the right a map of twenty cells — Time slice 1 to 5 by Work between locks 0 to 3 — gives each combination\'s result under the current order: "Deadlock" with the tick it stuck at, or "Finished" with its tick count. A frame marks the current round\'s cell.',
      'As written, every cell with slice ≤ work between + 1 deadlocks and the rest finish — a clean diagonal of ten deadlock cells. Stuck ticks are 3 × (work between + 2), independent of the slice. Longer work while holding the first lock widens the deadlock region.',
      'Switching the order to "By number" swaps C\'s two lock lines so m1 comes first. The deadlock cells readout falls from 10 to 0; finishing cells take the same ticks under both orders (15, 18, 21, 24 for work between 0 to 3). In the default cell the round finishes in seven chunks, 18 ticks, 2 blocked tries.',
      'One CPU runs one line per tick, a blocked `lock` also takes a tick, turns go A, B, C with a fixed slice, and unlock hands the lock straight to the first waiter. Real schedules are unpredictable; the slice and work length stand in for that luck. The code uses a small language-neutral notation. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus three handles: "Time slice" 1 to 5 (starting at 2), "Work between locks" 0 to 3 (starting at 1), and "Lock order", As written or By number (starting As written). Each round plays chunk by chunk, then waits.',
        'The move that makes the idea land is walking the map marker across the diagonal with the slice and work handles — deadlock in one cell, finished in the next — and then flipping the order to By number and watching the whole deadlock region turn to finished.',
        'Readouts under the controls: Ticks, Blocked tries, Stuck threads and Deadlock cells.',
      ],
    },

    useWhen: [
      'The article explains why a deadlock can appear only occasionally in the same program, and needs the timing-dependent region laid out as a map rather than one unlucky run.',
      'A reader wants proof that a global lock order is a real guarantee rather than a lucky schedule; the deadlock count going from 10 to 0 across all twenty combinations, with no change in finishing time, makes that case.',
    ],

    avoidWhen: [
      'The article is about deadlock detection and recovery, such as killing or rolling back a victim. Nothing is undone here; the round simply stops.',
      'The subject is the Banker\'s algorithm or resource-allocation graphs with multiple instances. Each lock is a single resource.',
      'The point is livelock, starvation or priority inversion. None of these occur in the model.',
    ],

    contrastWith: [
      {
        concept: 'holdAndWait',
        note: 'Holding one lock while waiting for another is one precondition of deadlock; alone it only delays others. How long the first lock is held decides how many schedules deadlock.',
      },
      {
        concept: 'noPreemption',
        note: 'That a lock cannot be taken away is another precondition: when the processor moves on, the sleeping thread keeps what it holds. It is always present with locks and does not by itself cause deadlock.',
      },
      {
        concept: 'waitCycle',
        note: 'A closed cycle of waits is what a deadlock is at the moment it happens; the broader question is which schedules let that cycle close and which do not.',
      },
      {
        concept: 'lockOrdering',
        note: 'Lock ordering explains why waits can only point one way and never close a loop; as a guarantee it holds under every schedule and costs nothing in completion time.',
      },
    ],
  },
};
