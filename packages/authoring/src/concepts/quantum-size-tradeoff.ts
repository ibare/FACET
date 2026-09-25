/**
 * quantumSizeTradeoff 개념 선언.
 *
 * canonical facet 은 `facet:quantumSizeTradeoff` — 같은 세 일감 A · B · C(모두 틱 0, 길이 4)가 몫 1(위) · 몫 4(아래)로
 * 나란히 같은 틱을 지난다. 몫 1 은 바뀜 11 · 평균 첫 응답 1.00, 몫 4 는 바뀜 2 · 4.00. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리 (완제품 `roundRobinQuantum` 아래 조각 둘)
 *
 * 완제품은 몫을 1 ~ 5 로 쓸고 바꾸는 비용 1 틱이 끝을 미는 것 · 몫 5 가 FCFS 가 되는 것을 쥔다. 형제
 * `timeSliceRotate` 는 줄 끝으로 돌아가는 동작이다. 이쪽은 **고정된 두 몫을 한 틱씩 나란히 세어 바뀜의 수와 첫 응답을
 * 견주는** 한 장면이다 — 비용은 0 으로 두고 세기만 한다, 손잡이도 없다. definition 은 side by side · count ·
 * first turn · cuts the CPU timeline 을 독점하고, 완제품의 overhead delays · collapses into FCFS 를 쓰지 않는다.
 *
 * 전제: 정수 틱, CPU 하나, 입출력 없음, 바꾸는 비용 0 틱(바뀜을 세기만 한다). 첫 오름과, 줄이 비어 같은 것이 다시 오르는
 * 것은 바뀜이 아니다. 평균 반환은 몫 1 이 11.00, 몫 4 가 8.00 — 길이가 같은 일감이라 작은 몫이 끝을 늦춘다. 값은 예로 정한 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const quantumSizeTradeoffConcept: FacetConceptSource = {
  id: 'quantumSizeTradeoff',
  label: 'Small vs Large Quantum (Switch Count vs First Turn)',
  canonicalFacet: 'facet:quantumSizeTradeoff',

  surface: {
    definition:
      'Running the same jobs side by side with a quantum of 1 and of 4 shows the small one cutting the CPU timeline into many more segments, counting far more switches, while every job gets its first turn sooner.',
    exemplarKeywords: [
      'small time quantum',
      'large time quantum',
      'number of context switches',
      'response time in round robin',
      'time to first run',
      'quantum size comparison',
      'interactive responsiveness',
      'more switches with a shorter slice',
    ],
  },

  briefing: {
    observable: [
      'Two halves share one tick axis 0 to 12: "Quantum 1" above and "Quantum 4" below. Each has its own CPU band and rows for jobs A, B and C, all arriving at tick 0 with length 4.',
      'Every tick, in both halves at once, one unit of a job moves from its row into that tick\'s cell of the CPU band. When the cell\'s owner differs from the previous cell, a cut mark stands between them — one cut is one switch. Captions report it: "Tick 1 — quantum 1: B · quantum 4: A", "Switch only on quantum 1: A → B." The first pick is not a switch.',
      'The quantum-1 band changes owner every tick and ends in twelve segments, "Switches: 11". The quantum-4 band changes only every four ticks and ends in three, "Switches: 2".',
      'A line under each job runs from arrival to its first tick on the CPU ("First run: …"). With quantum 1, A, B and C each touch the CPU within the first three ticks — first run 0, 1, 2, "Avg first run: 1.00". With quantum 4, C waits eight ticks — 0, 4, 8, "Avg first run: 4.00".',
      'The last step sums up: "Switches — quantum 1: 11 · quantum 4: 2" and "Average first run — quantum 1: 1.00 · quantum 4: 4.00". Fourteen steps: the opening, twelve ticks and the totals.',
      'Switching costs 0 ticks here and is only counted; in a real system each switch pays for saving and restoring state. With equal-length jobs the small quantum also finishes later on average (turnaround 11.00 against 8.00), which the screen does not show. Ticks and lengths are example values.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one tick per step in both halves together, and stops on the totals. There is no handle; the two quanta are fixed.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to tick 1 holds the first cut appearing only in the quantum-1 band.',
      ],
    },

    useWhen: [
      'The article claims a smaller quantum makes a system feel more responsive and must show the other side of the same coin: many more switches for the same work.',
      'The article needs the reader to count context switches in a round-robin schedule and see them as cuts in the CPU timeline.',
    ],

    avoidWhen: [
      'The article is about how the switch cost delays completion or where round robin turns into first-come first-served. Switching is free here and only two quanta appear.',
      'The subject is what a context switch saves and restores. A switch here is only a change of owner on the timeline.',
      'The article discusses jobs of different lengths or staggered arrivals. All three are the same length and arrive together.',
    ],

    contrastWith: [
      {
        concept: 'timeSliceRotate',
        note: 'Going to the back of the queue is the round-robin rule; comparing two slice sizes asks how often that rule should fire and what each firing buys and costs.',
      },
      {
        concept: 'roundRobinQuantum',
        note: 'Counting switches for two slices isolates the trade. Once each switch costs time, the count turns into delay for every job, and the full range of slices reaches a point where round robin stops rotating at all.',
      },
      {
        concept: 'contextSwitching',
        note: 'A context switch is the act of saving one execution state and restoring another. Counting switches treats that act as a unit of cost, one that grows with how finely the CPU is shared.',
      },
    ],
  },
};
