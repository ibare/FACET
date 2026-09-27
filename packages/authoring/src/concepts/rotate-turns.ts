/**
 * rotateTurns 개념 선언.
 *
 * canonical facet 은 `facet:rotateTurns` — 원점에서 떨어진 삼각형 A (3, 1) · B (5, 1) · C (4, 3) 을 원점 둘레로
 * 45° 씩 네 번, 모두 180° 돌린다. 꼭짓점은 저마다 제 반지름의 점선 원 위에서 호를 그리고, 오른쪽 칸이 걸음마다
 * 좌표 · 원점까지 거리 · 무게중심 · 변 길이 · 꼭짓점 각을 새로 재어 보인다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `scaleRotateTranslate` 는 회전 중심을 손잡이로 바꾸고 순서를 돌린다. 이쪽은 회전 행렬 하나가 **어디를 중심으로
 * 도는가(늘 원점) · 무엇이 그대로인가(거리 · 길이 · 각)** 하나만 말한다. 형제와 가르는 낱말은 around the origin ·
 * circle · distance preserved · rigid 이고, 각이 벌어짐 · 같은 벡터 · 셋째 칸은 쓰지 않는다.
 *
 * 전제 (설명 글 `rotateTurns.md`): x 오른쪽 · y 위, 반시계가 +, 각은 도. 걸음 k 는 처음 좌표에 R(45°·k) 를 곱한다
 * (거듭 곱하지 않는다). 화면에 코드는 없다. 호 길이(A 2.48 · C 3.93 · B 4.00)는 설명 글의 셈이고 화면 표에는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const rotateTurnsConcept: FacetConceptSource = {
  id: 'rotateTurns',
  label: 'Rotation Turns Around the Origin',
  canonicalFacet: 'facet:rotateTurns',

  surface: {
    definition:
      'A rotation matrix turns a figure around the origin rather than around its own centre: every vertex sweeps the same angle along a circle of fixed radius, so the figure swings to a new place as a rigid, undistorted copy.',
    exemplarKeywords: [
      'rotation matrix',
      '2D rotation [[cos, −sin], [sin, cos]]',
      'rotate about the origin',
      'why does my object orbit instead of spin',
      'rotation preserves distances and angles',
      'rigid transformation',
      'counterclockwise positive angle',
      'rotate around the centroid',
      'orthogonal matrix',
      'farther points travel longer arcs',
    ],
  },

  briefing: {
    observable: [
      'A triangle with A (3, 1), B (5, 1), C (4, 3) sits away from the origin. Four steps each read "Turn around the origin: +45.0°", bringing the total angle to 45°, 90°, 135° and 180°.',
      'Each vertex moves along an arc of a dashed circle centred on the origin; the start outline stays as a dashed triangle, and the centroid traces its own dotted arc.',
      'A table beside the plane re-measures every step from the new coordinates. "To origin" stays A 3.16 · B 5.10 · C 5.00; Side lengths stay AB 2.00 · BC 2.24 · CA 2.24; Interior angles stay A 63.4° · B 63.4° · C 53.1°.',
      'The Centroid starts at (4.00, 1.67) and ends at (−4.00, −1.67) on the far side of the origin, its distance 4.33 unchanged — the triangle did not spin in place, it went around.',
      'At 90° the positions are A (−1.00, 3.00), B (−1.00, 5.00), C (−3.00, 4.00); at 180° every coordinate has flipped sign.',
      'Coordinates have y pointing up and angles count counterclockwise in degrees. Each step multiplies the starting coordinates by the rotation for the total angle, rather than rotating the previous result again, which would accumulate floating-point error. Turning about the centroid instead would need a shift to the origin and back, which is not shown.',
    ],

    screen: {
      affordances: [
        'The screen plays the four 45° turns by itself and stops at 180°.',
        'A Replay button and a playback strip sit below it. Dragging the strip back and forth shows the arcs growing while every number in the table except Position stays fixed.',
        'The triangle and angle are fixed, so an article can quote every coordinate, distance and angle exactly as it appears.',
      ],
    },

    useWhen: [
      'A reader rotated an object that was not at the origin and it swung around instead of spinning, and the article needs to show that the rotation matrix itself chose the origin as the centre.',
      'The article claims rotation preserves shape and needs distances, side lengths and angles re-measured after every turn and found identical.',
    ],

    avoidWhen: [
      'The article is about rotating around an arbitrary pivot or composing a rotation with shifts. The centre here is always the origin.',
      'The subject is 3D rotation, Euler angles, gimbal lock or quaternions. This is a single angle in the plane.',
      'The point is how rotation matrices are derived from trigonometry. The matrix is applied, not built up.',
    ],

    contrastWith: [
      {
        concept: 'scaleRotateTranslate',
        note: 'A lone rotation matrix always turns about the origin; placing it between a shift and its inverse is how any other pivot is reached, and the order of those factors then decides where the shape ends up.',
      },
      {
        concept: 'scaleStretches',
        note: 'Both leave the origin fixed, but rotation keeps every length and angle, while unequal scaling keeps only parallel sides.',
      },
      {
        concept: 'translateSlides',
        note: 'Rotation moves each point by a different amount along its own circle; translation moves every point by the same vector and has no centre at all.',
      },
      {
        concept: 'matrixTransform2d',
        note: 'Rotation is one kind of 2x2 linear map, the one whose columns stay perpendicular unit vectors, which is exactly why lengths and angles survive it.',
      },
    ],
  },
};
