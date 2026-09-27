/**
 * scaleStretches 개념 선언.
 *
 * canonical facet 은 `facet:scaleStretches` — 45° 세운 마름모 (0, 1) · (1, 2) · (0, 3) · (−1, 2) 에 배율
 * (1.5, 1) · (2, 1) · (3, 1) · (3, 0.5) 를 차례로, 늘 처음 도형에 곱한다. 위 꼭짓점 각이 90° 에서 161.1° 까지
 * 벌어지고, 가로만 늘이는 동안 y 축 위 두 꼭짓점은 움직이지 않다가 세로를 줄이면 원점 쪽으로 끌려온다.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `scaleRotateTranslate` 는 세 변환의 곱하는 순서를 돌린다. 이쪽은 늘임 하나가 **모양을 무엇은 잃고 무엇은
 * 지키는가** 하나만 말한다 — 각과 길이는 바뀌고, 평행과 원점은 남는다. 형제 조각과 가르는 낱말은 axis factor ·
 * non-uniform · angles open · parallel 이고, 원 · 같은 벡터 · 셋째 칸은 쓰지 않는다.
 *
 * 전제 (설명 글 `scaleStretches.md`): x 오른쪽 · y 위, 열 벡터에 왼쪽 곱(p′ = S·p). 늘임은 원점을 기준으로 한다.
 * 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const scaleStretchesConcept: FacetConceptSource = {
  id: 'scaleStretches',
  label: 'Non-Uniform Scaling Changes Angles',
  canonicalFacet: 'facet:scaleStretches',

  surface: {
    definition:
      'Scaling multiplies each coordinate by its own axis factor about the origin; with unequal factors the angles and side lengths of a shape change, while parallel sides stay parallel and the origin stays fixed.',
    exemplarKeywords: [
      'non-uniform scaling',
      'scale matrix diag(sx, sy)',
      'stretch and squash',
      'aspect ratio distortion',
      'scaling does not preserve angles',
      'scaling is about the origin',
      'scale around the center of an object',
      'uniform vs non-uniform scale',
      'area scales by sx times sy',
      'points on an axis do not move',
    ],
  },

  briefing: {
    observable: [
      'A diamond — a unit square stood on its corner — has vertices (0, 1), (1, 2), (0, 3) and (−1, 2). The caption reads "Starting shape. Scale x: 1, y: 1" with "Top angle: 90.0°" and "Side: 1.41".',
      'Three steps stretch across, with scale x going 1.5, 2, 3 and y staying 1. The top angle opens to 112.6°, 126.9°, 143.1° and the side grows to 1.80, 2.24, 3.16. The side angles narrow by the same amount, the two always summing to 180°.',
      'During those three steps the two vertices on the y axis (x = 0) show "Moved: 0.00" — multiplying 0 by any factor leaves 0.',
      'The last step, "Squash down", sets the scale to x 3, y 0.5. Now those two vertices are pulled toward the origin: the one at y = 3 moves 1.50, the one at y = 1 moves 0.50 — three times farther from the origin, three times the distance. The top angle reaches 161.1° and the side becomes 3.04.',
      'Throughout, opposite sides stay parallel and all four sides stay equal, so the shape remains a diamond; at each step the previous position is drawn as a dashed outline. The area goes from 2 to 3, a factor of sx · sy.',
      'Every step multiplies the starting shape, not the previous result. Coordinates have y pointing up, points are column vectors, and scaling is always about the origin; scaling about another point needs a shift there and back, which is not shown.',
    ],

    screen: {
      affordances: [
        'The screen plays the five steps by itself and stops after the squash.',
        'A Replay button and a playback strip sit below it. Dragging the strip between the third and fourth steps sets the unmoving axis vertices against the same vertices being pulled in.',
        'The shape and factors are fixed, so an article can quote every angle, side length and distance exactly as it appears.',
      ],
    },

    useWhen: [
      'The reader assumes scaling only makes things bigger or smaller, and the article needs to show a right angle opening up to 161° once the two axes get different factors.',
      'The article explains why a scale matrix has a fixed point at the origin, and needs vertices that stay put while others move, with distances that grow in proportion to how far they started.',
    ],

    avoidWhen: [
      'The article is about scaling around an object\'s own center or a chosen pivot. Scaling here is only about the origin.',
      'The subject is the order in which scale, rotation and translation are combined. Only one transform acts here.',
      'The point is shear or a general linear map. The matrix here is always diagonal.',
    ],

    contrastWith: [
      {
        concept: 'scaleRotateTranslate',
        note: 'What one scale does to a shape is settled here; composition asks what the same scale does to shifts and rotations applied before it.',
      },
      {
        concept: 'rotateTurns',
        note: 'Both fix only the origin, but rotation keeps every length and angle, while unequal scaling changes both and keeps only parallelism.',
      },
      {
        concept: 'translateSlides',
        note: 'Scaling moves a point in proportion to its distance from the origin, and points on an axis may not move at all; translation moves every point by exactly the same amount.',
      },
      {
        concept: 'matrixTransform2d',
        note: 'A general 2x2 matrix can shear or mirror as well; a diagonal scale matrix is the special case where each axis is stretched independently and nothing tilts off its axis.',
      },
    ],
  },
};
