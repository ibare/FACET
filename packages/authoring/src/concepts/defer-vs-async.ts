/**
 * deferVsAsync 개념 선언.
 *
 * canonical facet 은 `facet:deferVsAsync` — 조각. 같은 문서, 같은 두 스크립트(big.js ·
 * small.js)를 나란히 두 쪽에 두고 한쪽엔 `defer`, 다른 쪽엔 `async` 를 붙여 실행
 * 차례가 어떻게 갈리는지만 보인다. 파서가 멈추는 일은 어느 쪽에도 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나 (parserStops 와)
 *
 * parser-stops.ts 상단 주석 참조 — 저쪽은 속성이 없어 파서가 멈추는 것, 이쪽은
 * 속성이 있어 파서는 멈추지 않되 두 스크립트의 실행 차례가 갈리는 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const deferVsAsyncConcept: FacetConceptSource = {
  id: 'deferVsAsync',
  label: 'defer vs async (Execution Order, Not a Frozen Parser)',
  canonicalFacet: 'facet:deferVsAsync',

  surface: {
    definition:
      'The same two scripts execute in document order when both carry `defer`, but in arrival order when both carry `async` instead, because `defer` queues execution until parsing ends while `async` runs each script the instant it lands.',
    exemplarKeywords: [
      'defer attribute',
      'async attribute',
      'script execution order',
      'document order versus arrival order',
      'defer runs after parsing finishes',
      'async runs on arrival',
      'non-deterministic script order',
      'DOMContentLoaded and defer scripts',
      'why script order changes with async',
      'defer vs async difference',
    ],
  },

  briefing: {
    observable: [
      "Two lanes, labeled defer and async, each carry the same document — a parsing bar, then big.js's row, then small.js's row — laid along one shared, squeezed time axis.",
      'In the defer lane, both request dots appear while parsing is still running, then both scripts sit still until a parse-end tick passes, and only then do their thick execution bars begin, big.js before small.js, in that fixed order.',
      'In the async lane, small.js — the smaller file — often finishes arriving before big.js despite being requested second, and its execution bar starts as soon as it lands, ahead of the still-arriving big.js.',
      'A moving dashed line sweeps across both lanes together at the same time value, so the same instant can be read off both scripts at once.',
      'A caption beneath the lanes names exactly what just happened — a request, an arrival, an execution starting or ending, a parse end, or DOMContentLoaded — one lane at a time as each occurs.',
      'A DOMContentLoaded tick appears in the defer lane only once every deferred script has finished executing, while the async lane never shows that tick tied to its scripts at all.',
    ],

    screen: {
      affordances: [
        'A Replay button and a timeline scrub strip are the only controls; both lanes are fixed to the same two scripts and the same document, so the reader compares the two orders by scrubbing through one shared timeline.',
      ],
    },

    useWhen: [
      'The article claims `defer` and `async` are interchangeable ways to avoid blocking the parser. Both avoid the freeze, but only defer preserves the document order the two script tags were written in.',
      "The reader assumes a script's position in the file decides when it runs. The async lane shows the smaller, later file finishing and executing before the larger, earlier one — order follows arrival, not position.",
    ],

    avoidWhen: [
      'The article is about a script with no attribute at all. Neither lane here ever stops the parser; that freeze belongs to facet:parserStops.',
      'The subject is whether a resource blocks first paint. Neither defer nor async ever blocks it, and this piece does not show a paint at all — only when each script executes.',
      'The point concerns more than two scripts, or scripts mixed with stylesheets in the head. This piece holds the set fixed at exactly two same-kind scripts.',
    ],

    contrastWith: [
      {
        concept: 'parserStops',
        note: 'This shows two attributes that both keep the parser moving, only reordering when each script runs; that shows the third option — no attribute at all — where the parser stops moving entirely until the one script finishes.',
      },
      {
        concept: 'whatFirstPaintNeeds',
        note: 'This follows two scripts through their own request-arrival-execution order under defer and async; that treats those same two attributes only as reasons a script never blocks first paint, without following when either one actually executes.',
      },
      {
        concept: 'criticalPath',
        note: "That lets the reader pick one attribute at a time (including none) for a single script alongside a font preload toggle; this holds a script attribute fixed across both scripts at once and compares defer's order against async's directly.",
      },
    ],
  },
};
