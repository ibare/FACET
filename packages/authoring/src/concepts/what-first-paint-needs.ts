/**
 * whatFirstPaintNeeds 개념 선언.
 *
 * canonical facet 은 `facet:whatFirstPaintNeeds` — 조각. 머리에 자원 넷을 둔 문서
 * (screen 스타일시트 · print 스타일시트 · async 스크립트 · defer 스크립트)에서, 첫
 * 장이 그중 무엇을 기다리고 무엇을 뒤로 미루는지 가르는 일반 규칙(media 속성 ·
 * 스크립트 속성)을 보인다.
 *
 * ── 묶음 안에서 어떻게 갈랐나 (styleBlocksPaint 와)
 *
 * style-blocks-paint.ts 상단 주석 참조 — 저쪽은 언제나 막는 스타일시트 하나로
 * "DOM 완성 뒤에도 화면이 빈다" 는 결과 자체를 보이고, 이쪽은 자원을 넷으로 늘려
 * "무엇이 막고 무엇이 안 막는가" 를 가르는 규칙을 보인다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const whatFirstPaintNeedsConcept: FacetConceptSource = {
  id: 'whatFirstPaintNeeds',
  label: 'What First Paint Needs (Sorting Head Resources by Media and Attribute)',
  canonicalFacet: 'facet:whatFirstPaintNeeds',

  surface: {
    definition:
      "Among several resources declared in a document's head, only a stylesheet whose `media` matches the current output blocks first paint, while a print-only stylesheet and scripts carrying `async` or `defer` are all let through unblocked.",
    exemplarKeywords: [
      'what blocks first paint',
      'render-blocking resource criteria',
      'media attribute screen versus print',
      'async and defer never block paint',
      'print stylesheet does not block rendering',
      'critical resource identification',
      'head resource audit',
      'which resources delay rendering',
      'render-blocking versus non-blocking head resources',
    ],
  },

  briefing: {
    observable: [
      'Four lanes run in parallel, one per head line — a screen stylesheet, a print stylesheet, an async script, and a defer script — each drawn as its own code line above a colored bar.',
      "Every lane's request departs together as the head is read, but only two of the four bars are marked as blocking first paint; a caption names exactly which one that is once all four requests are out.",
      'A separate caption marks the moment parsing of the body finishes, with the screen still blank at that point regardless of which resources have already arrived.',
      "Each stylesheet's arrival is announced on its own lane as a plain event, with no execution attached to it.",
      'First paint fires at its own marked moment, and its caption states how many of the four head resources are still unfinished at that instant — the non-blocking ones are free to still be in flight.',
      "The two scripts each get their own later captions for starting to run and finishing, stated in milliseconds after first paint, and the defer script's finish is the one tied to DOMContentLoaded.",
    ],

    screen: {
      affordances: [
        'A Replay button and a timeline scrub strip are the only controls; the four head resources, their media and attribute values, and their durations are all fixed, so scrubbing is how the reader checks which lane crosses the first-paint marker and which do not.',
      ],
    },

    useWhen: [
      'The article says a stylesheet "blocks rendering" as a blanket rule. This piece is where that rule needs a condition attached — a print-only stylesheet sits right beside a screen one and never blocks anything.',
      'The reader needs one place that shows all four determinants side by side — media type for stylesheets, and the mere presence of async or defer for scripts — rather than inferring the rule from a single example.',
    ],

    avoidWhen: [
      'The article follows only one stylesheet blocking paint and wants the length of the resulting blank screen itself, not a comparison across several resources.',
      'The point is the difference between defer and async in terms of when each script executes relative to the other, rather than whether either one blocks first paint at all — neither ever does.',
      'The subject is a script with no attribute freezing the parser itself, or a resource whose request departs earlier than usual because of a preload hint. Neither appears in this document.',
    ],

    contrastWith: [
      {
        concept: 'styleBlocksPaint',
        note: 'That holds one always-blocking stylesheet fixed and shows the DOM-complete-then-blank-then-paint sequence it causes; this varies four head resources at once and works out, resource by resource, which ones share that blocking power and which never do.',
      },
      {
        concept: 'deferVsAsync',
        note: 'This treats defer and async only as reasons a script never blocks first paint, without following either one further; that follows the same two attributes through their own request-arrival-execution order instead.',
      },
      {
        concept: 'preloadHint',
        note: 'This only sorts resources already declared in the head into blocking and non-blocking, without changing when any of them is requested; that moves one resource’s request earlier through an explicit hint and follows what changes because of it.',
      },
      {
        concept: 'criticalPath',
        note: 'This sorts four fixed head resources into what blocks first paint and what does not; that follows one blocking stylesheet and one script attribute through an entire timeline, with a font in play, rather than classifying a larger fixed set.',
      },
    ],
  },
};
