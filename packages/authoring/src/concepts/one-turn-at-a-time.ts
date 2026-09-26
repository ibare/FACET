/**
 * oneTurnAtATime 개념 선언.
 *
 * canonical facet 은 `facet:oneTurnAtATime` — 조각. `origin` 토픽 `task-queue` 는
 * 버려졌고 조각이 둘(`oneTurnAtATime` · `timerIsAFloor`) 남아, 완제품 없이 이
 * 토픽 이름으로 묶는다. **이 둘은 형제라 definition 을 갈라 썼다** — 이쪽은
 * 시각(ms)을 전혀 재지 않고 "차례가 겹치는가"만 보고, `timerIsAFloor` 는 반대로
 * 차례 자체보다 실제 밀리초와 늦음을 잰다.
 *
 * clickA(3 단위) 가 도는 중 2 단위째에 clickB 가 도착하지만 줄 맨 뒤에 설 뿐,
 * clickA 의 남은 단위나 뒤이은 timer(2 단위) 사이로 끼어들지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const oneTurnAtATimeConcept: FacetConceptSource = {
  id: 'oneTurnAtATime',
  label: 'One Turn at a Time (Run-to-Completion Scheduling)',
  canonicalFacet: 'facet:oneTurnAtATime',

  surface: {
    definition:
      'Once a queued task is dequeued it runs every one of its units to completion before the next queued task starts; a task that arrives while another is running joins the back of the queue and waits there rather than interleaving with the task currently in progress.',
    exemplarKeywords: [
      'task queue',
      'run to completion',
      'single-threaded scheduling',
      'javascript never interleaves tasks',
      'no preemption between tasks',
      'a running task cannot be paused by another',
      'FIFO task queue',
      'tasks queue up while one runs',
    ],
  },

  briefing: {
    observable: [
      'A queue section, a running section and a finished-order section each track their own list of task labels (Click A, Timer, Click B).',
      'Click A is dequeued first and its units tick forward one at a time, each captioned "keeps running. Unit {u} of {total}." — the queue and finished sections stand still while this happens.',
      'While Click A is on its second of three units, Click B lines up at the back of the queue, captioned "lines up at the back of the queue" — Click A\'s remaining unit still has to play out before anything else moves.',
      'Click A only leaves the running section once its last unit is captioned "runs to the end", and it is only then that the next queued task (Timer) is dequeued and starts its own units from the first.',
      'The finished-order section accumulates task labels one at a time, in the order each task ran to completion rather than the order it arrived — Click A finishes, then Timer, then Click B.',
      'No millisecond value appears anywhere on this screen — only turn counts and unit progress, since what is being watched is whether a task is interrupted, not how long it takes.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole run — one task after another, with Click B\'s arrival in the middle of it — on its own and stops once every task has finished.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to any unit tick or to the arrival step holds that moment.',
        'The starting queue, every task\'s unit count, and the arrival mid-run are fixed, so an article can name exactly which unit of which task was running when the newcomer joined.',
      ],
    },

    useWhen: [
      'The reader assumes two tasks can time-slice or interleave the way threads might. Click B arriving mid-run and only ever joining the back of the queue — never cutting into Click A\'s remaining unit — is the corrective.',
      'The article claims a running task cannot be interrupted by anything that shows up while it runs, and needs that arrival visibly queuing behind rather than breaking in.',
    ],

    avoidWhen: [
      'The article is about how long a callback actually waits before its turn, in real milliseconds, or about a timer\'s requested delay versus its actual firing time. This piece counts turns and arrivals only; it has no clock (that is timerIsAFloor).',
      'The article is about a microtask or promise callback jumping ahead of an already-queued task. Nothing here settles early or promotes out of turn order — every task simply waits its place in one queue.',
      'The point is what decides the order tasks enter the queue in (a timer\'s floor, a click\'s real arrival time) rather than what happens once they are already queued. This piece starts from a queue that is already set.',
    ],

    contrastWith: [
      {
        concept: 'timerIsAFloor',
        note: 'Both watch the same task queue, but this one starts from tasks already queued and asks only whether a newcomer can interleave with a task already running — no timer, no wall clock, no lateness reading anywhere. That one asks a different question about the same queue: whether the delay a timer requests is the delay its callback actually gets once it becomes eligible to queue at all.',
      },
    ],
  },
};
