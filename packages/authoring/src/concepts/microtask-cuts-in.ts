/**
 * microtaskCutsIn 개념 선언.
 *
 * canonical facet 은 `facet:microtaskCutsIn` — 조각. `origin` 토픽
 * `microtask-queue` 에서 나온 조각 중 이것 하나만 남았다(절반은 다른 완제품에
 * 흡수됨). 완제품이 없으니 이 토픽 이름으로 묶는다.
 *
 * A · setTimeout(B,0) · Promise.resolve().then(C).then(D) · E, 여섯 줄짜리
 * 고정 스크립트를 돈다. B 가 태스크 줄에 먼저 섰어도, 그 뒤에 등록된 약속
 * 사슬의 C 와 D 가 마이크로태스크 줄을 두 번 돌며 먼저 끝나고, 마이크로태스크
 * 줄이 완전히 빈 뒤에야 B 의 차례가 온다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const microtaskCutsInConcept: FacetConceptSource = {
  id: 'microtaskCutsIn',
  label: 'Microtasks Cut in Line (Draining Before the Next Task)',
  canonicalFacet: 'facet:microtaskCutsIn',

  surface: {
    definition:
      'Between running one task-queue item and the next, the entire microtask queue drains to empty — including microtasks a running microtask itself adds along the way — so a promise-chain callback registered after a timer callback is already queued still finishes before that timer ever gets a turn.',
    exemplarKeywords: [
      'microtask queue drains before the next task',
      'promise then vs setTimeout order',
      'why promises run before setTimeout',
      'microtask queue empties fully',
      'task queue vs microtask queue priority',
      'event loop microtask checkpoint',
      'chained .then callbacks run first',
    ],
  },

  briefing: {
    observable: [
      'A six-line code panel (a log, a setTimeout, a two-deep promise chain, another log) sits beside a task-queue column, a microtask-queue column and a console-output list.',
      'The two synchronous logs run first and land directly in the output: A, then — after the timer and the chain are both registered — E.',
      'setTimeout\'s callback (B) is already due, so it joins the back of the task queue right when it is registered, captioned "already due, so it joins the back of the task queue."',
      'The promise chain\'s first callback (C) joins the microtask queue immediately because the promise is already settled; its second callback (D) does not queue yet — it waits on C\'s promise instead, captioned "the next callback waits for that promise instead of queueing."',
      'Once the stack is empty, the microtask queue\'s front runs (C), and finishing it settles the next promise, so D joins the microtask queue right then and runs next — both captioned "the front of the microtask queue runs," output becomes A, E, C, D.',
      'Only once the microtask queue is completely empty does the task queue\'s front finally run (B), captioned "the microtask queue is empty, so the front of the task queue finally runs" — final output order: A, E, C, D, B.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole six-statement script — both logs, both queues filling, the microtask drain, then the timer — on its own and stops once the output has all five values.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to any schedule or run step holds that queue state.',
        'The six-line script and its output order are fixed, so an article can name exactly which value appears at which position and why.',
      ],
    },

    useWhen: [
      'The reader assumes callbacks run in the order they were registered regardless of which API scheduled them. B is registered before C and D, yet the output order — A, E, C, D, B — and the caption trail are the corrective.',
      'The article claims that a microtask queued while another microtask is running still cuts ahead of an already-waiting timer callback. D joining the microtask queue mid-drain (because C\'s promise just settled) and still running before B demonstrates exactly that.',
    ],

    avoidWhen: [
      'The article is about whether splitting a large computation into microtask-based chunks freezes rendering. This piece runs one small fixed script with no chunking and no render or frame concept on screen at all.',
      'The article is only about a single timer\'s requested delay versus its actual firing time, in milliseconds. No lateness is measured here — only the relative order of two already-registered callbacks.',
      'The article compares whether a task arriving mid-run can interleave with the task in progress. No second task competes for the stack here; the only competition is between one queued task and one microtask chain.',
    ],

    contrastWith: [
      {
        concept: 'cooperativeYielding',
        note: 'That concept holds a single scheduling API fixed across many requeued chunks of one long loop, to ask whether a render or a pending click ever gets a turn between them. This one holds a single small script fixed and asks only which of two already-registered callbacks — one queued timer, one promise chain — gets the next turn; nothing here is chunked and nothing renders.',
      },
      {
        concept: 'microtaskStarvation',
        note: "That piece fixes queueMicrotask as the sole continuation of a self-requeuing loop to show a render frozen out entirely until the loop ends. Here the microtask queue is a short, finite promise chain, not a loop — it does finish, and the claim is only that it finishes ahead of an already-queued timer, not that it starves anything of a turn indefinitely.",
      },
    ],
  },
};
