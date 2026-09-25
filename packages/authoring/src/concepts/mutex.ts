/**
 * mutex 개념 선언.
 *
 * canonical facet 은 `facet:mutex` — 두 스레드 A · B 가 공유 값 `count` 를 두 번씩 올린다(올림 한 번 = 세 줄
 * `let r = count` · `r = r + 1` · `count = r`). 가운데 실행 차례 줄에 틱마다 누가 어느 줄을 돌았는지 칸이 서고, 덮은
 * 쓰기는 빨간 "옛 값 → 새 값" 으로 표시된다. 손잡이 둘 — 돌림 몫 1 ~ 6 · 자물쇠 없음/있음. 자물쇠 없이 끝값은
 * 2 · 2 · 4 · 3 · 3 · 4(단조가 아님), 자물쇠를 켜면 여섯 몫 모두 4 · 틱 12 → 20 · 막힌 시도 3 · 3 · 3 · 2 · 0 · 1.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 다섯)
 *
 * 조각 다섯은 각각 한 장면이다 — 줄이 한 줄로 섞임(`interleaving`) · 한 줄이 세 걸음(`nonAtomicIncrement`) · 덮는 쓰기
 * 하나(`lostUpdate`) · 구간이 어디서 어디까지(`criticalSection`) · 주인 자리와 넘겨주기(`lockExcludes`). 이쪽은
 * **끊기는 자리를 손잡이로 돌려** 끝값이 몫의 크기가 아니라 끊기는 자리에 달렸다는 것, 그리고 자물쇠가 모든 몫에서
 * 끝값을 바로잡는 대가를 쥔다. 그래서 definition 은 time slice · where it cuts · every slice · cost in ticks 를 쥐고,
 * 조각들이 독점한 merged order · register · stale · owner · queue · first and last access 를 쓰지 않는다.
 *
 * 전제 (설명 글 `mutex.md`): 실제 스케줄러의 몫은 일정하지 않다 — 몫을 손잡이로 드러내 운을 손으로 돌려 보게 했다.
 * CPU 하나 · 한 틱 한 줄 · 막힌 시도도 한 틱. 넘겨주기 규약(놓는 틱에 줄 맨 앞에게 곧바로). 코드는 가상 표기.
 * 코드 패널은 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const mutexConcept: FacetConceptSource = {
  id: 'mutex',
  label: 'Mutex (Where the Time Slice Cuts vs a Lock)',
  canonicalFacet: 'facet:mutex',

  surface: {
    definition:
      'Whether two threads\' unsynchronized increments lose updates depends on where the time slice cuts them, not on its length; a mutex around each increment gives the correct count for every slice, at a cost in ticks.',
    exemplarKeywords: [
      'mutex',
      'mutual exclusion lock',
      'race condition',
      'pthread_mutex_lock',
      'synchronized counter',
      'shared counter increments lost',
      'nondeterministic bug depends on scheduling',
      'time slice and race conditions',
      'cost of locking',
      'lock contention',
      'thread safety',
    ],
  },

  briefing: {
    observable: [
      'Both threads run the same six lines: two increments of the shared `count`, each written as `let r = count` (or `r = count`), `r = r + 1`, `count = r`. Each thread has its own `r`; `count` sits in a Shared box starting at 0.',
      'A "Run order" row of tick cells fills as the round plays. Each step is one chunk — the ticks one thread held the CPU in a row — captioned "Tick 2–3 · B", and its lines drop into consecutive cells.',
      'A write that covers another thread\'s increment is marked in red with its old and new value. With the default slice 2 and no lock, B writes `1 → 1` at tick 6 and `2 → 2` at tick 11, and the round ends "Count: 2 · Expected: 4".',
      'Across the slice with the lock off, the final count is 2, 2, 4, 3, 3, 4 for slices 1 to 6 — not monotonic. It is right only when the slice is a multiple of three, the length of one increment, so the cut falls between increments; going from 3 to 4 makes it worse.',
      'With the lock on, each increment is wrapped as `lock(m)`, the three lines, `unlock(m)`. In the Run order row one thread\'s five lines stay together, broken only by the other thread\'s single blocked `lock(m)` cell. A band beside the cells shows who holds the lock, and in a lock box the thread markers move between the Owner seat and the Queue.',
      'With the lock on every slice ends at 4. Readouts show the price: Ticks rises from 12 to 20, and Blocked tries is 3, 3, 3, 2, 0, 1 for slices 1 to 6. Lost updates reads 2, 2, 0, 1, 1, 0 without the lock and 0 with it.',
      'One CPU runs one line per tick, a blocked `lock(m)` also takes a tick, and unlock hands the lock straight to the first thread in the queue. Real schedulers do not use a fixed slice; here the slice is a handle so the luck of the cut can be turned by hand. The code uses a small language-neutral notation. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: a six-position "Time slice" slider from 1 to 6, starting at 2, and a "Lock" switch, Off or On, starting Off. Each round plays chunk by chunk, then waits for a handle.',
        'The move that makes the idea land is stepping the slice from 3 to 4 with the lock off — the lines re-interleave, a red covered write appears, and the count drops from 4 to 3 — then switching the lock on and seeing every slice give 4.',
        'Readouts under the controls carry the round: Final count, Lost updates, Ticks and Blocked tries.',
      ],
    },

    useWhen: [
      'The article explains why a race condition shows up only sometimes and needs the same program to give different totals as the scheduling cut moves, including a larger slice that makes things worse.',
      'A reader asks what a mutex actually buys and at what price; the lock switch turns every total correct while the tick count and blocked tries show the cost.',
    ],

    avoidWhen: [
      'The article is about atomic instructions, compare-and-swap or lock-free counters. The only remedy shown is a lock.',
      'The subject is deadlock or several locks. There is one lock and it cannot deadlock here.',
      'The point is true parallelism on several cores or memory visibility between caches. One CPU interleaves the two threads.',
    ],

    contrastWith: [
      {
        concept: 'interleaving',
        note: 'Interleaving is about which merged orders are possible at all; a race asks what one of those orders, picked by the scheduler, does to a shared value.',
      },
      {
        concept: 'nonAtomicIncrement',
        note: 'That an increment is three steps is the opening; a mutex is needed because a switch can land inside those steps, and whether it does depends on the slice.',
      },
      {
        concept: 'lostUpdate',
        note: 'A lost update is the single overwrite that loses one thread\'s work; the question on this side is which schedules produce it and whether a lock removes it under all of them.',
      },
      {
        concept: 'criticalSection',
        note: 'The critical section decides which lines must be kept together; a mutex is the device that keeps them together, and its effect is measured over every slice.',
      },
      {
        concept: 'lockExcludes',
        note: 'Ownership, queueing and hand-off describe how one lock behaves; a mutex applies that behaviour to keep a shared counter correct, and pays for it in waiting.',
      },
    ],
  },
};
