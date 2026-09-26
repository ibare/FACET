/**
 * repaintCost 개념 선언.
 *
 * canonical facet 은 `facet:repaintCost` — 완제품이다. 문서 흐름 위의 페이지
 * (header·intro·card·list·footer, card 의 자식 card-title·card-text) 에 절대
 * 위치 badge 가 겹쳐 있다. 손잡이 둘 — `property`(display/height/color/
 * transform) 와 `cardLayer`(page 와 함께/제 장에 떼어 둠) — 을 돌리면 한 판이
 * style→[layout]→[paint 하나씩]→composite 순서로 재생하며, 어느 단계가 실제로
 * 켜지는지 표시등으로 보인다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 완제품이 홀로 맡는 것은 **결정** 이다 — 바뀌는 속성이 무엇이냐에 따라
 * 파이프라인이 얼마나 짧아지는가(공짜인 단계와 반드시 도는 단계의 갈림),
 * 그리고 층을 떼어 두면 그 갈림이 한 번 더 짧아지는가. definition 의 주어는
 * "속성"과 "파이프라인 사슬"이고, 손잡이가 둘이며 네 속성을 오간다는 점이
 * 조각 둘과 다르다.
 *
 * 조각 `stackOfSheets`는 이 판정에 쓰이는 장치 자체 — 층마다 제 장에 칠하고
 * 합성은 장을 포갤 뿐이라는 것 — 를 데이터 하나로 고정해 보여준다(손잡이
 * 없음, 파이프라인 갈래 없음). 조각 `layerPromotion`은 이 완제품의 `cardLayer`
 * 손잡이 하나만 떼어 "같은 만큼 옮겨도 제 장이면 다시 칠하지 않는다"는 단일
 * 대비만 보인다(속성은 옮김 하나로 고정, 파이프라인 표시등 없음). 그래서 이
 * definition 에는 "여러 속성 중 어느 것" 이라는 결정 어휘를 넣고, exemplarKeywords
 * 에는 파이프라인 단계 이름(style/layout/paint/composite)과 "다시 칠할 사각형이
 * 아예 생기지 않는다"는 말을 조각들보다 더 짙게 담았다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const repaintCostConcept: FacetConceptSource = {
  id: 'repaintCost',
  label: 'Repaint Cost (Which Property Reruns the Pipeline)',
  canonicalFacet: 'facet:repaintCost',

  surface: {
    definition:
      'Which CSS property changes on an element decides how far the rendering pipeline reruns — a property that affects layout forces style, layout and paint; a paint-only property skips layout; and a compositor-only property can skip paint entirely when the element already owns its own layer.',
    exemplarKeywords: [
      'repaint',
      'reflow',
      'rendering pipeline',
      'style layout paint composite',
      'which CSS properties trigger layout',
      'cheap vs expensive CSS property to animate',
      'compositor-only property',
      'will-change: transform',
      'skip the paint stage',
      'render tree change',
      'why animating width is slow but transform is fast',
      'dirty rectangle',
    ],
  },

  briefing: {
    observable: [
      'Four stage lights sit above the page — style, layout, paint, composite — and only the ones this round actually runs turn on; a shorter chain leaves the later lights dark.',
      'Changing the property handle visibly changes what moves: display shrinks the card to nothing and slides list and footer up to close the gap; height grows the card and slides them down; color leaves every box exactly where it is; transform slides the card sideways without touching anyone else.',
      'Elements that get repainted flash red one at a time, in on-screen top-to-bottom order, and only elements whose final box overlaps the dirty region ever flash.',
      'A dashed outline appears around the card whenever the layer handle is set to its own layer, and the closing caption says outright whether the card just painted together with the page or sits on its own compositing layer.',
      'The closing caption reports the pipeline chain itself (e.g. style→layout→paint→composite), how many boxes were remeasured, how many elements were repainted and which ones, and the current layer count.',
    ],

    screen: {
      affordances: [
        'A segmented slider picks the property to change: display, height, color or transform.',
        'A second segmented slider picks whether the card paints together with the page or is given its own layer (will-change: transform).',
        'Playback controls replay the current round; moving either slider restarts the round with the new combination.',
        'A code panel beside the stage highlights the paint phase of the algorithm while a round runs.',
      ],
    },

    useWhen: [
      'The article claims that some CSS properties are "expensive" and others "cheap" to animate, and the reader needs to see that the difference is which pipeline stages actually rerun, not a vague notion of cost — display and height force layout, color skips straight to paint, and transform can skip paint too.',
      'The reader has been told that giving an element its own layer helps performance, and has to see the mechanism: the same transform change that would otherwise dirty and repaint the page produces no repaint at all once the element already has its own compositing surface.',
    ],

    avoidWhen: [
      'The point is how compositing itself works — that painting happens per layer onto separate surfaces and compositing only stacks already-painted surfaces. This screen assumes that machinery and only varies which stage a property reaches.',
      'The subject is layout algorithms themselves (box model, flex, grid) rather than when layout reruns at all.',
      'The article is about JavaScript execution blocking the main thread. Nothing here measures script cost — every stage shown is rendering work.',
      'The reader needs a general inventory of which of the hundreds of CSS properties fall into which category. Only four properties are modeled here, chosen to each land in a different stage.',
    ],

    contrastWith: [
      {
        concept: 'stackOfSheets',
        note: 'This is the decision — which property forces which stages to rerun; that is the machinery those stages rest on — painting per layer onto separate sheets and stacking them in compositing — held fixed with no property choice at all.',
      },
      {
        concept: 'layerPromotion',
        note: 'This varies four properties and shows the whole style→layout→paint→composite chain shortening; that isolates one of them (a move) and one axis (own layer or not) to show the paint stage being skipped entirely, without the rest of the pipeline on screen.',
      },
    ],
  },
};
