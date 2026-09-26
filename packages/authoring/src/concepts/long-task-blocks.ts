/**
 * longTaskBlocks 개념 선언.
 *
 * canonical facet 은 `facet:longTaskBlocks` — 120ms 짜리 긴 셈 하나가 도는 동안
 * 클릭 셋(도착 20·50·80ms)이 태스크 줄에 차례로 서고, 긴 셈이 끝난 뒤에야 도착
 * 순서 그대로 처리되며 저마다 기다림(100·72·44ms)이 붙는 장면 하나만 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `cooperativeYielding` 이 쥔 "쪼갠 뒤 어디로 잇느냐" 비교에서, 이 조각은
 * **쪼개지 않은 기준선** 이다 — 태스크가 하나뿐이고 requeue 자체가 없다. definition
 * 의 주어를 "쪼개지 않은 하나의 긴 일" 에 두어 `cooperativeYielding`(쪼갬 방법의
 * 비교)·`yieldToRender`(쪼갠 쪽의 성공)·`microtaskStarvation`(쪼갠 쪽의 실패)
 * 어느 쪽과도 어휘가 겹치지 않게 했다. 이 조각에는 렌더/화면 개념이 아예 없다 —
 * 화면(screen)과 DOM 을 가르는 다른 세 facet 과 달리, 태스크 줄과 클릭의 기다림
 * 만 본다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const longTaskBlocksConcept: FacetConceptSource = {
  id: 'longTaskBlocks',
  label: 'A Long Task Blocks Queued Clicks',
  canonicalFacet: 'facet:longTaskBlocks',

  surface: {
    definition:
      'A single long-running task holds the one task queue for its entire duration; any click that arrives while it runs is queued behind it and only starts once the task has completely finished, in the order the clicks arrived.',
    exemplarKeywords: [
      'long task blocks input',
      'unresponsive page',
      'click queued behind a running task',
      'run-to-completion',
      'single-threaded JavaScript',
      'task queue is FIFO',
      'input latency from a busy script',
      'why the page freezes',
    ],
  },

  briefing: {
    observable: [
      'A caption walks through five moments in order: the task queue starting empty, the long calc starting and naming how long it will block, each click arriving and the queue length after it, the long calc ending, and each click starting to process with its wait time named.',
      'While the long calc runs, a solid "Long calc" box occupies the front of the task queue row; click boxes that arrive queue up directly behind it, each labeled by arrival order (Click 1, Click 2, Click 3).',
      'The moment the long calc ends, its box disappears and the queued click boxes slide forward to fill the front of the line — none of them moved or started while it was running.',
      'Clicks are handled strictly in the order they queued, not the order that would minimize anyone\'s wait: the earliest arrival (Click 1) waits the longest (100ms) because it queued first and the calc still had the most time left; the latest arrival (Click 3) waits the least (44ms).',
      'Each processed click moves down to a separate "Done" row and shows its own wait time; nothing about the click itself changes with how long it waited.',
      'There is no screen or DOM row count anywhere in this piece — only the task queue and the clicks moving through it.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole sequence — long calc, three arrivals, long calc ending, three clicks processed — on its own and then stops.',
        'A Replay button and a timeline strip sit below it; dragging the strip to any point holds the queue at that exact moment, such as all three clicks stacked up while the long calc is still shown running.',
      ],
    },

    useWhen: [
      'The article claims JavaScript is single-threaded and needs a concrete case where a click is not dropped, only delayed, and where the delay is exactly however much of the running task was left when the click arrived.',
      'The reader needs the baseline case — no chunking, no yielding, one task from start to end — before seeing what changes once that same task is split into pieces that requeue themselves.',
      'The point is that queued clicks are processed in arrival order, not in an order that would equalize their waits.',
    ],

    avoidWhen: [
      'The article discusses splitting a task into chunks, or compares the task queue against the microtask queue — this piece never chunks anything and never uses queueMicrotask.',
      'The subject is rendering or paint timing — this piece has no screen or DOM row concept, only the task queue and click handling.',
      'The point is reordering by priority rather than arrival order — every click here is handled strictly FIFO.',
    ],

    contrastWith: [
      {
        concept: 'cooperativeYielding',
        note: 'That screen only exists once this same shape of work is cut into chunks that requeue themselves; this is the unbroken run those chunks are measured against — nothing here ever interleaves before the task ends.',
      },
      {
        concept: 'yieldToRender',
        note: 'There the same total amount of work is deliberately split so a render can slip in between pieces; here it runs as one piece and nothing — click or paint — gets a turn until all of it is done.',
      },
      {
        concept: 'microtaskStarvation',
        note: 'Both end in one long wait with nothing interleaved in between, but here the block is a single task nobody tried to split; there the work is nominally split into eight runs and the freeze happens anyway because of which queue picks up the continuation.',
      },
    ],
  },
};
