/**
 * worldToCamera 개념 선언.
 *
 * canonical facet 은 `facet:worldToCamera` — 눈이 (2, 1, 5) 에서 yaw 30° 로 (−0.500, 0, −0.866) 쪽을 본다.
 * 세상에 점 넷(나무 · 집 · 바위 · 가로등). 먼저 모든 점이 (−2, −1, −5) 만큼 옮겨 가 눈이 원점에 서고, 이어 세상이
 * y 축 둘레로 −30° 돌아 눈의 앞이 −z 에 눕는다. 그 뒤 점마다 카메라 z 의 부호로 앞(음수) · 뒤(양수)를 읽는다 —
 * 앞 셋 · 뒤 하나(바위 3.23). 눈과의 거리는 두 움직임 내내 그대로다. 걸음 일곱(처음 포함), 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `projection` 은 눈의 거리 손잡이로 상의 폭 비를 견준다. 이 조각의 주장은 그 앞 단계 하나 —
 * "눈이 아니라 세상이 움직이고, 다 움직인 뒤 z 의 부호 하나로 앞뒤가 갈린다" 다. 형제 `lookAtDirection` 은 축을
 * 세우기만 하고 점을 옮기지 않으며 이쪽에는 외적이 없다. 그래서 definition 은 view transform · negative of the eye
 * position · whole scene · sign of z · in front or behind 를 독점하고, cross product · up vector · 투영 · 크기 낱말을 쓰지 않는다.
 *
 * 전제: 오른손 · y 위 · 열 벡터에 왼쪽에서 곱함. 방향은 yaw 하나(y 축 둘레)로만 주어진다. 그림은 위에서 내려다본
 * x–z 평면이라 y 는 표에만 있다. 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const worldToCameraConcept: FacetConceptSource = {
  id: 'worldToCamera',
  label: 'View Transform: Moving the World to the Eye',
  canonicalFacet: 'facet:worldToCamera',

  surface: {
    definition:
      'The view transform shifts all world points by the negative eye position, then rotates the scene, so the sign of each point\'s camera-space z says whether it is in front of or behind the eye.',
    exemplarKeywords: [
      'view matrix',
      'world space to camera space',
      'world to view space',
      'eye space coordinates',
      'the camera does not move, the world does',
      'inverse of the camera transform',
      'translate then rotate',
      'is the point behind the camera',
      'negative z is in front of the camera',
      'model-view matrix',
      'OpenGL',
    ],
  },

  briefing: {
    observable: [
      'Drawn from above (x across, z down the page), the eye stands at (2, 1, 5) with its forward direction (−0.500, 0, −0.866), a yaw of 30°. Four world points — Tree, House, Rock, Lamp — carry a table beside the picture with columns x, y, z and "Dist." (distance from the eye).',
      'Step 1: "The whole world shifts by (−2, −1, −5) · eye now at (0, 0, 0)". Every point slides by the same amount; the eye lands on the Origin mark. Tree goes to (−3, −1, −7), Rock to (3, −1, 2).',
      'Step 2: "The whole world turns −30° about the y axis · eye forward now (0, 0, −1)". The eye\'s forward arrow lies along the −z mark. Camera coordinates: Tree (0.90, −1.00, −7.56), House (−2.33, 0.00, −5.96), Rock (1.60, −1.00, 3.23), Lamp (2.00, 1.00, −3.46).',
      'Steps 3 to 6 judge one point each by its z: Tree, House and Lamp read "camera z … < 0" and are marked Front; Rock reads "camera z 3.23 > 0" and is marked Behind. The tally ends as "Front 3 · Behind 1".',
      'The Dist. column shows the same numbers at every step — Tree 7.68, House 6.40, Rock 3.74, Lamp 4.12 — because shifting and turning do not change any distance.',
      'Both moves combine into one view matrix R_y(−30°)·T(−eye), shift first. The screen shows the two moves separately and does not print the matrix.',
      'Conventions: right-handed axes, y up, the camera looks down −z; the direction is given only as a turn about the y axis, so y values appear in the table but not in the top-down picture.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself through seven steps — the starting scene, the shift, the turn, and one judgement per point — and stops. A Replay button and a scrub strip sit below it.',
        'Scrubbing between the shift and the turn shows the moment the eye already sits at the origin but still faces the wrong way, so its z readings do not yet mean front or behind.',
        'The eye, the direction and the four points are fixed, so every coordinate and distance can be quoted exactly.',
      ],
    },

    useWhen: [
      'A reader thinks of moving a camera as moving the camera object, and the article needs to show that rendering instead moves every point by the opposite amount.',
      'The article must justify why, after the view transform, a single comparison on z is enough to tell whether a point is behind the camera.',
    ],

    avoidWhen: [
      'The subject is building the camera axes from a target point and an up vector. The direction here is given as one yaw angle and no cross product is taken.',
      'The article is about projecting onto the screen or about objects looking smaller with distance. Nothing here is projected; the result stays in 3D camera coordinates.',
      'The point concerns arbitrary 3D orientation, pitch or roll. The turn is about the y axis only.',
    ],

    contrastWith: [
      {
        concept: 'lookAtDirection',
        note: 'Look-at constructs the rotation from an eye, a target and an up vector. The view transform assumes that rotation is known and applies it, after a shift, to every point in the scene.',
      },
      {
        concept: 'projection',
        note: 'Moving points into camera space prepares depths; the projection stage turns those depths into image sizes and is where distance starts to change how big things look.',
      },
      {
        concept: 'translateSlides',
        note: 'A translation moves points by a common offset. The view transform uses exactly that move, with the offset chosen as the negative of the eye position, and follows it with a rotation.',
      },
      {
        concept: 'rotateTurns',
        note: 'A rotation turns points about the origin while keeping lengths. Here the rotation is chosen to undo the eye\'s direction, so that forward becomes −z for every point at once.',
      },
    ],
  },
};
