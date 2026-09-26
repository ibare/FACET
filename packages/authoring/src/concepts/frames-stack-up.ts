/**
 * framesStackUp 개념 선언.
 *
 * canonical facet 은 `facet:framesStackUp` — 조각. `origin` 토픽 `call-stack` 은
 * 버려졌고 조각이 이 하나뿐이라, 완제품 없이 이 토픽 이름으로 묶는다
 * (concept-meta-batch-protocol.md "묶는 법" 2번).
 *
 * script → a → b → c 네 겹이 동기 호출로 쌓이고, c 안의 `setTimeout(done, 0)` 이
 * 콜백을 스택이 아니라 태스크 줄로 넘긴다. 사슬이 위에서부터 걷혀 스택이 완전히
 * 비고 나서야 태스크 줄 맨 앞의 done 이 빈 스택으로 옮겨와 곧바로 걷힌다.
 *
 * 재귀·호출 스택 계열의 기존 개념(`recursionSelfCall` · `callStackUnwind`)과
 * 맞닿아 있지만, 이 조각은 재귀가 아니라 서로 다른 이름의 함수 네 개가 이어
 * 부르는 사슬이고, 주장도 "스택이 어떻게 쌓이고 걷히는가"가 아니라 "그 사이에
 * 예약된 콜백이 스택과 태스크 줄 중 어디서 기다리는가"다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const framesStackUpConcept: FacetConceptSource = {
  id: 'framesStackUp',
  label: 'Frames Stack Up (Call Stack vs Task Queue)',
  canonicalFacet: 'facet:framesStackUp',

  surface: {
    definition:
      'A synchronous chain of calls pushes one frame per call onto the call stack and pops them in reverse order as each returns, while a callback handed to setTimeout never joins that stack at all — it waits in the task queue and only moves onto the stack once every frame from the running chain has been popped and the stack is completely empty.',
    exemplarKeywords: [
      'call stack',
      'task queue',
      'event loop',
      'setTimeout(fn, 0)',
      'stack must be empty first',
      'synchronous call chain',
      'macrotask',
      'run to completion',
      'why setTimeout(fn, 0) does not run immediately',
    ],
  },

  briefing: {
    observable: [
      'A five-line code panel (function a/b/c calling the next, c scheduling done via setTimeout, then a top-level call to a) highlights whichever line the current step belongs to.',
      'A call stack column and a task queue column sit side by side; a depth counter on the stack reads out its current size.',
      'script, then a, then b, then c go onto the stack one at a time as each is called synchronously, each captioned "called, so it goes onto the stack" — the stack reaches depth four before anything comes off.',
      'Inside c, done is handed to the task queue instead of the stack ("handed to the task queue instead of the stack") — the stack depth does not change at that step.',
      'c, then b, then a, then script unwind off the top one at a time, each captioned "unwinds off the top of the stack", until the stack is empty.',
      'Only once the stack is empty does done move from the front of the task queue into the empty stack ("moves from the task queue into the empty stack"), and it is popped again immediately after.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole sequence — four calls, the schedule, four unwinds, then the queued callback moving in and out — on its own and stops there.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to any push or pop holds that single frame transition.',
        'The call chain (a calls b calls c) and the scheduled callback (done) are fixed, so an article can name exactly which line is running at each step.',
      ],
    },

    useWhen: [
      'The article claims or implies that setTimeout(fn, 0) runs immediately or interrupts the calling chain. Watching done sit untouched in the task queue through every push and pop of a, b and c, and only cross over once the stack has fully unwound, is the corrective.',
      'The reader needs "the stack is empty" to mean something concrete rather than a phrase — the depth counter dropping to zero right before the queued callback moves in is that moment made visible.',
    ],

    avoidWhen: [
      'The article is about a function calling itself, or about values a chain of calls returns. This chain calls four distinct functions once each and returns nothing that matters — no self-call and no computed return value are shown.',
      'The article is about how late a setTimeout callback actually fires relative to its requested delay. This piece only orders stack versus queue; it has no millisecond clock or lateness reading (that is timerIsAFloor).',
      'The article compares a queued timer against a promise chain, or asks which of two already-queued things runs first. Nothing here is a microtask, and only one callback is ever queued.',
    ],

    contrastWith: [
      {
        concept: 'recursionSelfCall',
        note: 'Both watch frames go onto the call stack one call at a time. That screen holds one function fixed and lets it call itself, so every frame runs the same code with its own argument; this one uses four distinct functions only to fill and then empty the stack, so it can show what a callback scheduled partway through does while it waits.',
      },
      {
        concept: 'callStackUnwind',
        note: 'Both show frames coming off the stack in reverse of the order they went on. That screen studies what a return value carries back into the frame below through a recursive chain; here no frame returns anything that matters — a frame\'s only job is to call the next function or hand a callback to the task queue, and the point is when the queue\'s front finally gets a turn, not what any frame computes.',
      },
    ],
  },
};
