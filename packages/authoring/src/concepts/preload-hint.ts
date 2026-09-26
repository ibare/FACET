/**
 * preloadHint 개념 선언.
 *
 * canonical facet 은 `facet:preloadHint` — 조각. CSS 규칙 안에서만 불리는 그림
 * (`hero.jpg`)에 `<link rel="preload">` 힌트를 달면, 그 그림을 실제로 불러오는
 * 스타일시트가 도착하기도 전에 이미 요청이 나가 있다는 것 하나만 보인다.
 *
 * ── 묶음 안에서 어떻게 갈랐나 (fontSwap 과)
 *
 * 둘 다 "본디 늦게 불리는 자원을 preload 로 당긴다" 는 소재를 공유하지만, 이
 * 조각은 힌트를 **건 경우만** 보이고 fontSwap 은 힌트를 **걸지 않은 경우**만
 * 보인다 — 방향이 반대다.
 *
 *   이 개념   힌트가 자원 요청을 CSS 가 발견하기 한참 전으로 당긴다는 것. 그림은
 *             화면이 그 자리를 찾기 전에 이미 상당량 받아져 있다.
 *   fontSwap  힌트 없이 첫 스타일 계산에서야 글꼴을 요청해, 화면이 대체 글꼴로
 *             먼저 그려지고 나중에 다시 놓인다는 것.
 *
 * 어휘 배타 — 이쪽은 lead · discovered late · already in flight 를 쓰고, 저쪽의
 * fallback · swap · repaint · reflow 를 쓰지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const preloadHintConcept: FacetConceptSource = {
  id: 'preloadHint',
  label: 'Preload Hint (Requesting a CSS-Only Resource Early)',
  canonicalFacet: 'facet:preloadHint',

  surface: {
    definition:
      "A `<link rel=preload>` hint for a resource that a stylesheet only references through a CSS `url()` sends that resource's request as soon as the hint line is parsed, long before the referencing stylesheet is fetched or its rule is ever read.",
    exemplarKeywords: [
      'preload hint',
      'link rel=preload',
      'CSS url() discovered late',
      'background image requested late',
      'preloading a background image',
      'resource discovery order',
      'moving a request earlier than usual',
      'preload versus default discovery',
      'render-blocking CSS references a late resource',
    ],
  },

  briefing: {
    observable: [
      'A document panel shows four lines — a preload line, a stylesheet line, an empty hero div, and a paragraph — each highlighted as the parser reads it, and a CSS rule sits beside them naming the hero div and the image it references.',
      "The preload line's read sends off a request for hero.jpg immediately, while the stylesheet line's own request departs one line later — both visible as bars starting to grow in a timeline below.",
      "The hero.jpg bar is already partway grown by the time the stylesheet's bar finishes and its rule is read for the first time; a caption states the exact percentage of hero.jpg already received at that moment.",
      'First paint fires with the hero area still an empty box, since the image itself has not fully arrived even though its request departed far earlier than the rule that needed it.',
      "When hero.jpg does arrive, its bar completes and the empty box fills in place, and the caption states how many milliseconds earlier its request had departed than the moment the page's own rule needed it.",
    ],

    screen: {
      affordances: [
        'A Replay button and a timeline scrub strip are the only controls; the document, its CSS rule, and both resource durations are fixed, so scrubbing is how the reader compares the preload line\'s early request against the stylesheet\'s later one.',
      ],
    },

    useWhen: [
      "The article claims a preload hint just makes a resource arrive faster. What it actually changes is when the request departs — the image's own download speed never changes, only how much of a head start it gets before the CSS that calls it is even read.",
      'The reader assumes a background image referenced only inside CSS cannot be requested until that CSS arrives and its rule is read. The preload line here sends that same request first, without waiting on the stylesheet at all.',
    ],

    avoidWhen: [
      'The article is about a font arriving late and the visible text repainting once it lands. This piece never repaints anything — the hero box either stays empty or fills once, and the words on the page never move.',
      'The point is sorting several head resources into which ones block first paint and which do not. This piece has exactly one preloaded resource and one stylesheet, and neither of the timing questions here is about blocking.',
      'The subject is a script waiting to run, or a script freezing the parser. There is no script in this document at all.',
    ],

    contrastWith: [
      {
        concept: 'fontSwap',
        note: 'This moves a request earlier through an explicit hint, so that by the time the resource is needed it has already substantially arrived; that shows the opposite — no hint at all, a real gap opening after first paint, and a visible repaint once the resource finally lands.',
      },
      {
        concept: 'criticalPath',
        note: "This applies a preload hint to a CSS-only background image that the page's markup never mentions directly; that applies the same kind of hint to the page's own web font and lets the reader watch whether it prevents the swap this piece never has to test.",
      },
      {
        concept: 'whatFirstPaintNeeds',
        note: 'This moves one resource’s request earlier through an explicit hint and follows what that resource does before and after it is needed; that only sorts resources already declared in the head into blocking and non-blocking, without changing when any of them is requested.',
      },
    ],
  },
};
