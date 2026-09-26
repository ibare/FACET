/**
 * timerIsAFloor 개념 선언.
 *
 * canonical facet 은 `facet:timerIsAFloor` — 조각. `origin` 토픽 `task-queue` 는
 * 버려졌고 조각이 둘(`oneTurnAtATime` · `timerIsAFloor`) 남아, 완제품 없이 이
 * 토픽 이름으로 묶는다. **형제 `oneTurnAtATime` 과 definition 을 갈라 썼다** —
 * 그쪽은 시각을 재지 않고 차례가 겹치는지만 보고, 이쪽은 반대로 차례보다
 * 실제 밀리초와 그 늦음(lateness)을 잰다.
 *
 * 두 setTimeout(delay 0ms · 5ms) 이 동기 스크립트(9ms 짜리 busyFor)가 도는 동안
 * 등록되고 만기에 이르지만, 콜백은 스택이 빌 때까지 기다렸다가 등록 순서대로
 * 불린다 — 실제로 불린 시각은 청한 지연보다 늦다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const timerIsAFloorConcept: FacetConceptSource = {
  id: 'timerIsAFloor',
  label: 'A Timer Is a Floor, Not a Promise',
  canonicalFacet: 'facet:timerIsAFloor',

  surface: {
    definition:
      "setTimeout's delay sets only the earliest moment a callback becomes eligible to join the task queue — once eligible it still waits there behind whatever already occupies the stack and queue, so the gap in milliseconds between the requested delay and the callback's actual call time grows with how busy the stack already is.",
    exemplarKeywords: [
      'setTimeout delay is a minimum, not a guarantee',
      'timer lateness',
      'requested vs actual delay',
      'task queue FIFO',
      'a busy main thread delays timers',
      'setTimeout(fn, 0) still waits',
      'why timers fire late',
      'single-threaded event loop timing',
    ],
  },

  briefing: {
    observable: [
      'A five-line code panel shows two setTimeout calls (requested delay 0ms and 5ms) followed by a sync call that keeps the stack busy for 9ms, with the running line highlighted at each step.',
      'A stack indicator toggles between Busy and Idle, and a task-queue list shows which timers are currently waiting there.',
      'Both timers are registered at t=0ms; the first (0ms) joins the task queue immediately, captioned "registers a timer" — the second (5ms) does not queue yet.',
      'At t=5ms the second timer reaches its floor and joins the task queue while the stack is still marked Busy, captioned "timer is due and joins the task queue" — reaching a floor and getting a turn are shown as two separate moments.',
      'At t=9ms the stack becomes Idle ("script finishes; the stack is empty") and only then are the two queued callbacks dequeued in FIFO order.',
      'Each dequeue reads out three numbers side by side: requested delay, actual call time, and lateness — the first timer shows requested 0ms, actual 9ms, late by 9ms; the second shows requested 5ms, actual 13ms, late by 8ms.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole timeline — both registrations, the second timer becoming due, the script ending, then both dequeues — on its own and stops there.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to any registration, due, or dequeue step holds that moment\'s requested/actual/lateness reading.',
        'The two timers\' requested delays and the script\'s busy time are fixed, so an article can name the exact lateness each timer ends up with.',
      ],
    },

    useWhen: [
      'The reader assumes setTimeout(fn, 0) fires immediately, or that a requested delay of X ms is exactly when the callback runs. The requested/actual/lateness readout for both timers — 9ms late and 8ms late despite requesting 0ms and 5ms — is the corrective.',
      'The article explains why a busy synchronous script pushes every pending timer\'s actual firing time later than requested, and needs the real millisecond gap rather than just "it waits its turn."',
    ],

    avoidWhen: [
      'The article only cares about the order tasks run in once queued, without needing actual milliseconds. That is oneTurnAtATime\'s claim; this piece\'s own point is the millisecond gap itself.',
      'The article is about a promise chain running ahead of a queued timer. No promise appears in this piece\'s code — both scheduled callbacks are plain setTimeout calls.',
      'The point is how the call stack itself fills and empties through a chain of synchronous calls. That mechanism is assumed here (shown only as a Busy/Idle toggle), not drawn frame by frame; framesStackUp draws it.',
    ],

    contrastWith: [
      {
        concept: 'oneTurnAtATime',
        note: 'Both watch the same task queue, but this one measures a real millisecond clock — requested delay against actual call time and the lateness between them — while that one has no clock at all and asks only whether a task arriving mid-run can interleave with the one already going, using turn counts instead of milliseconds.',
      },
    ],
  },
};
