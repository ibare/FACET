/**
 * perspectiveShrinksFar 개념 선언.
 *
 * canonical facet 은 `facet:perspectiveShrinksFar` — 카메라 공간(눈이 원점, −z 를 본다)에 높이 2 인 기둥 넷이
 * x = 1.5 에 서 있고 거리 d 는 2 · 4 · 8 · 16. 눈에서 1 떨어진 화면에 가까운 것부터 하나씩 비춘다:
 * x' = x / d, y' = y / d. 화면 높이 1.000 · 0.500 · 0.250 · 0.125 — 높이 × 거리는 넷 모두 2, 이웃 비는 늘 2.
 * 상은 작아지며 눈높이의 소실점으로 모여든다. 걸음 다섯(처음 포함), 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `projection` 은 눈을 옮기며 두 물체의 **비**를 견주고 직교와 맞바꾼다. 이 조각의 주장은 규칙 하나 —
 * "화면 크기는 거리에 반비례한다: 두 배 멀면 절반" 과 소실점이다. 형제 `orthographicKeepsSize` 는 반대 주장(그대로).
 * 그래서 definition 은 divided by distance · half the height · double the distance · vanishing point 를 독점하고,
 * eye distance handle · ratio of two · orthographic · drops z · 잘림 낱말을 쓰지 않는다.
 *
 * 전제: 화면 거리 1(바꾸면 모든 상이 같은 배율로 변할 뿐). 행렬과 w 는 보이지 않고 나눗셈의 결과만 보인다.
 * d ≤ 0 인 점은 투영하지 않는다. 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const perspectiveShrinksFarConcept: FacetConceptSource = {
  id: 'perspectiveShrinksFar',
  label: 'Perspective: Farther Objects Look Smaller',
  canonicalFacet: 'facet:perspectiveShrinksFar',

  surface: {
    definition:
      'In perspective projection a point\'s screen coordinates are its coordinates divided by its distance, so an equal-height object at double the distance appears at half the height and drifts toward a vanishing point.',
    exemplarKeywords: [
      'perspective division',
      'why distant objects look smaller',
      'inverse proportion to distance',
      'pinhole camera model',
      'similar triangles',
      'vanishing point',
      'railway tracks meet at the horizon',
      'foreshortening',
      'x over z',
      'perspective drawing',
    ],
  },

  briefing: {
    observable: [
      'Two panels share one vertical scale: "Side view" on the left, where rays run from each post\'s top and bottom to the Eye and cross the Screen line, and "What the eye sees" on the right, where those crossings become the images.',
      'Setup: "Posts of the same height: 2" and "Screen distance from the eye: 1". Four posts stand at x = 1.5, at distances d 2, 4, 8 and 16 from the eye.',
      'One post is projected per step, nearest first: "Distance 2 → screen x 0.750 · y −0.500 to 0.500 · height 1.000", then height 0.500 at 4, 0.250 at 8, 0.125 at 16.',
      'Each step also reads "Height × distance: 2" and, from the second post on, "previous height ÷ this height: 2".',
      'As the posts get farther, their images not only shrink but move toward the middle of the screen; the tops lie on one straight line from the "Vanishing point" at eye level and the bottoms on another.',
      'The eye sits at the origin looking down −z; points at or behind the eye are not projected. The screen shows the result of the division, not a projection matrix or a w coordinate.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself through five steps — the posts standing with an empty screen, then one projected post per step — and stops. A Replay button and a scrub strip sit below it.',
        'Scrubbing back and forth across the four projection steps shows the height halving each time while the product with distance stays at 2.',
        'The posts and the screen distance are fixed, so every height and ratio can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article states that apparent size is inversely proportional to distance and needs a case where doubling the distance visibly halves the image, with the constant product on display.',
      'A reader wonders why parallel lines seem to meet far away, and the article wants the vanishing point to fall out of the same division by distance.',
    ],

    avoidWhen: [
      'The subject is orthographic projection or choosing between projection types. Only perspective is shown here.',
      'The article is about the projection matrix, clip space or the divide by w. The screen shows the division\'s outcome and none of that machinery.',
      'The topic is field of view or zoom. The screen distance is fixed at 1.',
    ],

    contrastWith: [
      {
        concept: 'orthographicKeepsSize',
        note: 'Perspective divides by distance and so shrinks things that are farther away; orthographic leaves distance out of the screen coordinates, so size does not depend on it at all.',
      },
      {
        concept: 'projection',
        note: 'The inverse-distance rule is about one object at several distances. Comparing two objects at once as the eye moves turns the same rule into a ratio that depends on how their distances compare.',
      },
      {
        concept: 'wDivide',
        note: 'Dividing by w is how the pipeline implements the division by distance. This concept is the geometric law that division produces, independent of how it is encoded in coordinates.',
      },
    ],
  },
};
