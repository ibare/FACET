/**
 * stateTransitions 개념 선언.
 *
 * canonical facet 은 `facet:stateTransitions` — 원반 하나(프로세스)가 생성 · 준비 · 실행 · 대기 · 종료 다섯 상태
 * 사이를 옮김표의 길 여섯으로만 건넌다. 원인 여덟(받아들임 · 골라짐 · 타이머 · 골라짐 · 입출력 요청 · 입출력 끝 ·
 * 골라짐 · 끝냄)을 차례로 받고 종료에서 멈춘다. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `processState` 는 가운데 셋(준비 · 실행 · 대기)의 순환을 여러 프로세스로 돌려 CPU 이용률을 잰다. 이쪽은
 * **한 프로세스가 어느 길로만 옮길 수 있는가**, 곧 옮김의 규칙 하나를 쥔다. 그래서 definition 은 five states ·
 * six transitions · the event · waiting never goes straight to running 을 독점하고, 이용률 · 프로세스 수 · 깨우는
 * 사건의 줄은 쓰지 않는다.
 *
 * 전제 (설명 글 `stateTransitions.md`): 프로세스는 하나만 그렸다. 원인은 주어진 차례로 오고 시간은 재지 않는다.
 * 다섯 상태 · 여섯 길은 교과서 모형이며 실제 운영체제는 더 잘게 나눈다(내보내진 잠듦 · 좀비 같은 것).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const stateTransitionsConcept: FacetConceptSource = {
  id: 'stateTransitions',
  label: 'Process State Transitions (Five States, Six Moves)',
  canonicalFacet: 'facet:stateTransitions',

  surface: {
    definition:
      'A process moves among five states — new, ready, running, waiting, terminated — only along six allowed transitions, each triggered by one event; running alone has three exits, and waiting never returns directly to running.',
    exemplarKeywords: [
      'process state diagram',
      'five-state process model',
      'process life cycle',
      'ready to running dispatch',
      'running to waiting on I/O request',
      'timer interrupt returns process to ready',
      'why can a waiting process not run immediately',
      'admit and exit transitions',
      'state transition diagram operating system',
    ],
  },

  briefing: {
    observable: [
      'Five state boxes — New, Ready, Running, Waiting, Terminated — are joined by six labelled roads: Admit, Dispatch, Timer, I/O request, I/O done, Exit. A single disc, the process, starts in New ("Starts in: New.").',
      'Each step brings one cause. The roads leaving the current state are outlined, the cause\'s label fills, and the disc crosses along that road; the caption counts the exits, e.g. "Ways out of Ready: 1. Dispatch leads to Running."',
      'The causes arrive in this order: Admit, Dispatch, Timer, Dispatch, I/O request, I/O done, Dispatch, Exit. From Running the caption reads "Ways out of Running: 3." every time, and the cause picks Timer to Ready, I/O request to Waiting, or Exit to Terminated.',
      'When I/O done arrives in Waiting, the disc lands in Ready, not Running, and needs a further Dispatch before it runs again.',
      'The run ends in Terminated with "Ways out of Terminated: 0. Moves: 8 · roads used: 6/6." — nine steps in all, every road crossed at least once, Ready and Running each visited three times.',
      'Only one process is drawn and no time is measured; the causes are given in a fixed order rather than produced by a scheduler. The five states and six roads are the common textbook model — real systems split states further — which the screen does not footnote.',
    ],

    screen: {
      affordances: [
        'The screen plays the eight crossings by itself and stops in Terminated.',
        'A Replay button and a playback strip sit below it. Dragging back to a crossing out of Running holds the moment three outlined roads are on offer and the cause selects one.',
      ],
    },

    useWhen: [
      'The article introduces the process state model and wants each arrow tied to the event that causes it, crossed once by a moving process rather than listed.',
      'A reader thinks a process whose I/O has finished resumes running at once; the landing in Ready, and the extra Dispatch it waits for, settles that.',
    ],

    avoidWhen: [
      'The article is about several processes sharing a processor, or how busy the processor is. One process is drawn and nothing is timed.',
      'The subject is how the scheduler decides when Dispatch or Timer happens. The causes are handed in, not decided.',
      'The article needs suspended, zombie or other extended states. Only the five-state model is shown.',
    ],

    contrastWith: [
      {
        concept: 'processState',
        note: 'The transition rules describe one process\'s legal moves; multiprogramming repeats the ready-running-waiting loop across many processes and asks what that does to processor utilization.',
      },
      {
        concept: 'blockedWaitsEvent',
        note: 'The transition model treats I/O completion as a given event that moves the process to Ready; which event a particular sleeper is queued on, and why nothing else can wake it, is a separate question.',
      },
    ],
  },
};
