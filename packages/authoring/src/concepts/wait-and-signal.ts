/**
 * waitAndSignal 개념 선언.
 *
 * canonical facet 은 `facet:waitAndSignal` — 받는 쪽 A(`lock(m)` · `while not ready` · `wait(c, m)` · `take()` ·
 * `unlock(m)`)와 주는 쪽 B(`lock(m)` · `ready = true` · `signal(c)` · `unlock(m)`). A 가 틱 3 에 `wait(c, m)` 으로 자물쇠를
 * 내려놓고 조건 변수 곁에 잠들고, 자물쇠는 줄에 선 B 에게 넘어간다. B 의 `signal(c)` 에 A 는 곧바로 달리지 않고 자물쇠
 * 줄로 옮겨 설 뿐이고, 틱 6 에 자물쇠를 되받아 틱 7 에 조건을 다시 본다(모두 두 번). 열 틱. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `producerConsumer` 는 같은 잠듦 · 깸을 세마포어 둘로 하고 버퍼 칸 수를 돌린다. 이쪽은 **조건 변수의 기다림**
 * — 기다리며 자물쇠를 내려놓고, 깨어나도 자물쇠를 되받아 `while` 로 다시 본다(메사 방식) — 하나를 쥔다. 그래서
 * definition 은 condition variable · releases the mutex · reacquire · recheck in a while loop 을 독점한다.
 *
 * 전제 (설명 글 `waitAndSignal.md`): CPU 하나 · 한 틱 한 줄 · A B 차례 · 막힌 시도도 한 틱 · 넘겨주기 규약(`wait` 의
 * 내려놓기도 같다). 메사 방식(POSIX `pthread_cond_wait`, 자바 `wait`/`notify`). 코드는 가상 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const waitAndSignalConcept: FacetConceptSource = {
  id: 'waitAndSignal',
  label: 'Condition Variable Wait and Signal (Release, Sleep, Recheck)',
  canonicalFacet: 'facet:waitAndSignal',

  surface: {
    definition:
      'A thread whose condition is false calls wait on a condition variable, which releases the mutex while it sleeps; after a signal it must reacquire the mutex and recheck the condition in a while loop before going on.',
    exemplarKeywords: [
      'condition variable',
      'wait and signal',
      'wait and notify',
      'pthread_cond_wait',
      'Mesa semantics',
      'why while instead of if',
      'spurious wakeup',
      'monitor',
      'guarded wait',
    ],
  },

  briefing: {
    observable: [
      'Two programs side by side. A (Taker): `lock(m)`, `while not ready`, `wait(c, m)`, `take()`, `unlock(m)`. B (Giver): `lock(m)`, `ready = true`, `signal(c)`, `unlock(m)`. Three places are marked "Queue for m", "Holds m" and "Asleep on c"; `ready` starts false and a "Checked" counter starts at 0.',
      'Tick 0 "Lock m was free. Owner now: A." Tick 1 "Lock m is held by A. B sleeps in its queue." Tick 2 "A checks ready: false. Into the loop body."',
      'Tick 3: "A puts down m and sleeps on c. m passes to B." — A leaves the lock behind and moves to the condition variable, and the waiting B gets the lock at once.',
      'Tick 4 "B sets ready = true." Tick 5 "B signals c. A moves to the queue for m, still asleep." — signalled, A does not run yet; B still holds the lock.',
      'Tick 6 "B releases m. It passes straight to A." Tick 7 "A checks ready: true. Past the loop." — A rechecks before trusting the condition; "Checked" reaches 2. Tick 8 A runs `take()`, tick 9 A releases m. Ten ticks.',
      'One CPU runs one line (or one blocked attempt) per tick, turning between A and B. A released lock, including the one put down by `wait`, goes straight to the first waiter. The code uses a small language-neutral notation. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the ten ticks by itself and stops once A has released the lock.',
        'A Replay button and a playback strip sit below it. Stepping through ticks 3, 5 and 6 follows A from the lock to the condition variable, to the lock queue, and back into the lock.',
      ],
    },

    useWhen: [
      'The article explains why waiting on a condition while holding a mutex needs a condition variable at all: the waiter must let go of the lock, or the thread that would make the condition true can never get in.',
      'A reader asks why the textbook pattern uses `while` rather than `if` around `wait`; the signalled thread moving to the lock queue and checking again after it gets the lock shows the reason.',
    ],

    avoidWhen: [
      'The article is about semaphores. The waiting here is on a condition variable paired with a mutex.',
      'The subject is Hoare-style monitors, where the signalled thread runs immediately. This is the Mesa style.',
      'The point is broadcast wakeups or many waiters. There is one waiter and one signal.',
    ],

    contrastWith: [
      {
        concept: 'producerConsumer',
        note: 'Semaphores carry the condition in their count and need no recheck; a condition variable carries no state, so the waiter relies on a separate shared variable and must look at it again after waking.',
      },
      {
        concept: 'lockExcludes',
        note: 'A lock alone makes others wait until the owner is done; a condition variable lets the owner step out while it waits for something only another thread can provide.',
      },
      {
        concept: 'blockedWaitsEvent',
        note: 'A process blocked on a device wakes when the event arrives and is ready to run; a thread woken from a condition variable must still win back the mutex and confirm the condition.',
      },
    ],
  },
};
