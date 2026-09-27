/**
 * determinantArea 개념 선언.
 *
 * canonical facet 은 `facet:determinantArea` — 행렬 A = [2 1 ; −1 1] 로 넓이 1 인 삼각형과 넓이 3 인 ㄴ자 도형을
 * 차례로 옮긴다. 넓이가 1 → 3, 3 → 9 로 둘 다 3 배가 되고, 마지막에 ad − bc = 2·1 − 1·(−1) = 3 이 같은 수로 나온다.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 이웃 `matrixTransform2d` 는 단위 정사각형이 평행사변형이 되는 장면과 |det| 게이지를 가진다 — 이쪽은 단위 정사각형을
 * 쓰지 않고 **모양도 크기도 자리도 다른 두 도형이 같은 배수**라는 것을 쥔다. 형제 `determinantZeroCollapse` 는 det 0 을,
 * 완제품 `matrixOps` 는 det 의 곱을 맡는다. 그래서 definition 은 area · same factor · any shape · ad − bc 를 쥐고,
 * zero · collapse · product of determinants 를 쓰지 않는다.
 *
 * 전제: 행렬 · 도형 둘은 예로 정한 값이다. 도형 둘로 「어떤 도형이든」을 증명하지 않는다 — 일반은 설명 글이 밝힌다.
 * 이 화면은 행렬식이 양수인 경우만 보인다. 넓이는 신발끈 공식으로 정확히 셈한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const determinantAreaConcept: FacetConceptSource = {
  id: 'determinantArea',
  label: 'The Determinant Is the Area Scale Factor',
  canonicalFacet: 'facet:determinantArea',

  surface: {
    definition:
      'The determinant ad − bc of a 2×2 matrix is the factor by which it multiplies area: shapes of any size, form or position all grow by that same multiple.',
    exemplarKeywords: [
      'determinant as area scale factor',
      'geometric meaning of the determinant',
      'ad − bc',
      'how a linear map changes area',
      'area of a transformed shape',
      'shoelace formula',
      'Jacobian determinant intuition',
      'why the determinant measures area',
    ],
  },

  briefing: {
    observable: [
      'Two shapes stand on the plane beside A = [2 1 ; −1 1]: a Triangle with corners (0, 1), (2, 1), (1, 2) and area 1, and an L-shape with six corners from (−2, −2) to (−2, 0) and area 3. An Area panel lists both. The caption reads "Before moving — areas 1 · 3".',
      'The triangle is moved by A to (1, 1), (5, −1), (4, 1): "Triangle: area 1 → 3 · ×3". Its area bar grows and is notched once per original area, so the three copies can be counted.',
      'The L-shape is moved to (−6, 0), (−2, −2), (−1, −1), (−3, 0), (−2, 1), (−4, 2): "L-shape: area 3 → 9 · ×3". Different size, different form, different place, same multiple.',
      'The four entries of A fly into the formula "ad − bc = 2 · 1 − 1 · (−1) = 3", and the caption closes with "Shapes whose multiple equals ad − bc: 2 / 2".',
      'The matrix and the two shapes are chosen examples; two shapes illustrate that the multiple does not depend on the shape but do not prove it. Only a positive determinant is shown, so orientation never flips. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays four steps on its own and stops.',
        'A Replay button and a playback strip sit below it. Scrubbing across the two moves puts the ×3 of the small triangle next to the ×3 of the larger L-shape.',
        'The matrix, the corners and the areas are fixed, so an article can quote them exactly.',
      ],
    },

    useWhen: [
      'The article defines the determinant as ad − bc and wants the reader to see what that number measures: how much every area is multiplied by the map.',
      'A reader assumes that the unit square is special and needs to see an odd-shaped figure elsewhere on the plane grow by the same factor.',
    ],

    avoidWhen: [
      'The article is about a negative determinant and orientation reversal. The determinant here is positive and the shapes are not flipped.',
      'The subject is a zero determinant and loss of invertibility. Areas here grow; nothing collapses.',
      'The topic is computing determinants of 3×3 or larger matrices, cofactor expansion or row reduction.',
    ],

    contrastWith: [
      {
        concept: 'determinantZeroCollapse',
        note: 'An area factor of zero is the limit of this claim; its consequence is not about area at all but that different points share a spot and the map cannot be undone.',
      },
      {
        concept: 'matrixTransform2d',
        note: 'The determinant as the signed area of the parallelogram spanned by the columns is a statement about the unit square. As a scale factor it says more: every region, whatever its shape, is scaled by the same number.',
      },
      {
        concept: 'matrixOps',
        note: 'That determinants multiply when maps are chained follows from each one being an area factor; the chaining claim uses that product without looking at areas.',
      },
      {
        concept: 'inverseUndoes',
        note: 'The inverse divides by the determinant, so the area factor of the inverse is its reciprocal; this claim is about the factor itself, not about undoing.',
      },
    ],
  },
};
