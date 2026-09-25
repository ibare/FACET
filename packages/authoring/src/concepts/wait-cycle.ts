/**
 * waitCycle 개념 선언.
 *
 * canonical facet 은 `facet:waitCycle` — 스레드 A · B · C 가 같은 모양의 다섯 줄(자물쇠 둘을 잡고 · `work()` · 거꾸로
 * 놓기)을 돈다. A: m1 → m2 · B: m2 → m3 · C: m3 → m1. 틱 0 ~ 2 에 셋이 첫 자물쇠를 잡고, 틱 3 · 4 · 5 에 차례로 막혀
 * A → B · B → C · C → A 화살이 생긴다. 틱 6 에 "Ready: 0 · Asleep: 3 · Finished: 0". `work()` 는 한 번도 돌지 않았다.
 * 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `deadlock` 은 이 판(몫 1 · 사이 일 0)을 지도의 한 칸으로 품고, 어느 차례에서 고리가 닫히는지를 본다. 이쪽은
 * **고리가 닫히는 순간 무엇이 되는가** — 기다림 화살이 출발점으로 돌아오면 준비된 스레드가 없고 누구도 놓을 수 없다 —
 * 하나를 쥔다. 그래서 definition 은 wait-for arrows · returns to the first · no thread is ready · for good 을 독점한다.
 *
 * 전제 (설명 글 `waitCycle.md`): CPU 하나 · 한 틱 한 줄 · 막힌 시도도 한 틱 · A B C 차례 돌림. 다른 차례에서는 한
 * 스레드가 두 자물쇠를 다 잡고 끝까지 가 고리가 생기지 않을 수 있다. 코드는 가상 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const waitCycleConcept: FacetConceptSource = {
  id: 'waitCycle',
  label: 'Circular Wait (The Wait-For Arrows Close a Loop)',
  canonicalFacet: 'facet:waitCycle',

  surface: {
    definition:
      'Each thread sleeps on a lock held by the next, and once the chain of wait-for arrows returns to the first thread, no thread is ready and none can ever release its lock, so all of them stop for good.',
    exemplarKeywords: [
      'circular wait',
      'wait-for graph',
      'cycle in wait-for graph',
      'deadlock cycle',
      'threads waiting on each other',
      'all threads blocked',
      'deadlock detection by cycle',
      'program hangs with no CPU use',
    ],
  },

  briefing: {
    observable: [
      'Three threads each show five lines: A `lock(m1)`, `lock(m2)`, `work()`, `unlock(m2)`, `unlock(m1)`; B the same with m2 then m3; C with m3 then m1. A small ▸ marks each thread\'s next line; three locks m1, m2, m3 and a CPU box sit beside them.',
      'Ticks 0 to 2: "A runs lock(m1). It was free — now A holds it.", then B takes m2 and C takes m3.',
      'Tick 3: "A runs lock(m2). Held by B — A sleeps and waits." and an arrow A → B appears. Tick 4 adds B → C the same way.',
      'Tick 5: "C runs lock(m1). Held by A. Follow the arrows: C → A → B → C" — the third arrow lands on A and the loop is closed.',
      'Tick 6: "Ready: 0 · Asleep: 3 · Finished: 0 — no thread can take this tick." In six ticks `work()` never ran. Eight steps: the start, six ticks, and the halt.',
      'One CPU runs one line (or one blocked attempt) per tick, turning through A, B, C. With a different turn order one thread might take both locks and finish, and no loop would form. The code uses a small language-neutral notation. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays six ticks and the halt by itself and stops with all three threads asleep.',
        'A Replay button and a playback strip sit below it. Holding tick 5 shows the third arrow closing the loop.',
      ],
    },

    useWhen: [
      'The article defines circular wait, or explains deadlock detection as finding a cycle in a wait-for graph, and needs the arrows drawn and the loop closing on a concrete tick.',
      'A reader asks why a deadlocked program cannot sort itself out given time; the tick with zero ready threads shows there is no one left to act.',
    ],

    avoidWhen: [
      'The article is about how often deadlock happens across schedules or how to prevent it. One schedule is played and no fix is applied.',
      'The subject is recovering from deadlock, such as choosing a victim. The run stops at the halt.',
      'The point is cycles in general graphs or topological ordering. The arrows here are waits between threads.',
    ],

    contrastWith: [
      {
        concept: 'holdAndWait',
        note: 'Holding while waiting only lengthens the wait while the chain has an end; circular wait is the case where the chain has no end because it returns to its start.',
      },
      {
        concept: 'lockOrdering',
        note: 'A loop needs at least one wait that points back down to a lock taken earlier in someone else\'s order; a global order removes that possibility.',
      },
      {
        concept: 'deadlock',
        note: 'Circular wait is the state a deadlock is in; the broader question is which schedules reach that state and what rule keeps any of them from reaching it.',
      },
      {
        concept: 'cycleBlocksOrder',
        note: 'Both turn on a closed loop of dependencies halting progress; there it blocks an ordering of vertices from being completed, here it leaves every thread asleep on another.',
      },
    ],
  },
};
