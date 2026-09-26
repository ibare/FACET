/**
 * frameBudget 개념 선언.
 *
 * canonical facet 은 `facet:frameBudget` — 완제품이다. 손잡이 둘(움직이는 CSS 속성
 * transform/left, 함께 움직이는 상자 수 2~20)을 바꿔 가며, 한 장을 만드는 몫(ms)이
 * 파이프라인(rAF → style → layout → paint → composite) 다섯 칸 중 어디를 태우는지,
 * 그리고 그 몫이 초당 새 장 수와 한 걸음의 뜀 거리에 어떻게 되돌아오는지를 재생한다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 조각 `layoutPerFrame` 과 `moveWithoutRepaint` 는 각각 `left` 와 `transform` 하나만
 * 고정해, 그 속성이 파이프라인의 어느 칸을 태우는지(혹은 태우지 않는지)를 손잡이 없이
 * 보인다. 이 완제품은 그 두 사실을 하나의 손잡이(속성 선택)로 합치고, 거기에 상자 수라는
 * 두 번째 손잡이를 얹어 **몫이 늘어날 때 결과가 어떻게 갈리는지**를 재생 가능하게 만든다.
 * definition 의 단위는 "속성·상자 수 → 몫(ms) → 초당 새 장 수" 라는 사슬 전체이지,
 * 어느 한 칸의 안쪽 사정이 아니다.
 *
 * 조각 `sixteenMilliseconds` 와 `dropped-frame` 은 몫이 이미 정해진 뒤 그 몫이 예산을
 * 넘겼을 때 무슨 일이 일어나는지(단계 안쪽의 시각표, 화면에 남는 되풀이·건너뜀)를
 * 다룬다. 이 완제품은 몫 자체를 손잡이로 바꿀 수 있게 해, 몫이 무엇에서 비롯하는지를
 * 보이는 대신 그 몫이 예산을 넘겼을 때의 내부 시각표나 건너뛴 자리를 낱낱이 짚지는
 * 않는다 — 계기는 누적 새 장 수 · 초당 장 수 둘뿐이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const frameBudgetConcept: FacetConceptSource = {
  id: 'frameBudget',
  label: 'Frame Budget and Compositing',
  canonicalFacet: 'facet:frameBudget',

  surface: {
    definition:
      'Choosing which CSS property moves a box and how many boxes share that property sets how many milliseconds one frame costs across the rendering pipeline stages, and that cost determines how many new frames actually appear each second and how far the visible position jumps between the ones that do.',
    exemplarKeywords: [
      'transform vs left performance',
      'frame budget under load',
      'rendering pipeline stages',
      'rAF style layout paint composite',
      'frames per second dropping with element count',
      'animating many elements at once',
      'CSS property cost comparison',
      'composite-only vs layout-triggering animation',
      'why more boxes slow the animation down',
      'jank from too many animated elements',
    ],
  },

  briefing: {
    observable: [
      'A stack of boxes shares one position and moves together; a segmented control swaps which literal CSS declaration drives it — `left: {x}px;` or `transform: translateX({x}px);` — and a second control sets how many boxes are in the stack, from 2 up to 20.',
      'A row of five cells reading rAF, Style, Layout, Paint, Composite lights up in sequence only on beats where a new frame actually lands; under `left` the Layout and Paint cells stay lit longer as box count rises, while under `transform` those two cells never light at all.',
      'A frames-per-second bar and a running new-frames count both accumulate as playback proceeds, so a heavier combination of property and box count visibly settles at a lower bar than a lighter one.',
      'The literal CSS line at the foot of the stage keeps swapping in the position value each beat that produces a new frame, in whichever of the two declaration forms is currently selected.',
      'A caption line reports the beat number, the box stack\'s current position in pixels, and the fixed cost in milliseconds that this round\'s property-and-count combination charges per frame.',
    ],

    screen: {
      affordances: [
        'Standard playback (play, pause, step, replay, speed) drives one round at a time.',
        'A Property control switches between transform and left; a Box count control sets 2, 4, 7, 8, 12, 16 or 20 boxes, each restarting the round with its counters back at zero.',
        'A code panel beneath the stage shows the imperative code that reads the frame cost, checks whether this beat is the one a frame lands on, and updates the position — highlighted line by line as the round plays.',
      ],
    },

    useWhen: [
      'The article wants to show, in one screen, that the same visual motion can cost radically different amounts of frame budget depending on which property drives it and how many elements share it, and that the reader should watch the pipeline row and the fps bar move together rather than take the cost on faith.',
      'The reader needs to compare `transform` and `left` directly under a rising box count and see the fps bar hold steady for one and sink for the other, rather than reading two separate fixed numbers and inferring the comparison themselves.',
      'The point is that a slower rendering path does not just take longer per frame — it produces visibly fewer new frames per second and a longer jump between the ones that land.',
    ],

    avoidWhen: [
      'The article only needs to isolate what happens inside a single geometry-changing declaration, with no controls and no frame-rate consequence to report — that is a narrower claim than this screen makes.',
      'The article is walking through the internal millisecond ledger of one frame\'s stages against a fixed deadline. This screen reports a cost per frame as a settled number; it does not show a running clock crossing a budget line mid-stage.',
      'The subject is the beat-by-beat register of exactly which screen position got skipped and by how much a stale frame repeated. This screen\'s counters are cumulative totals, not a per-beat account of repeats and gaps.',
      'The article is about JavaScript reading layout geometry inside a loop of writes and reads. No script here ever reads a measured value back; the cost comes from the CSS declaration and box count alone.',
    ],

    contrastWith: [
      {
        concept: 'layoutPerFrame',
        note: 'This lets the property and the element count vary and reports the resulting frame rate; layoutPerFrame fixes the property at `left` and a single box, with no controls, to isolate one fact — that layout re-measures position and size every frame regardless of load.',
      },
      {
        concept: 'moveWithoutRepaint',
        note: 'This treats `transform` as one of two selectable costs among several box counts; moveWithoutRepaint fixes it as the only property, with paint and layout counters pinned at their starting values throughout, to isolate that a composite-only path never touches either stage.',
      },
      {
        concept: 'sixteenMilliseconds',
        note: 'This reports frame cost as a settled number per combination of property and box count; sixteenMilliseconds opens the inside of one frame\'s stage-by-stage millisecond accounting to show exactly where a fixed budget gets crossed.',
      },
      {
        concept: 'droppedFrame',
        note: 'This summarizes many beats into two running counters, new frames and frames per second; droppedFrame walks a fixed seven-frame run beat by beat, naming which screen position repeated and which one was never drawn at all.',
      },
    ],
  },
};
