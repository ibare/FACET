/**
 * noPreemption 개념 선언.
 *
 * canonical facet 은 `facet:noPreemption` — 자물쇠 `m` 하나, 우선순위 1(낮은 쪽)과 9(높은 쪽). 낮은 쪽이 틱 0 에 `m` 을
 * 잡고, 틱 2 에 온 높은 쪽이 CPU 를 곧바로 받지만 `lock(m)` 에 실패해 잠들고, CPU 는 낮은 쪽에게 되돌아간다. 틱 5 에
 * 낮은 쪽이 놓을 때에야 `m` 이 넘어간다. 아홉 틱 동안 CPU 는 네 번 넘어갔고 자물쇠는 한 번. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `deadlock` 에서는 몫이 끝나 CPU 가 넘어가도 쥔 자물쇠가 그대로 남는 모든 토막 경계가 이것이다. 이쪽은
 * **CPU 는 빼앗기지만 자물쇠는 빼앗기지 않는다** 는 대비 하나를 우선순위로 드러낸다. 그래서 definition 은 cannot be
 * taken · higher-priority · gets the processor at once · releases it itself 를 독점한다.
 *
 * 전제 (설명 글 `noPreemption.md`): CPU 하나 · 한 틱 한 줄 · 막힌 시도도 한 틱 · 준비된 것 가운데 우선순위 높은 쪽이
 * CPU 를 받는다 · 도착 틱과 우선순위는 예로 정했다 · 넘겨주기 규약. 코드는 가상 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const noPreemptionConcept: FacetConceptSource = {
  id: 'noPreemption',
  label: 'No Preemption (The CPU Moves, the Lock Stays)',
  canonicalFacet: 'facet:noPreemption',

  surface: {
    definition:
      'A lock cannot be taken from its holder the way the processor can: a higher-priority thread gets the CPU at once but still sleeps until the low-priority owner releases the lock itself.',
    exemplarKeywords: [
      'no preemption condition',
      'non-preemptible resource',
      'locks cannot be forcibly taken',
      'priority does not override a lock',
      'high-priority thread blocked by low-priority',
      'CPU preemption versus resource preemption',
      'four conditions for deadlock',
      'priority inversion',
    ],
  },

  briefing: {
    observable: [
      'One lock `m` and two threads. "Low priority" (Priority 1) runs `lock(m)`, three `work()` lines, `unlock(m)`, `work()`. "High priority" (Priority 9) runs `lock(m)`, `work()`, `unlock(m)` and arrives at tick 2. A CPU box shows who runs; two counters read "CPU passed" and "Lock changed hands".',
      'Tick 0: Low priority takes lock m. Tick 1: it runs one line, still holding m.',
      'Tick 2: "CPU: Low priority → High priority. Priority 9 > 1." — the processor moves at once. But High priority\'s `lock(m)` fails: "Lock m is held by Low priority. Cannot take it — asleep."',
      'Tick 3: "CPU: High priority → Low priority. High priority: asleep." Low priority runs ticks 3 and 4 still holding m; only at tick 5 does it release, "Handed straight to High priority, who wakes."',
      'High priority works at tick 6 and releases at 7; tick 8 goes back to Low priority for its last line. The run ends at "CPU passed: 4 · Lock changed hands: 1", and High priority slept three ticks (2, 3, 4) waiting on the lower-priority thread.',
      'One CPU runs one line (or one blocked attempt) per tick; the ready thread with the highest priority gets each tick; arrival times and priorities are example values; a released lock goes straight to the first waiter. The code uses a small language-neutral notation. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the nine ticks by itself and stops after Low priority\'s last line.',
        'A Replay button and a playback strip sit below it. Holding tick 2 then tick 3 shows the processor passing to the higher priority and coming straight back because the lock did not move.',
      ],
    },

    useWhen: [
      'The article names "no preemption" among the deadlock conditions and needs the contrast that makes it clear: the processor is taken away freely, the lock is not.',
      'A reader expects a higher-priority thread to simply take what it needs; the three ticks it sleeps behind a priority-1 holder show that locks do not yield to priority.',
    ],

    avoidWhen: [
      'The article is about full priority inversion with a medium-priority thread and its fixes such as priority inheritance. There are only two threads and no fix is applied.',
      'The subject is how schedulers preempt on timers. Preemption here happens only on the arrival of a higher priority.',
      'The point is an actual deadlock. The single lock is released and both threads finish.',
    ],

    contrastWith: [
      {
        concept: 'holdAndWait',
        note: 'Hold-and-wait is about the holder keeping its lock while it sleeps; no preemption is about nobody being able to take that lock away, even a thread the scheduler favours.',
      },
      {
        concept: 'priorityPreempt',
        note: 'Priority preemption takes the processor away from a running thread the moment a higher priority is ready; a lock gives no such right, so the higher-priority thread still waits for the owner.',
      },
      {
        concept: 'deadlock',
        note: 'No preemption is always present when locks are used and does not by itself cause deadlock; it is what keeps a closed cycle of waits from ever being broken from outside.',
      },
    ],
  },
};
