/**
 * firstComeFirstRun 개념 선언.
 *
 * canonical facet 은 `facet:firstComeFirstRun` — A(0, 3) · B(2, 6) · C(4, 1) · D(12, 2)가 도착 자리에서 CPU 줄로
 * 옮겨 와 앞의 끝에 이어 붙는다. C 는 길이 1 인데도 B 의 끝 9 를 기다리고, D 는 CPU 가 10 · 11 을 비운 뒤
 * 제 도착 12 에서 시작한다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `schedulingPolicy` 에서 FCFS 는 네 값 가운데 하나다. 이쪽은 FCFS 의 한 셈 — **시작 = 도착과 앞의 끝
 * 가운데 늦은 쪽** — 하나를 시간 축 위의 시작점 · 끝점으로 보인다. 줄의 구성원(`readyQueuePick`) · 누적 대기
 * (`convoyEffect`) · 평균은 이 화면의 것이 아니다. definition 은 start time · later of · previous finish ·
 * idle gap 을 독점한다.
 *
 * 전제: 틱은 순간이고 한 틱을 돈다는 것은 t 에서 t+1 까지 쓰는 것. CPU 하나, 입출력 없음, 바꾸는 비용 0.
 * 같은 틱의 차례는 끝 → 도착 → 빈 CPU 가 줄 맨 앞을 올림. 값은 예로 정한 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const firstComeFirstRunConcept: FacetConceptSource = {
  id: 'firstComeFirstRun',
  label: 'FCFS Start Times (Later of Arrival and Previous Finish)',
  canonicalFacet: 'facet:firstComeFirstRun',

  surface: {
    definition:
      'Under first-come first-served, each process starts at the later of its own arrival and the previous process\'s finish and runs uninterrupted, leaving the CPU idle when the next has not arrived.',
    exemplarKeywords: [
      'FCFS scheduling',
      'first come first served',
      'FCFS Gantt chart',
      'start time and completion time',
      'CPU idle time between processes',
      'non-preemptive scheduling',
      'FIFO scheduling',
      'max(arrival, previous finish)',
      'scheduling timeline exercise',
    ],
  },

  briefing: {
    observable: [
      'Four processes sit at their arrival positions above a CPU row laid along a tick axis 0 to 14: A arrives at 0 with length 3, B at 2 with 6, C at 4 with 1, D at 12 with 2.',
      'Each step, the next process moves from its arrival position down onto the CPU row and attaches to the end of the one before; the sideways distance it moves is the gap between arrival and start. Captions give the rule each time: "B starts: 3 · Later of arrival 2 and previous end 3".',
      'C has length 1 yet waits until B ends at tick 9 — nothing here looks at length, and a running process is never cut off.',
      'When C ends at tick 10, D has not arrived. The CPU row shows "idle" for ticks 10 and 11 ("CPU idle: 10" with "Next, not yet arrived: D · arrival: 12"), and D starts at its own arrival, tick 12, rather than at a previous end.',
      'The run ends with "D ends: 14 · All processes finished". Seven steps: the arrivals alone, then A start, B start, C start, CPU idle, D start and D end.',
      'Ticks are instants and running one tick means using the CPU from t to t+1. One CPU, no I/O, switching costs nothing; at a shared tick a finish is handled before an arrival, so the next process can start on the very tick the previous one ends.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one start or idle event per step, and stops once D ends at tick 14.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to the D step holds the idle gap with D starting at its arrival instead of at C\'s end.',
      ],
    },

    useWhen: [
      'The article works through an FCFS schedule by hand and needs the start-time rule shown as a rule, including the case where the CPU sits idle because the next process has not arrived.',
      'A reader thinks a short process should be able to go ahead of a long one under FCFS, and the article needs the one-tick job waiting out the six-tick job.',
    ],

    avoidWhen: [
      'The article is about total or average waiting time. The screen marks starts and ends, not waiting sums.',
      'The subject is who is in the ready queue at a given moment. Line membership is not drawn.',
      'The article is about FIFO queues as a data structure or FIFO page replacement. This is CPU scheduling order only.',
    ],

    contrastWith: [
      {
        concept: 'readyQueuePick',
        note: 'The ready queue says who is waiting and in what order; the first-come timing rule turns that order into exact start and finish ticks, including idle gaps when the queue is empty.',
      },
      {
        concept: 'convoyEffect',
        note: 'The start-time rule is neutral about lengths. The convoy effect is what that neutrality costs when the process at the front happens to be long.',
      },
      {
        concept: 'turnaroundVsWait',
        note: 'Start and finish ticks are the raw schedule; turnaround and waiting are the measures derived from them per process.',
      },
    ],
  },
};
