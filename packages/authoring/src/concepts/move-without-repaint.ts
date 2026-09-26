/**
 * moveWithoutRepaint 개념 선언.
 *
 * canonical facet 은 `facet:moveWithoutRepaint` — 조각이다. 상자 하나가 애니메이션이
 * 시작되기 전에 이미 한 번 칠해져 따로 둔 장(painted layer)에 있고, 그 뒤 여섯 장
 * 동안 `transform: translateX(...)` 선언 한 줄만 바뀐다. 칠한 횟수는 1 에서, 레이아웃
 * 횟수는 0 에서 애니메이션 내내 그대로고, 오직 합성 횟수만 장마다 하나씩 오른다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 짝인 `layoutPerFrame` 과 거울처럼 마주 본다 — 같은 방식(값 하나만 바뀌는 CSS 선언
 * 한 줄)으로 상자를 움직이지만, 그쪽은 매 장 레이아웃·페인트가 돌고 이쪽은 아예 돌지
 * 않는다. definition 의 동사를 "다시 잰다" 대신 "그대로 둔다/건너뛴다" 쪽에 두어 두
 * 문장이 서로 반대말이 되게 했다. `frameBudget` 은 이 사실(속성이 파이프라인 칸을
 * 태우는지 여부)에 손잡이를 얹어 상자 수·fps 로 되돌리므로, 여기서는 그 어휘 대신
 * "이미 칠해 둔 장" · "고정된 세 수 중 둘은 움직이지 않는다" 는 구체적 관찰에 무게를
 * 두었다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const moveWithoutRepaintConcept: FacetConceptSource = {
  id: 'moveWithoutRepaint',
  label: 'Move Without Repaint',
  canonicalFacet: 'facet:moveWithoutRepaint',

  surface: {
    definition:
      'An element is painted once into its own layer before an animation starts, and changing only its transform declaration on each following frame slides that already-painted layer to a new position and recomposites it, without the browser re-running layout or paint at all.',
    exemplarKeywords: [
      'transform translateX animation',
      'composite-only animation',
      'GPU layer reuse',
      'skip layout and paint',
      'paint count stays flat',
      'cheap way to animate an element',
      'composited animation performance',
      'transform is compositor-only',
      'why transform is fast',
    ],
  },

  briefing: {
    observable: [
      'Before any frame plays, a caption states that the box is already painted once, naming the paint count directly as 1.',
      'The literal CSS declaration `transform: translateX({x}px);` sits at the top and only its numeral changes across six frames, sliding by a fixed 25px each time.',
      'Three counters are shown side by side; across all six frames the paint count and the layout count never move from their starting values, while the composite count climbs by exactly one on every frame, ending at six.',
      'Each frame\'s caption names the composite count reached so far alongside the pixel position the box slides to, tying the one counter that changes to the one thing visibly moving.',
    ],

    screen: {
      affordances: [
        'The screen plays six frames of the same box sliding by a fixed step, then stops on the last one.',
        'A replay control and a step strip let a reader hold any single frame still, including the starting one where the box is already painted but has not yet moved.',
        'The declaration template, the step size and the frame count are fixed, so an article can name the exact transform value and composite count at any frame.',
      ],
    },

    useWhen: [
      'The article claims a property is cheap to animate because it skips layout and paint, and the reader needs to watch two counters sit motionless for six straight frames while a third climbs — numbers standing in for an assertion.',
      'The reader needs to see the same six-frame, one-line-of-CSS shape as a comparison case, so that the only thing distinguishing it from a costly version of the same motion is which property changed and which stages that leaves dark.',
    ],

    avoidWhen: [
      'The article is about the moment a browser first decides to give an element its own layer. This screen starts after that decision has already been made, with the layer already painted at the first frame shown.',
      'The subject is what happens to other elements the moving box passes over. This screen tracks only the moving box\'s own paint, layout and composite counts.',
      'The point is the deadline math of a single frame\'s stages against a fixed millisecond budget, or the beat-by-beat register of repeats and skipped positions across an uneven run. Every frame here lands on schedule with an identical, fixed cost.',
      'The article is about comparing this cost against a range of element counts or against the property that does force layout. This screen fixes one box, one property and six frames throughout.',
    ],

    contrastWith: [
      {
        concept: 'layoutPerFrame',
        note: 'Here paint and layout counters are pinned at their starting values while only composite climbs; there the same kind of single-line CSS change drives style, layout and paint every frame, and all four counters climb together.',
      },
      {
        concept: 'frameBudget',
        note: 'This fixes transform as the only property against one box over six frames with no dial to turn; that screen lets transform compete against a layout-triggering property across a range of box counts and reports the frame-rate each combination produces.',
      },
    ],
  },
};
