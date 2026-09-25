/**
 * convoyEffect 개념 선언.
 *
 * canonical facet 은 `facet:convoyEffect` — 길이 10 의 큰 작업이 틱 0 에 CPU 에 오르고, 작은 넷(도착 1 · 2 · 2 · 3,
 * 길이 1 · 1 · 2 · 1)이 뒤에 선다. 한 걸음이 한 틱이고, 큰 작업이 도는 틱마다 줄에 선 기둥 모두가 한 칸씩 자란다.
 * 작은 넷의 대기 39 가운데 32 가 큰 작업이 CPU 를 쥔 동안 쌓였다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `schedulingPolicy` 는 같은 일감(큰 것 먼저)에서 다른 정책이 그 대기를 큰 것에게 넘기는 것을 견준다.
 * 이쪽은 FCFS 한 차례 안의 한 장면 — **큰 것이 CPU 를 쥔 동안 뒤의 대기가 모두 나란히 불어난다** — 하나다.
 * 두 차례의 견줌은 `shortestFirst` 의 것이다. definition 은 convoy · CPU-bound job at the front · accumulate
 * together · most of the waiting 을 독점하고, 순서를 바꾸는 말(shortest · reorder)을 쓰지 않는다.
 *
 * 전제: 정수 틱, CPU 하나, 입출력 없음, 바꾸는 비용 0, 선점 없음. 대기는 줄에 서 있던 틱 수(반환 − 길이). 값은 예로 정한 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const convoyEffectConcept: FacetConceptSource = {
  id: 'convoyEffect',
  label: 'Convoy Effect (Short Jobs Stuck Behind a Long One)',
  canonicalFacet: 'facet:convoyEffect',

  surface: {
    definition:
      'In first-come first-served scheduling, while one long job holds the CPU, every short job queued behind it accumulates waiting time together tick by tick, so one job at the front causes most of the total wait.',
    exemplarKeywords: [
      'convoy effect',
      'FCFS disadvantage',
      'long job blocks short jobs',
      'CPU-bound process ahead of I/O-bound processes',
      'high average waiting time in FCFS',
      'short processes stuck behind a long process',
      'why FCFS is bad for interactive jobs',
      'truck on a one-lane road',
    ],
  },

  briefing: {
    observable: [
      'A CPU column on the left holds the Big job as a stack of cells ("Left: 10"); four small jobs S1–S4 stand to the right as columns marked "Not here yet", then "Waiting", then "Running" and "End: …".',
      'One step is one tick. The Big job arrives at tick 0 and goes straight up; the small jobs arrive at ticks 1, 2, 2 and 3 with lengths 1, 1, 2 and 1.',
      'Each tick the Big job runs, its top cell leaves and every waiting column grows by one cell at the same time. Captions count it: "Tick 7→8 · on CPU: Big job · waiting: 4, each +1" and "Ticks waited so far, small jobs: 24". From tick 3 all four are waiting, so each tick adds four.',
      'By the time the Big job finishes at tick 10 the small jobs have piled up 32 ticks of waiting. Then they leave quickly — S1 ends at 11, S2 at 12, S3 at 14, S4 at 15 — adding only 7 more.',
      'Cells take the colour of whichever job held the CPU during that tick, so most of each waiting column stays in the Big job\'s colour. The accumulated columns never shrink.',
      'The run closes on "Small jobs — ticks run: 5 · ticks waited: 39" and "Waited while Big job held the CPU: 32 · after: 7". Average wait is 7.80 over all five jobs, 9.75 over the small four. Ticks are integers; one CPU, no I/O, no switching cost, and a job on the CPU runs to the end.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one tick per step, and stops after the last small job ends at tick 15.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip back to any tick while the Big job is running holds the moment four columns grow together.',
        'The jobs and their values are fixed, so the 39-against-5 contrast and the 32/7 split can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article names the convoy effect as FCFS\'s weakness and needs the reader to see the waiting of several short jobs growing in parallel behind one long job.',
      'The article argues that most of the waiting comes from a single long job at the front rather than from the short jobs\' own order, and wants the split of 32 during against 7 after.',
    ],

    avoidWhen: [
      'The article is about how reordering to shortest-first reduces the waiting. Only arrival order is run here.',
      'The subject is convoys in networking or head-of-line blocking in switches and HTTP. This is CPU scheduling.',
      'The point is lock convoys, where threads queue on a contended mutex. No locks appear.',
    ],

    contrastWith: [
      {
        concept: 'shortestFirst',
        note: 'The convoy effect describes the damage done by a long job placed first; shortest-first is the reordering that removes it when every job is already present.',
      },
      {
        concept: 'firstComeFirstRun',
        note: 'The FCFS start-time rule says when each job begins. The convoy effect is what that rule adds up to when the first job is long.',
      },
      {
        concept: 'starvationOfLong',
        note: 'In a convoy, short jobs wait behind a long one; in starvation under shortest-first, the long one waits behind an endless stream of short ones. The victim is reversed.',
      },
      {
        concept: 'schedulingPolicy',
        note: 'The convoy is one policy on one workload. Replacing the policy on the same workload shows the accumulated wait being handed to the long job instead.',
      },
    ],
  },
};
