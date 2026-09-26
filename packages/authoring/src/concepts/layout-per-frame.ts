/**
 * layoutPerFrame 개념 선언.
 *
 * canonical facet 은 `facet:layoutPerFrame` — 조각이다. 상자 하나가 `left` 값만
 * 바뀌며 다섯 장을 옮겨 간다. 손잡이는 없다 — 이 조각이 말하는 것은 딱 하나,
 * **자리를 바꾸는 CSS 선언은 장마다 레이아웃을 다시 돌리고, 그 레이아웃은 자리뿐
 * 아니라 크기까지 다시 잰다**는 것이다. 이 조각에서 상자의 너비는 한 번도 바뀌지
 * 않는데도 매 장 너비 값이 다시 셈해진 값으로 새로 적힌다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 짝인 `moveWithoutRepaint` 는 같은 상자가 같은 방식(장마다 값 하나만 바뀌는 CSS
 * 선언 한 줄)으로 움직이지만 정반대 결과를 보인다 — 그쪽은 style·layout·paint 가
 * 전혀 돌지 않고 합성만 오른다. 이 조각의 definition 은 "레이아웃이 다시 돈다" 는
 * 쪽에, `moveWithoutRepaint` 의 definition 은 "돌지 않는다" 는 쪽에 무게를 실어
 * 두 문장이 서로 반대말이 되게 했다. `frameBudget` 은 이 사실에 손잡이(속성 선택 ·
 * 상자 수)를 얹어 예산 소비량으로 되돌리므로, 여기서는 fps·예산 어휘를 쓰지 않았다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const layoutPerFrameConcept: FacetConceptSource = {
  id: 'layoutPerFrame',
  label: 'Layout Per Frame',
  canonicalFacet: 'facet:layoutPerFrame',

  surface: {
    definition:
      'Changing a geometric CSS declaration such as left forces the browser to re-run style, layout, paint and composite on every single frame, and the layout pass re-measures both the position and the size of the affected box even when the size never actually changes.',
    exemplarKeywords: [
      'left triggers layout',
      'geometric property forces reflow',
      'position and size recomputed every frame',
      'CSS left animation performance',
      'layout invalidation on every frame',
      'style layout paint composite order',
      'why left is slower than transform',
      'reflow on every animation frame',
      'unnecessary re-measurement',
    ],
  },

  briefing: {
    observable: [
      'The literal CSS declaration `left: {x}px;` sits at the top of the screen and its numeral is the only part that changes from frame to frame.',
      'Before the animation starts, a caption reads that nothing has been measured or painted yet; once frames begin, each one\'s caption states plainly that layout re-measures position and width, then paint runs.',
      'The moving box carries a position label and, below it, a bracketed width label that both update every frame — the width label\'s number stays identical across all five frames, but its bracket still flashes on each one to mark that it was re-measured, not skipped.',
      'Four labeled chips — Style, Layout, Paint, Composite — light up one after another in that order on every frame, and all four of their running counts climb together; none of them stays at zero while the others rise.',
    ],

    screen: {
      affordances: [
        'The screen plays five frames of the same box sliding by a fixed 20px step, then stops on the last one.',
        'A replay control and a step strip let a reader hold any single frame still, including the moment layout\'s highlight is lit.',
        'The starting declaration, the step size and the frame count are fixed, so an article can name the exact `left` value shown at any frame.',
      ],
    },

    useWhen: [
      'The article claims that geometric properties are expensive to animate and the reader needs to see the width bracket flash on every single frame even though its printed number never moves — proof that "re-measured" is not the same as "changed".',
      'The reader needs an unbroken chain from a plain CSS line to four rising counters, so that "style, then layout, then paint, then composite runs every frame" reads as an observed sequence rather than an assertion.',
    ],

    avoidWhen: [
      'The article is about a script reading a measured value back from the page inside a loop of writes and reads. No script runs here at all — the layout pass is driven purely by the animation restating the same CSS declaration each frame.',
      'The point is the deadline math of a single frame\'s stages against a fixed millisecond budget. This screen counts how many times each stage has run in total; it does not show a clock crossing a budget line partway through one of them.',
      'The subject is comparing this cost against a property that skips layout and paint entirely, or against a range of box counts. This screen fixes one box, one property and five frames throughout.',
      'The article means "layout" as page structure or CSS layout modes (flex, grid). Here layout names the browser\'s geometry-recomputation pass that runs after style and before paint.',
    ],

    contrastWith: [
      {
        concept: 'moveWithoutRepaint',
        note: 'Here layout and paint run on every frame and their counters climb in step with composite; there the same kind of single-line CSS change drives only compositing, and layout and paint stay pinned at their starting counts the whole time.',
      },
      {
        concept: 'frameBudget',
        note: 'This isolates one fixed case — `left`, one box, five frames — with no dial to turn; that screen puts the choice of property and the element count behind controls and reports the frame-rate consequence of whichever combination is picked.',
      },
    ],
  },
};
