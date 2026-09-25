/**
 * demoteOnOveruse 개념 선언.
 *
 * canonical facet 은 `facet:demoteOnOveruse` — 줄 0 · 1 · 2(몫 1 · 2 · 4)의 다단계 피드백 큐. 대용량 계산(0, 8)은
 * 몫을 다 쓸 때마다 줄 0 → 1 → 2 로 내려앉고, 글자 입력(0, 1)과 파일 목록(8, 1)은 몫 안에 끝나 줄 0 을 떠나지 않는다.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `schedulingPolicy` 는 MLFQ 를 네 정책 가운데 하나로 두고, 길이를 모르고도 큰 것 먼저 일감에서 SRTF 에
 * 가깝다가 짧은 것이 이어 오면 가장 나쁘다는 것을 견준다. 이쪽은 MLFQ 의 한 규칙 — **몫을 끝까지 다 쓴 것만 한 단
 * 내려앉는다** — 하나다. 같은 줄 안에서 뒤로 도는 모습(`timeSliceRotate`)이나 순위의 수(`aging`)가 아니다.
 * definition 은 multilevel feedback queue · entire quantum · moved down · longer quantum · stays at its level 을 독점한다.
 *
 * 전제: 틱 단위, CPU 하나, 입출력 없음, 바꾸는 비용 0. 선점 없음(이 예에서는 그런 일이 생기지 않는다).
 * 승급(주기적 끌어올림)은 두지 않았다 — 실제 MLFQ 는 아래 줄의 굶주림을 막으려 둔다. 값은 예로 정한 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const demoteOnOveruseConcept: FacetConceptSource = {
  id: 'demoteOnOveruse',
  label: 'MLFQ Demotion (Use the Whole Quantum, Drop a Level)',
  canonicalFacet: 'facet:demoteOnOveruse',

  surface: {
    definition:
      'In a multilevel feedback queue, a process that uses its entire quantum is moved down to a lower queue with a longer quantum, while one that finishes within its quantum stays at its level.',
    exemplarKeywords: [
      'multilevel feedback queue',
      'MLFQ',
      'MLFQ demotion rule',
      'CPU-bound process sinks to lower queue',
      'interactive process stays at high priority',
      'learning job length from behaviour',
      'queue levels with increasing time quantum',
      'priority lowered after using the full time slice',
      'feedback scheduling',
    ],
  },

  briefing: {
    observable: [
      'Three waiting rows, "Queue 0", "Queue 1", "Queue 2" from the top, with quanta 1, 2 and 4 ("Quantum: …"). A central CPU column and a "Done" area sit beside them; a chip keeps the height of its own queue even while on the CPU or done, and small cells under the CPU fill up as the quantum is used.',
      'Three processes: Big compute arrives at tick 0 needing 8 ticks, Typing at tick 0 needing 1, File list at tick 8 needing 1. Each card shows "Left: …".',
      'At tick 1 Big compute has used its whole quantum of 1: "Big compute used its whole quantum (1) · queue 0 → 1", and Typing gets the CPU in queue 0.',
      'At tick 2 Typing finishes without ever leaving queue 0. Big compute runs with quantum 2, uses all of it and drops to queue 2 at tick 4, then runs again with quantum 4 because nothing else is waiting.',
      'At tick 8 Big compute has used its quantum 4 but is already at the bottom: "already at the bottom, stays in queue 2". In the same tick File list arrives in queue 0 and goes straight up, finishing at tick 9 without waiting behind the long job.',
      'Big compute takes its last tick and finishes at tick 10, "still in queue 2". Big compute was demoted twice; the two short ones never left the top. Turnaround: Big compute 10, Typing 2, File list 1. Eight steps in all.',
      'Ticks are model units; one CPU, no I/O, no switching cost. A lower queue waits while any higher one has a process. There is no preemption between queues and no promotion back up — real multilevel feedback queues periodically raise everyone to the top to prevent starvation, which is not modelled.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one tick boundary with an event per step, and stops when Big compute finishes.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to tick 1 or tick 4 holds Big compute at the moment it drops one queue.',
      ],
    },

    useWhen: [
      'The article explains how a multilevel feedback queue sorts jobs without being told their lengths, and needs the rule that a full quantum used means a level down.',
      'A reader asks how an interactive task keeps high priority beside a long computation, and the article needs short jobs finishing in the top queue while the long one sinks.',
    ],

    avoidWhen: [
      'The article is about priority boosts, anti-starvation resets or gaming the scheduler by yielding just before the quantum ends. None of that is modelled.',
      'The subject is a fixed multilevel queue where processes are assigned to queues by type. Here queue membership changes with behaviour.',
      'The article compares MLFQ against other policies on averages. Only one small run is shown, with no averages.',
    ],

    contrastWith: [
      {
        concept: 'timeSliceRotate',
        note: 'In round robin a used-up slice sends a process to the back of the same queue. In a feedback queue it sends the process to a different queue with a longer slice, so the penalty accumulates.',
      },
      {
        concept: 'aging',
        note: 'Demotion lowers the standing of a job that used too much; aging raises the standing of a job that waited too long. Real multilevel feedback queues pair the two.',
      },
      {
        concept: 'schedulingPolicy',
        note: 'Demotion is how MLFQ guesses lengths it cannot know. How good that guess is compared with policies that know the lengths depends on the arrivals.',
      },
    ],
  },
};
