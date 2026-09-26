/**
 * fontSwap 개념 선언.
 *
 * canonical facet 은 `facet:fontSwap` — 조각. `font-display: swap` 을 건 웹 글꼴
 * (brand.woff2)이 스타일시트보다 늦게 도착하는 문서 하나에서, 글은 대체 글꼴로
 * 먼저 그려지고 글꼴이 도착하면 그 넓은 폭으로 다시 놓인다는 것 하나만 보인다.
 *
 * ── 묶음 안에서 어떻게 갈랐나 (preloadHint 와)
 *
 * preload-hint.ts 상단 주석 참조 — 저쪽은 힌트를 건 경우, 이쪽은 힌트 없이 첫
 * 스타일 계산에서야 요청이 나가는 보통의 경우다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const fontSwapConcept: FacetConceptSource = {
  id: 'fontSwap',
  label: 'Font Swap (Fallback First, Then the Web Font\'s Letterforms)',
  canonicalFacet: 'facet:fontSwap',

  surface: {
    definition:
      "With `font-display: swap`, a paragraph paints immediately in a fallback typeface and is laid out again in the web font's own letterforms once that font file finishes downloading, sometimes moving words down to a new line.",
    exemplarKeywords: [
      'font-display swap',
      'flash of unstyled text',
      'FOUT',
      'fallback font then web font',
      'web font arrives late',
      'font swap period',
      'text reflows after font loads',
      'layout shift from a font swap',
      'webfont loading strategy',
      '@font-face font-display',
    ],
  },

  briefing: {
    observable: [
      'A short paragraph of nine words sits inside a box, blank until the stylesheet line and paragraph line above it are marked as read.',
      'The first time the words appear, they are set in a narrower typeface and wrap across a certain number of lines — the caption names that line count and the stylesheet file that just arrived.',
      'A separate caption then reports that the font itself was requested, at the very moment the paragraph first needed it, distinct from the stylesheet that was already done.',
      'A later caption reports the font file arriving, one step before anything on screen changes — arrival and redraw are shown as two different moments, not one.',
      'Only on the redraw does every word shift position at once into a wider typeface, and the caption states the new line count together with how many words moved down onto a following line.',
    ],

    screen: {
      affordances: [
        'A Replay button and a timeline scrub strip are the only controls; the paragraph, its nine words, and both file arrival times are fixed, so scrubbing steps through blank, fallback paint, font request, font arrival, and redraw in order.',
      ],
    },

    useWhen: [
      'The article claims `font-display: swap` "shows the web font." What it actually shows first is a different typeface entirely, and the swap is a second, later event with its own visible layout change, not a detail of the first paint.',
      'The reader needs to see why a late web font can move text around after the page already looked settled — words changing typeface width is what pushes some of them onto a new line.',
    ],

    avoidWhen: [
      'The article is about a stylesheet itself blocking paint until it arrives. Here the stylesheet is not what is late — the font is, and the paragraph paints before the font ever arrives.',
      'The point is that a hint moves a request earlier than it would otherwise depart. This piece uses the plain, unhinted timing where the font is only requested once the paragraph first needs it.',
      'The subject is a script waiting to execute or a parser stopped in place. There is no script anywhere in this document.',
    ],

    contrastWith: [
      {
        concept: 'preloadHint',
        note: 'This shows the plain, unhinted case — the font is requested only once the first style calculation needs it, a real gap opens, and the paragraph visibly redraws later; that shows a hint moving a different resource\'s request so early that by the time it is needed the wait has already mostly happened.',
      },
      {
        concept: 'styleBlocksPaint',
        note: "This shows a paint that happens without waiting for the font, followed by a second, partial repaint once the font arrives later; that shows a paint held entirely still until a stylesheet arrives, with everything then appearing together in one paint, not two.",
      },
      {
        concept: 'criticalPath',
        note: "This always shows a visible swap from fallback to web font; that lets the reader turn on a font preload hint for the same document and watch the same swap become invisible because the font already arrived before first paint.",
      },
    ],
  },
};
