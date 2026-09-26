/**
 * styleBlocksPaint 개념 선언.
 *
 * canonical facet 은 `facet:styleBlocksPaint` — 조각. 문서 다섯 줄(스타일시트 link
 * 하나 + 본문 넷)을 다 읽어 DOM 이 완성된 뒤에도, 그 스타일시트가 아직 도착하지
 * 않았으면 화면은 계속 비어 있다가 도착한 순간 한꺼번에 그려진다는 것 하나만 보인다.
 *
 * ── 묶음 안에서 어떻게 갈랐나 (whatFirstPaintNeeds 와)
 *
 * 둘 다 "스타일시트가 첫 장을 막는다" 를 다룬다. 갈라 세운 것은 **범위**다.
 *
 *   이 개념             막는 스타일시트 정확히 하나만 두고, DOM 완성과 첫 장 사이에
 *                        생기는 빈 화면의 길이 그 자체를 보인다.
 *   whatFirstPaintNeeds  자원을 넷(스타일시트 둘 + 스크립트 둘)으로 늘려 그중
 *                        어떤 것이 막고 어떤 것이 안 막는지 가르는 규칙(media ·
 *                        스크립트 속성)을 보인다 — 빈 화면의 길이 자체는 다루지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const styleBlocksPaintConcept: FacetConceptSource = {
  id: 'styleBlocksPaint',
  label: 'Style Blocks Paint (Blank Screen After the DOM Is Done)',
  canonicalFacet: 'facet:styleBlocksPaint',

  surface: {
    definition:
      "A render-blocking stylesheet lets the parser finish reading every line and building the full DOM while the screen stays blank, because painting waits for that stylesheet's own arrival even after parsing is already done.",
    exemplarKeywords: [
      'render-blocking stylesheet',
      'CSS blocks rendering not parsing',
      'blank screen while DOM is complete',
      'DOM complete before first paint',
      'render tree needs CSSOM',
      'stylesheet arrival delays paint',
      'flash of unstyled content prevention',
      'why the page looks blank on load',
      'link rel stylesheet render blocking',
    ],
  },

  briefing: {
    observable: [
      'A document panel on the left reveals its five lines one at a time — a stylesheet link first, then four paragraphs — each appearing the instant the parser reads it.',
      'The panel on the right, labeled Screen, stays completely empty through every one of those five lines, including the last one, which the caption marks as the moment the DOM is complete.',
      'A running clock in the corner keeps advancing after that last line is read, and a label below the panels switches from counting how long the screen has been blocked so far to how long it was blocked in total.',
      "The stylesheet's arrival is announced on its own, separately from any document line, once its download finishes.",
      "Only at that arrival does the right panel's border flash and its four lines of text appear all at once — a heading and three paragraphs — none of them fading in one by one.",
      'The closing caption states the exact number of milliseconds the screen sat blank between the DOM completing and that first paint.',
    ],

    screen: {
      affordances: [
        'A Replay button and a timeline scrub strip are the only controls; the document, its one stylesheet, and its download time are fixed, so scrubbing is how the reader holds the gap between DOM-complete and first paint still.',
      ],
    },

    useWhen: [
      'The article claims that once the browser has read the whole page, the reader sees it. This piece is the counterexample: DOM complete is announced, the clock keeps running, and the screen stays empty until a separate resource arrives.',
      'The reader needs "render-blocking CSS" to mean something more specific than "CSS is slow" — the stylesheet never stops the parser from reading the rest of the document, it only stops the screen from showing what was read.',
    ],

    avoidWhen: [
      'The article is about a script tag stopping the parser itself. Here the parser reads straight through to the last line without ever pausing; only the paint is held back.',
      'The point is sorting several head resources into which ones block paint and which do not, or distinguishing a screen stylesheet from a print one. This piece has exactly one stylesheet and it always blocks.',
      'The claim concerns a font arriving late and the text repainting in new letterforms. Here there is no font at all — the delay is a stylesheet, and the paint happens exactly once.',
    ],

    contrastWith: [
      {
        concept: 'whatFirstPaintNeeds',
        note: 'This holds one always-blocking stylesheet fixed and shows the DOM-complete-then-blank-then-paint sequence it causes; that varies four head resources at once and works out, resource by resource, which ones share that blocking power and which never do.',
      },
      {
        concept: 'fontSwap',
        note: 'This shows a paint held entirely still until the stylesheet arrives, then everything appearing together; that shows a paint that happens without waiting for a font, followed by a second, partial repaint once the font arrives later.',
      },
      {
        concept: 'criticalPath',
        note: "That keeps a stylesheet's own arrival simple and instead varies a script attribute and a font preload around it; this isolates the stylesheet's blocking power on its own, with no script and no font in the document at all.",
      },
    ],
  },
};
