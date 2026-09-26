/**
 * yieldToRender 개념 선언.
 *
 * canonical facet 은 `facet:yieldToRender` — 500 행을 100 행씩 다섯 조각으로
 * 쪼개어 `setTimeout(fn, 0)` 으로 이어 거는 고정된 코드 한 벌을 재생한다. 조각이
 * 끝날 때마다 60Hz 프레임 경계를 지났는지 보고, 지났으면 그 자리에서 화면이 DOM
 * 을 따라잡는다(렌더). 시간축 위에 조각의 자취(막대)와 렌더가 일어난 자리(점)가
 * 함께 남는다.
 *
 * ── 묶음 안에서의 자리
 *
 * `cooperativeYielding` 이 쥔 API·쪼갬 크기 비교에서, 이 조각은 **setTimeout
 * 귀퉁이 하나만 고정해 확대** 한 것이다 — 쪼갬 크기(100)도 API(setTimeout)도
 * 바뀌지 않는다. definition 의 주어를 "이 쪼갬이 렌더를 되게 한다" 라는 성공
 * 사례에 두어, 실패 사례인 `microtaskStarvation`(마이크로 줄, 렌더가 전혀 안
 * 일어남)과 정확히 거울상으로 갈랐다. `longTaskBlocks`(애초에 쪼개지 않음)와도
 * 어휘가 겹치지 않는다 — 이쪽은 렌더·화면·프레임 경계가 주어고, 클릭이나 태스크
 * 줄의 길이는 다루지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const yieldToRenderConcept: FacetConceptSource = {
  id: 'yieldToRender',
  label: 'Yielding via setTimeout Lets a Render Slip In',
  canonicalFacet: 'facet:yieldToRender',

  surface: {
    definition:
      'Splitting a long insert into fixed-size chunks, each requeued on the task queue with setTimeout, lets a screen paint slip in between chunks whenever a 60Hz frame boundary is crossed, so rows on screen catch up to rows in the DOM one paint at a time instead of only once at the very end.',
    exemplarKeywords: [
      'setTimeout(fn, 0) chunking',
      'yielding to the browser',
      'frame boundary crossed between tasks',
      'DOM rows vs painted rows',
      'incremental rendering of a long insert',
      'breaking up a task so it can render',
      'task queue reschedule',
    ],
  },

  briefing: {
    observable: [
      'Five lines of code sit at the top; the two lines that run each chunk are highlighted while a chunk executes, and the line that kicks off the first call is also highlighted for that first run only.',
      'A time axis below the code carries tick marks at every 16.67ms frame boundary — dashed and dim until passed, solid and colored once passed.',
      'Each executed chunk appears as a labeled block (chunk(0), chunk(100), …) placed along that axis at the moment it ran; the next chunk still waiting in the task queue shows as a dashed outline ahead of it.',
      'A small dot lands on the axis at the exact moment each render happens — not at every frame boundary, only at the boundaries a render actually caught.',
      'Two bars track DOM rows and rows on screen; the DOM bar advances the instant a chunk finishes, and the screen bar only advances at the render dot, catching the DOM bar up rather than tracking it continuously.',
      'A caption narrates each step: the script starting at t=0, a named chunk running and the DOM row count after it, or a render cutting in and the screen row count after it.',
    ],

    screen: {
      affordances: [
        'The screen plays through all five chunks and their renders on its own and stops once 500 rows are on screen.',
        'A Replay button and a timeline strip sit below it; dragging the strip back to any chunk or render holds the DOM/screen gap at that exact point for a closer look.',
      ],
    },

    useWhen: [
      'The article claims that chunking a long task is what lets the browser render in between, and needs the concrete mechanism — a frame boundary is crossed, so a render is taken then and only then.',
      'The reader needs to see that "rows in the DOM" and "rows on screen" are not the same number at every moment, and that the gap between them only closes at specific render points, not continuously.',
      'The point is showing the requeue-and-render pattern working as intended, isolated from any comparison of chunk sizes or of setTimeout against another API.',
    ],

    avoidWhen: [
      'The article wants to compare chunk sizes or compare setTimeout against queueMicrotask — this piece fixes both to one value and shows no comparison.',
      'The subject is click or input latency — there are no clicks in this piece, only chunk execution and rendering.',
      'The claim being illustrated is that any way of splitting work lets a render interleave — this piece\'s outcome depends specifically on requeuing through the task queue, not on splitting alone.',
    ],

    contrastWith: [
      {
        concept: 'microtaskStarvation',
        note: 'The mirrored piece: the same shape of chunked work continued through queueMicrotask instead of setTimeout never lets a render cut in at all. The queue chosen, not the fact of chunking, decides whether this happens.',
      },
      {
        concept: 'cooperativeYielding',
        note: 'This is one fixed corner of that broader comparison — always setTimeout, always a 100-row chunk — isolated so the render-slips-in mechanism can be seen without also varying chunk size or continuation API.',
      },
      {
        concept: 'longTaskBlocks',
        note: 'There the same total work runs as one unbroken task and nothing renders or responds before it ends; here it is cut into requeued pieces precisely so a render can land between them.',
      },
    ],
  },
};
