/**
 * readyQueuePick 개념 선언.
 *
 * canonical facet 은 `facet:readyQueuePick` — CPU 자리 하나와 준비 큐 한 줄. P1(0, 3) · P2(1, 2) · P3(2, 4) · P4(6, 1)이
 * 도착해 CPU 가 차 있으면 줄 끝에 서고, CPU 가 비는 그 걸음에만 줄 맨 앞이 빠져 오른다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 스케줄 묶음의 완제품 `schedulingPolicy` 는 줄에서 무엇을 먼저 고르느냐를 바꿔 견준다. 이쪽은 정책 이전의
 * 한 장면 — **줄에 서고, CPU 가 빌 때만 맨 앞이 빠진다** — 하나다. 화면이 쥐는 것은 줄의 구성원이지 시각 축 ·
 * 대기의 수 · 평균이 아니다. 그래서 definition 은 ready queue · joins the tail · dispatched · only when the CPU
 * becomes free 를 독점하고, 시작 틱 셈(`firstComeFirstRun`) · 대기 합(`convoyEffect`)의 낱말을 쓰지 않는다.
 *
 * 전제: 틱은 차례를 정하는 데만 쓴다(시간 축은 그리지 않는다). CPU 하나, 입출력 없음, 바꾸는 비용 0, 선점 없음.
 * 한 틱 경계의 차례는 끝 → 도착이 줄 끝 → 빈 CPU 에 맨 앞. 같은 틱 도착은 목록 차례. 값은 예로 정한 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const readyQueuePickConcept: FacetConceptSource = {
  id: 'readyQueuePick',
  label: 'Ready Queue (Wait in Line, Dispatch When the CPU Frees)',
  canonicalFacet: 'facet:readyQueuePick',

  surface: {
    definition:
      'Processes ready to run but not running wait in the ready queue: an arrival joins the tail while the CPU is busy, and the head is dispatched only at the moment the CPU becomes free.',
    exemplarKeywords: [
      'ready queue',
      'run queue',
      'ready list',
      'dispatcher',
      'dispatch the next process',
      'waiting for the CPU',
      'short-term scheduler picks from the ready queue',
      'uniprocessor only one process runs at a time',
      'process joins the ready queue',
    ],
  },

  briefing: {
    observable: [
      'An upper box is the CPU slot and a lower box is the "Ready queue", marked "front" and "back". Dashed chips at the lower right are processes that are "Not yet arrived"; finished ones move to "Finished".',
      'Four processes come: P1 at tick 0 needing 3 ticks, P2 at tick 1 needing 2, P3 at tick 2 needing 4, P4 at tick 6 needing 1.',
      'At tick 0 P1 finds the line and the CPU empty and goes straight up: "Arrives: P1. Nobody is waiting and the CPU is free — it goes straight up."',
      'At ticks 1 and 2 P2 and P3 arrive while P1 is running, and each "joins the back of the line"; the line grows to length 2 without anyone leaving it.',
      'At tick 3 P1 finishes, and in that same step the front of the line, P2, rises into the CPU and P3 shifts forward: "Finished: P1. The CPU is free — the front of the line goes up: P2."',
      'P4 arrives at tick 6 while P3 runs and stands in the empty line, so it is both back and front. The run ends at tick 10 with "The line is empty — the CPU stays idle." Nine steps in all: the opening view and eight tick boundaries where the line or the CPU changed.',
      'Processes reach the CPU in arrival order, P1 · P2 · P3 · P4, because the front is always taken; no one leaves from the middle or cuts in. Ticks only order events here — no time axis is drawn. One CPU, no I/O, switching costs nothing, and a process that starts runs to completion.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one tick boundary per step, and stops when the CPU goes idle at tick 10.',
        'A Replay button and a playback strip sit below it. Once the run is over, dragging the strip to the tick 3 step holds the moment P2 leaves the front just as P1 leaves the CPU.',
      ],
    },

    useWhen: [
      'The article introduces the ready queue and needs the reader to see that a waiting process moves only when the running one gives up the CPU, not when it arrives.',
      'A reader confuses "ready" with "running", and the article wants processes that are ready yet sitting in line because the single CPU is taken.',
    ],

    avoidWhen: [
      'The article is about how long each process waited or averages of waiting time. No times or totals are displayed.',
      'The subject is the queue data structure itself (enqueue, dequeue, circular buffers). The line here is the operating system\'s list of ready processes, not an implementation.',
      'The point is blocked processes waiting for I/O. Nothing here blocks; every process is ready from arrival.',
    ],

    contrastWith: [
      {
        concept: 'queueFifo',
        note: 'A FIFO queue is a general ordering guarantee. The ready queue adds a trigger: its head leaves only when the CPU frees, so the queue\'s length tracks how long the CPU stays busy.',
      },
      {
        concept: 'firstComeFirstRun',
        note: 'Line membership says who is waiting and in what order. First-come first-served timing turns that order into start and finish times.',
      },
      {
        concept: 'processState',
        note: 'Being in the ready queue is one state a process can be in. The full life cycle covers how it gets there and where else it can go, such as blocked on I/O.',
      },
      {
        concept: 'schedulingPolicy',
        note: 'Taking the head of the line is one choice. A scheduling policy can pick any member by some key, and that choice is what differs between policies.',
      },
    ],
  },
};
