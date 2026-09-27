/**
 * gradientSteepest 개념 선언.
 *
 * canonical facet 은 `facet:gradientSteepest` — f(x, y) = x² + xy 의 점 (3, −2) 에 서서 재는 방향을 0° 에서 30° 씩
 * 한 바퀴 돌린다. 기울기가 4.00 → 4.96 → … 로 오르내리고, 끝에 ∇f = (4, 3) 이 36.9° 쪽에 서며 그 방향의 기울기 5.00 이
 * 잰 열둘 모두보다 크다. 점은 움직이지 않는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `gradient` 는 점과 방향을 손잡이로 돌려 방향 기울기와 |∇f| 의 관계 전체(코사인 · 넘지 못함 · 축 방향 = 편미분)를 견준다.
 * 이쪽은 그중 한 장면 — **한 바퀴 돌려 보면 가장 가파른 쪽이 표본 사이에 있고, ∇f 가 정확히 그쪽을 가리킨다** — 하나다.
 * 그래서 definition 은 full circle · rises and falls · uphill / downhill · steepest ascent · points exactly 를 쥐고,
 * cosine · 붙든다 · 학습률 · 걸음 같은 말을 넣지 않는다.
 *
 * 전제 (설명 글 `gradientSteepest.md` 가 밝힌 것):
 *  - 함수 · 점 · 재는 방향 열둘은 예로 정한 값이다. 기울기는 δ = 0.001 가운데 차분으로 재고 ∇f 로 셈하지 않는다.
 *  - 한 사례다. 일반으로는 그 점에서 미분 가능한 함수에서 성립하고, ∇f 가 영벡터인 점에서는 가장 가파른 쪽이 따로 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const gradientSteepestConcept: FacetConceptSource = {
  id: 'gradientSteepest',
  label: 'Gradient Points the Steepest Way Up',
  canonicalFacet: 'facet:gradientSteepest',

  surface: {
    definition:
      'Turning the measuring direction a full circle around one point, the slope rises and falls between uphill and downhill, and the steepest ascent lies exactly where the gradient vector points.',
    exemplarKeywords: [
      'gradient points in the direction of steepest ascent',
      'direction of steepest increase',
      'steepest descent is the opposite direction',
      'gradient vector',
      'uphill and downhill directions',
      'slope in every direction',
      'level direction perpendicular to the gradient',
      'why the gradient is the steepest direction',
      'magnitude of the gradient is the maximum slope',
    ],
  },

  briefing: {
    observable: [
      'The point (3, −2) on f(x, y) = x² + xy is fixed, "At (3, −2), f = 3.00". It never moves; only the measuring direction turns, 30° at a time from 0°, angles counted counter-clockwise from +x.',
      'Each step measures one direction and names it: "Direction 0°: uphill, slope 4.00", then 30° 4.96, 60° 4.60, 90° 3.00, 120° 0.60; from 150° it reads downhill, −1.96, down to 210° −4.96; 330° is uphill again at 1.96.',
      'On a disc at the left each measured direction grows a spoke as long as its slope, solid for uphill and dashed for downhill. A strip at the right lays the same twelve values out in order of direction.',
      'The last step adds the arrow built from the two partial derivatives: "∇f = (4.00, 3.00), direction 36.9°, length 5.00", then "Slope toward ∇f: 5.00. Directions measured: 12, largest 4.96 at 30°". On the disc ∂f/∂x = 4.00 matches the 0° spoke and ∂f/∂y = 3.00 matches the 90° spoke. Fourteen steps in all, counting the opening.',
      'The steepest direction lies between the sampled ones, so every sampled slope stays below 5.00. Slopes are measured by a central difference (δ = 0.001), not computed from ∇f. The function, point and directions are chosen examples; the property holds for differentiable functions and fails to pick a direction where ∇f is zero. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays its fourteen steps by itself and stops once ∇f and its slope are shown.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging the strip through the twelve directions sweeps the spoke around the disc, uphill turning downhill and back.',
        'The function, the point and the twelve directions are fixed, so every slope and angle can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article claims the gradient points up the steepest slope and wants the reader to check it by brute force: measure every direction around one point and find that the arrow beats them all.',
      'A reader thinks the steepest direction must be one of the axes, and the article needs a case where it sits at 36.9°, between the sampled directions.',
    ],

    avoidWhen: [
      'The article is about moving the point downhill, learning rates or iterative optimisation. The point stays where it is.',
      'The subject is how partial derivatives are defined by holding one input still. The partials appear only as the arrow\'s two components.',
      'The reader should choose the point or the direction. The run is fixed.',
    ],

    contrastWith: [
      {
        concept: 'gradient',
        note: 'That the gradient marks the steepest way up is one consequence; the general relation gives the slope in every direction as |∇f| times the cosine of the angle, including zero at right angles and the partials along the axes.',
      },
      {
        concept: 'partialSlice',
        note: 'Partial derivatives are slopes along the two axes with the other input frozen; the steepest-direction claim is about what those two numbers point to once they are combined into one vector.',
      },
      {
        concept: 'gradientStep',
        note: 'Knowing which way is steepest says nothing yet about moving; a descent step turns that direction around and chooses a length before the point goes anywhere.',
      },
    ],
  },
};
