/**
 * priorityPreempt 개념 선언.
 *
 * canonical facet 은 `facet:priorityPreempt` — 빌드(0, 길이 6, 순위 1)가 돌던 중 틱 2 에 소리 재생(길이 2, 순위 3)이
 * 와서 그 틱에 CPU 를 뺏는다. 빌드는 남은 4 를 쥐고 줄로 물러났다가 틱 5 에 돌아와 남은 양만 마저 돈다. 틱 3 의
 * 메일 확인(길이 1, 순위 2)은 3 보다 낮아 뺏지 못한다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리 (완제품 `priorityAging` 아래 조각 둘)
 *
 * 완제품은 비선점에서 에이징 간격을 돌려 앞당김과 그 값을 누가 치르는지를 쥔다. 형제 `aging` 은 순위의 수가 오르는
 * 장면이다. 이쪽은 순위가 **고정된 채** 한 동작 — **엄격히 높은 것이 도착한 그 틱에 돌던 것을 밀어내고, 밀려난 것은
 * 남은 양만 나중에 돈다** — 하나다. definition 은 strictly higher · arrives · takes the CPU at once · displaced ·
 * remaining burst 를 독점하고, 기다림으로 순위가 오르는 낱말을 쓰지 않는다.
 *
 * 전제: 순위는 수가 클수록 높다(교과서에 따라 반대). 순위는 처음부터 끝까지 그대로. 정수 틱, CPU 하나, 입출력 없음,
 * 바꾸는 비용 0. 같은 틱의 차례는 끝 · 도착 · 선점 판정 · 고름. 동률은 줄에 먼저 선 것. 값은 예로 정한 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const priorityPreemptConcept: FacetConceptSource = {
  id: 'priorityPreempt',
  label: 'Preemptive Priority (Higher Arrival Takes the CPU)',
  canonicalFacet: 'facet:priorityPreempt',

  surface: {
    definition:
      'In preemptive priority scheduling, a process arriving with strictly higher priority takes the CPU at once, and the displaced process keeps its remaining burst and later runs only that remainder.',
    exemplarKeywords: [
      'preemptive priority scheduling',
      'preemption',
      'higher priority process arrives',
      'preempted process resumes',
      'remaining burst time after preemption',
      'priority scheduling Gantt chart',
      'real-time task interrupts background task',
      'preemptive vs non-preemptive',
      'strictly higher priority',
    ],
  },

  briefing: {
    observable: [
      'Cards stand in "Not yet arrived", "Queue", "CPU" and "Done" areas, each showing "Priority: …" and "Left: …" as a row of cells that empty as the process runs. A "Tick: …" counter sits above.',
      'Build (length 6, priority 1) arrives at tick 0 and runs at once: "Arrived: Build. The CPU is free, so it runs at once."',
      'At tick 2 Audio playback (length 2, priority 3) arrives: "Priority 3 > 1, so Build is pushed off the CPU." Build steps back to the queue with its cells intact: "Build goes back to the queue holding the rest. Left: 4". While it waits its cells do not decrease.',
      'At tick 3 Mail check (length 1, priority 2) arrives: "Priority 2 ≤ 3, so it cannot push and waits in the queue." It lines up behind Build.',
      'At tick 4 Audio playback finishes and the highest in the queue, Mail check, goes up. At tick 5 it finishes, and "Back on the CPU: Build. It runs only the rest. Left: 4".',
      'Build finishes at tick 9: "All finished. Push-offs: 1". Build ran in two stretches, [0, 2) and [5, 9), adding up to its length 6. Waits: Build 3, Audio playback 0, Mail check 1. Seven steps with the opening view.',
      'Priority numbers count upward here (some textbooks treat smaller as higher) and never change during the run. Only a strictly higher arrival displaces the running process; equal or lower waits. Ticks are example values; one CPU, no I/O, no switching cost.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one tick boundary per step, and stops once Build finishes.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to tick 2 holds Build stepping back to the queue with 4 cells still filled.',
      ],
    },

    useWhen: [
      'The article explains preemption in priority scheduling and needs the reader to see that the interrupted process loses its place but not its progress.',
      'A reader thinks any new arrival can interrupt, and the article needs one arrival that does and one that, being lower than the running process, does not.',
    ],

    avoidWhen: [
      'The article is about priorities that change over time, such as aging or dynamic priority. The priorities here are fixed.',
      'The subject is priority inversion or priority inheritance with locks. No process holds a resource.',
      'The point is interrupt handling in hardware or interrupt priority levels. These are processes chosen by a scheduler.',
    ],

    contrastWith: [
      {
        concept: 'aging',
        note: 'Preemption acts on priorities as they are; aging changes the priorities themselves according to time spent waiting.',
      },
      {
        concept: 'priorityAging',
        note: 'Preemption decides when a higher priority takes effect. Tuning aging in a non-preemptive scheduler decides how quickly a low priority becomes high enough to be picked at all.',
      },
      {
        concept: 'timeSliceRotate',
        note: 'Both take a running process off the CPU with work left over. Priority preemption is triggered by a more important arrival, round robin by the end of a time slice.',
      },
      {
        concept: 'contextSwitching',
        note: 'Resuming exactly the remaining work presumes that the process\'s state was saved when it was pushed off; that save and restore is the switch itself.',
      },
    ],
  },
};
