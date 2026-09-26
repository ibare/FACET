/**
 * criticalPath 개념 선언.
 *
 * canonical facet 은 `facet:criticalPath` — 완제품. 스크립트 속성(없음/defer/async)과
 * 글꼴 preload 힌트(없음/있음)를 손잡이 둘로 두고, 그 조합이 첫 장·DOM 완성·글꼴
 * 바뀜의 가시성을 어떻게 가르는지 재생한다. 문서는 site.css · app.js · brand.woff2
 * 세 자원과 본문 다섯 줄로 고정되어 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 묶음의 조각 여섯은 각각 이 완제품이 쥔 변수 하나(또는 그 변수가 만드는 결과
 * 하나)만 떼어 고정한 채 보인다 — parserStops 는 속성 없음 하나만, deferVsAsync 는
 * defer 대 async 하나만, fontSwap 은 글꼴이 항상 늦게 온다고 두고 그 바뀜만,
 * preloadHint 는 이미지에 건 힌트 하나만. 이 개념은 그 축들을 **손잡이로 남겨 둔
 * 채 동시에** 다룬다는 것이 다른 여섯과 갈리는 자리다 — definition 이 "joint
 * effect"·"together" 를 명시하는 까닭이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const criticalPathConcept: FacetConceptSource = {
  id: 'criticalPath',
  label: 'Critical Rendering Path (Script Attribute and Font Preload Together)',
  canonicalFacet: 'facet:criticalPath',

  surface: {
    definition:
      "A script's loading attribute (none, defer, or async) and a font's preload hint act together on one document, jointly shifting when first paint lands, when the DOM finishes building, and whether a fallback-to-web-font swap ever becomes visible.",
    exemplarKeywords: [
      'critical rendering path',
      'render-blocking resources',
      'script loading attribute comparison',
      'font preload strategy',
      'page load timeline',
      'first paint versus DOMContentLoaded',
      'web performance tuning',
      'loading waterfall',
      'perceived load time',
      'how loading choices interact',
    ],
  },

  briefing: {
    observable: [
      "A small cursor rides down a document panel of a preload line, a stylesheet line, a script line whose own code changes with the chosen attribute, and five body paragraphs, turning red and holding in place only when the script attribute is set to none.",
      'Three resource bars — site.css, app.js, brand.woff2 — grow from a request mark to an arrival mark; the app.js bar also grows a second, darker segment once its script starts running.',
      'A first-paint marker and a DOM-complete marker each drop onto a shared line as their moment arrives, with a bar drawn between them captioned as either paint landing first or DOM completing first, and by how many milliseconds.',
      'A blank rectangle on the right scales open into four placeholder lines the instant first paint fires.',
      'A paragraph of words appears first in a narrower fallback typeface; if the font arrives after that paint, the same words are redrawn in a wider typeface and some slide down to a following line.',
      'Three counters — parser stall, first paint, and how long the fallback font stayed visible — each update only on the round where their value actually changes.',
    ],

    screen: {
      affordances: [
        'Play, step, pause, reset and a speed control run the current combination; a "Script attribute" segmented control (none / defer / async) and a "Font preload" segmented control (none / on) choose the next one, both starting at their first, unmarked segment.',
        'Changing either segmented control restarts the same fixed document — three resources, five body lines, one paragraph of words — under the new combination.',
        'A code panel beside the stage can show the critical path written out in a chosen language.',
      ],
    },

    useWhen: [
      "The article's claim spans more than one loading decision at once — for instance that a script attribute choice and a font preload choice interact, rather than each acting on first paint independently of the other.",
      'The reader needs to see a font swap become avoidable rather than simply occur — toggling the preload hint on this same document and combination is what makes the swap disappear because the font already arrived before paint.',
    ],

    avoidWhen: [
      "The article's claim concerns only the script attribute by itself. facet:parserStops or facet:deferVsAsync isolate that variable without a font axis riding along.",
      'The claim concerns only the font swap or only a preload hint in isolation. facet:fontSwap and facet:preloadHint show each with nothing else changing.',
      "The article is about a stylesheet's media attribute, a print-only resource, or sorting several head resources into blocking and non-blocking. This document only ever has one always-blocking stylesheet.",
    ],

    contrastWith: [
      {
        concept: 'parserStops',
        note: 'That isolates the single case where the script carries no attribute and freezes the parser; this varies the attribute across none, defer, and async together with a font preload toggle to show how the combination moves first paint.',
      },
      {
        concept: 'deferVsAsync',
        note: 'That compares defer against async in isolation, with no font in play; this treats the script attribute as one of two dials, the other being whether the font is preloaded.',
      },
      {
        concept: 'preloadHint',
        note: "That shows a CSS-only background image whose preload hint moves its request earlier than the stylesheet that calls it; this applies a preload hint to the page's own web font and lets the reader watch whether it changes when the swap is seen.",
      },
      {
        concept: 'fontSwap',
        note: 'That always shows the fallback-to-web-font swap happening; this makes the swap conditional — turning the font preload on can make the swap disappear entirely because the font already arrived before first paint.',
      },
      {
        concept: 'styleBlocksPaint',
        note: "That isolates a stylesheet delaying paint until well after the DOM is already built; this keeps the stylesheet's own arrival simple and instead varies the script attribute and font preload around it.",
      },
      {
        concept: 'whatFirstPaintNeeds',
        note: 'That works out, across four head resources, which ones a single first paint waits on; this fixes the resource set at three and studies how two of the reader’s own choices move that one first-paint moment.',
      },
    ],
  },
};
