/**
 * holdAndWait 개념 선언.
 *
 * canonical facet 은 `facet:holdAndWait` — A 는 `disk` · `printer` 를 차례로 잡고, B 는 `printer` 만, C 는 `disk` 만
 * (틱 4 에 온다). A 가 틱 3 에 `printer` 앞에서 `disk` 를 쥔 채 잠들고, C 는 틱 4 에 `disk` 앞에서 잠든다. `disk` 는
 * 잠든 손에 네 틱(3 · 4 · 5 · 6) 머물고, 틱 1 ~ 10 사이 `disk` 로 한 일은 한 줄. 고리는 없어 틱 열셋에 모두 끝난다.
 * 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `deadlock` 에서 "사이 일" 이 쥔 채 머무는 시간이고 그 길이가 교착 칸을 넓힌다. 이쪽은 **고리 없이**
 * 점유 대기 하나 — 쥔 자원이 놀면서도 남에게 막혀 있다 — 를 쥔다. 그래서 definition 은 keeps holding · sits idle
 * yet unavailable · no cycle · eventually finishes 를 독점한다.
 *
 * 전제 (설명 글 `holdAndWait.md`): CPU 하나 · 한 틱 한 줄 · 막힌 시도도 한 틱 · B A C 차례 돌림 · 넘겨주기 규약.
 * A 의 `work()` 는 두 자물쇠를 함께 쓰는 줄로 본다. 코드는 가상 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const holdAndWaitConcept: FacetConceptSource = {
  id: 'holdAndWait',
  label: 'Hold and Wait (Asleep with a Lock in Hand)',
  canonicalFacet: 'facet:holdAndWait',

  surface: {
    definition:
      'A thread blocked on its second lock keeps holding its first, so that resource sits idle yet unavailable, and other threads needing it are delayed even though no cycle forms and everything eventually finishes.',
    exemplarKeywords: [
      'hold and wait',
      'hold-and-wait condition',
      'holding a lock while blocking',
      'acquire all locks at once',
      'resource held by a sleeping thread',
      'nested lock acquisition',
      'try-lock and back off',
      'four conditions for deadlock',
    ],
  },

  briefing: {
    observable: [
      'Three threads: B runs `lock(printer)`, three `work()` lines, `unlock(printer)`; A runs `lock(disk)`, `lock(printer)`, `work()`, `unlock(printer)`, `unlock(disk)`; C runs `lock(disk)`, `work()`, `unlock(disk)` and is "not here yet" until tick 4. Two locks, `disk` and `printer`, each show "Held by a sleeper" and "Work lines" counters.',
      'Tick 0 "B takes printer.", tick 1 "A takes disk.", tick 2 "B runs work()." At tick 3: "A sleeps at printer, still holding disk."',
      'At tick 4 C arrives: "C sleeps at disk. Holder A is asleep too." At ticks 5 and 6 B works while the caption repeats "disk stays in the hand of A, who is asleep." The disk\'s "Held by a sleeper" count climbs to 4 while its "Work lines" stays 0.',
      'Tick 7 "B releases printer. A wakes up holding it." A works at tick 8 and releases printer at 9; at tick 10 "A releases disk. C wakes up holding it."',
      'Tick 12 "C releases disk. It is free. · Every thread has finished." Thirteen ticks. From tick 1 to 10 the disk was used for one work line; C slept six ticks. The waits ran one way only — nothing closed a loop.',
      'One CPU runs one line (or one blocked attempt) per tick, turning through B, A, C; sleeping and not-yet-arrived threads are skipped, and a released lock goes straight to the first waiter. A\'s `work()` counts as using both locks. The code uses a small language-neutral notation. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the thirteen ticks by itself and stops once every thread has finished.',
        'A Replay button and a playback strip sit below it. Holding tick 4 shows A asleep holding disk and C asleep waiting for that same disk.',
      ],
    },

    useWhen: [
      'The article lists the four conditions for deadlock and needs hold-and-wait shown on its own, as the waste it causes even when nothing deadlocks.',
      'A reader is advised to acquire all needed locks at once, or release and retry; the disk held idle for four ticks while another thread sleeps on it shows what that advice avoids.',
    ],

    avoidWhen: [
      'The article needs an actual deadlock. The waits here run in one direction and every thread finishes.',
      'The subject is priority or preemption of the processor. All threads have equal standing and take turns.',
      'The point is lock ordering. Only A takes two locks, so no ordering between threads is at stake.',
    ],

    contrastWith: [
      {
        concept: 'waitCycle',
        note: 'Holding while waiting only makes others wait longer; when those waits loop back to the first thread, nobody can release and the wait becomes permanent.',
      },
      {
        concept: 'noPreemption',
        note: 'Hold-and-wait says the holder keeps its lock while it sleeps; no preemption says nobody else can take that lock from it, even with higher priority.',
      },
      {
        concept: 'deadlock',
        note: 'Hold-and-wait is one of the conditions; whether it turns into deadlock depends on how the schedule falls, and the longer a first lock is held, the more schedules do.',
      },
    ],
  },
};
