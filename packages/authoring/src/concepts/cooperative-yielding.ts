/**
 * cooperativeYielding 개념 선언.
 *
 * canonical facet 은 `facet:cooperativeYielding` — 완제품. 500 행을 넣는 일을
 * 손잡이 둘로 돌린다: 쪼갬 크기(500·250·100·50·25)와 다음 조각을 잇는 곳
 * (`setTimeout` 태스크 줄 vs `queueMicrotask` 마이크로 줄). 판마다 DOM 행 수·
 * 화면 행 수 막대, 클릭 셋(도착 7·27·47ms)의 기다림, 지금 도는 코드(native, 두
 * 변형 중 손잡이가 고른 쪽)를 보이고, 계기로 렌더 횟수와 가장 긴 기다림을 쌓는다.
 * 코드 패널은 별개로 스케줄 계산을 정수 산수 IR 로 보인다.
 *
 * ── 묶음 안에서 definition 을 어떻게 갈랐나
 *
 * 이 개념 하나가 "쪼갠 뒤 어디로 잇느냐" 라는 **비교** 를 쥔다 — 두 API 와 다섯
 * 쪼갬 크기를 손잡이로 돌려 보며 "쪼갬 크기는 결과를 안 바꾸고 잇는 곳이 바꾼다"
 * 는 것 자체가 이 화면의 주장이다. 조각 셋은 저마다 이 비교의 한 귀퉁이만 고정해
 * 보인다:
 *   - `longTaskBlocks` 는 애초에 쪼개지 않은 기준선(하나의 긴 일, 렌더 개념 없음).
 *   - `yieldToRender` 는 `setTimeout` 쪽 귀퉁이(늘 이 API, 늘 100행)만 확대.
 *   - `microtaskStarvation` 는 `queueMicrotask` 쪽 귀퉁이(늘 이 API, 늘 7ms·8회)만
 *     확대.
 * definition 의 주어를 "쪼갬 자체가 아니라 잇는 곳" 에 두어 세 조각의 "한 쪽만
 * 보인다" 는 진술과 겹치지 않게 했다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const cooperativeYieldingConcept: FacetConceptSource = {
  id: 'cooperativeYielding',
  label: 'Cooperative Yielding (Task Queue vs Microtask Queue)',
  canonicalFacet: 'facet:cooperativeYielding',

  surface: {
    definition:
      'Whether splitting a long computation into chunks keeps a page responsive depends on where each chunk requeues its continuation: through the task queue a render and pending clicks can interleave between chunks, through the microtask queue nothing does, no matter how small the chunks are.',
    exemplarKeywords: [
      'cooperative scheduling',
      'setTimeout vs queueMicrotask',
      'task queue vs microtask queue',
      'yielding to the main thread',
      'chunk size does not fix jank',
      'render starvation',
      'responsive UI',
      'click latency during a busy script',
      'why chunking alone is not enough',
    ],
  },

  briefing: {
    observable: [
      'A caption names the round in one line: chunk size, number of chunks, ms per chunk, and which API is continuing it (setTimeout or queueMicrotask).',
      'Two bars track DOM rows and rows on screen; below them a code block shows the actual running variant of the two native snippets, swapped whenever the "Continuation via" handle changes.',
      'With setTimeout, the DOM bar advances in visible steps and the screen bar keeps catching up between them, so several renders happen before all 500 rows are in.',
      'With queueMicrotask, the DOM bar fills to completion before the screen bar ever moves — the whole chunked job runs inside a single task, so only one render happens, after everything is already done.',
      'Three click markers sit at fixed positions; each appears, grows a wait bar, then fades to leave only a "Waited {ms}ms" caption once it is finally handled.',
      'A separate code panel (not the native snippet in the stage) shows the schedule computation as an IR, and highlights the phase — chunk, click, or render — the algorithm is currently in.',
      'Two metrics accumulate for the round: a render count and the longest click wait in milliseconds; both reset to 0 at the start of each new round.',
    ],

    screen: {
      affordances: [
        'Standard playback controls — play, step, pause, reset, speed — replay the current round; changing either handle starts a fresh round with the new setting.',
        'A "Chunk size" segmented slider picks among 500, 250, 100, 50 or 25 rows per chunk; a "Continuation via" segmented slider switches between setTimeout and queueMicrotask.',
        'The round always inserts the same 500 rows and delivers the same three clicks at the same arrival times, so only the chunking choice changes between rounds.',
      ],
    },

    useWhen: [
      'The article claims that breaking a long task into smaller pieces is what keeps a page responsive, and needs the correction that the pieces still have to requeue through the task queue — the microtask queue defeats the same chunking.',
      'The reader needs to see that shrinking the chunk size (500 down to 25) does not by itself change whether a render or a click gets a turn — only the choice of queue does.',
      'The article compares click latency under the two continuation strategies and wants the render count and longest wait side by side.',
    ],

    avoidWhen: [
      'The article is about the browser rendering pipeline itself (layout, paint, compositing) rather than about when the main thread yields to it.',
      'The point is a single task that is never chunked at all — that baseline belongs to a piece that fixes one long task, not this comparison across chunk sizes and APIs.',
      'The subject is microtask ordering in general (why a `.then()` runs before a `setTimeout` callback) rather than the specific failure mode of a self-requeuing chunked loop.',
    ],

    contrastWith: [
      {
        concept: 'longTaskBlocks',
        note: 'That is the unchunked baseline this compares against — one task, no requeuing, nothing interleaves before it ends. This shows what changes once the same work is split, and that splitting alone is not the deciding factor.',
      },
      {
        concept: 'yieldToRender',
        note: 'One fixed corner of this comparison — always setTimeout, always a 100-row chunk — isolated so the interleaved-render claim can be seen without also varying chunk size or API.',
      },
      {
        concept: 'microtaskStarvation',
        note: 'The opposite fixed corner — always queueMicrotask, a fixed per-step cost instead of a fixed row count — isolated to show the same freeze in closer detail: passed frame boundaries with no paint until the very end.',
      },
    ],
  },
};
