/**
 * lookAtDirection 개념 선언.
 *
 * canonical facet 은 `facet:lookAtDirection` — 눈 (4, 3, 2) · 바라보는 점 (0, 1, 0) · 주어진 위쪽 (0, 1, 0) 에서
 * 카메라의 세 축이 차례로 선다: 시선 f = (−0.816, −0.408, −0.408) · 오른쪽 r = (0.447, 0, −0.894)(y 성분 0, 수평) ·
 * 참 위 u = r × f = (−0.365, 0.913, −0.183). 참 위는 주어진 위쪽에서 24.1° 기울고 — 시선이 수평 아래로 내려간 각과
 * 같다 — **앞으로(바라보는 쪽으로)** 기운다. 마지막에 바라보는 점을 새 축으로 읽으면 (0, 0, −4.90). 걸음 다섯.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `projection` 은 look-at 을 판 머리에서 한 번 셈하고 넘어간다. 이 조각의 주장은 그 셈 하나 —
 * "대강의 위쪽 하나로 세 축이 서고, 오른쪽은 눕고 참 위는 새로 만들어진다" 다. 형제 `worldToCamera` 는 점을 옮기고
 * 외적이 없다. 그래서 definition 은 target point · rough up vector · normalize · cross product · level right axis ·
 * true up 을 독점하고, 점을 옮김 · z 부호 · 투영 · 크기 낱말을 쓰지 않는다.
 *
 * 사실 확인: 사양 초안에 "참 위가 뒤로 기운다" 가 있었으나 설명 글(감사로 고친 것)대로 **앞으로** 기운다.
 *
 * 전제: 오른손 · y 위 · 카메라 −z(그래서 뷰 회전 셋째 행이 −f). 외적은 오른손 규칙. 세상의 점은 옮기지 않는다.
 * 그림은 비스듬히 내려다본 자리에서 그렸고 바닥 격자는 y = 0. 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const lookAtDirectionConcept: FacetConceptSource = {
  id: 'lookAtDirection',
  label: 'Look-At: Building Camera Axes from Eye, Target and Up',
  canonicalFacet: 'facet:lookAtDirection',

  surface: {
    definition:
      'Building a camera\'s orthonormal axes from an eye, a target point and a rough up vector: normalize the line of sight, cross it with up for a level right axis, then cross again for the true up.',
    exemplarKeywords: [
      'look-at matrix',
      'lookAt function',
      'gluLookAt',
      'glm::lookAt',
      'camera basis vectors',
      'forward right up vectors',
      'up vector does not need to be perpendicular',
      'cross product to find the right vector',
      'Gram-Schmidt style orthonormal frame',
      'camera looking straight up breaks lookAt',
      'gimbal problem when up is parallel to forward',
    ],
  },

  briefing: {
    observable: [
      'The world is drawn from an oblique viewpoint above a floor grid at y = 0. Given: Eye (4, 3, 2), Look-at point (0, 1, 0), Given up (0, 1, 0); dotted drop lines to the floor show the heights.',
      'Step 1, Sight: "Sight = look-at point − eye = (−4.000, −2.000, −2.000) · length 4.90", then "Shrunk to length 1: f = (−0.816, −0.408, −0.408)".',
      'Step 2, Right: "f × up = (0.408, 0, −0.816) · length 0.913", then "Right r = (0.447, 0, −0.894) · y component 0". The right axis lies flat in a "Level at eye height" plane.',
      'Step 3, True up: "True up u = r × f = (−0.365, 0.913, −0.183)", and "Angle from given up: 24.1° · sight below level: 24.1°". The true up leans forward, toward the look-at point: its level part points the same way as the sight\'s level part. No normalizing is needed because r and f are already perpendicular unit vectors.',
      'Step 4: "Look-at point in camera axes (r, u, −f) = (0, 0, −4.90)" — the target lies straight down the camera\'s −z axis, one sight length away.',
      'The given up only has to be rough; it is used to lay the right axis level and is then replaced by the true up. If it were parallel to the sight (looking straight up or down), f × up would have length 0 and the right axis could not be formed; that case is not played.',
      'Conventions: right-handed axes, y up, the camera looks down −z, so the third row of the view rotation is −f; cross products follow the right-hand rule, and swapping the order would flip right into left. No object in the world is moved.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself through five steps — the given three, then sight, right, true up, and reading the target — and stops. A Replay button and a scrub strip sit below it.',
        'Scrubbing between the right step and the true-up step shows the frame half built: the right axis already level, the given up still standing straight, and then the true up tilting 24.1° off it.',
        'The eye, target and up are fixed, so every vector, length and angle can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains what a lookAt call does with its three arguments and needs each axis appearing in turn with its actual numbers.',
      'A reader is puzzled that the up vector passed in is not the camera\'s real up when the camera tilts down, and should see the true up come out tilted by exactly the pitch.',
      'The article warns about pointing a camera straight up or down with up = (0, 1, 0) and wants the reason: the cross product that makes the right axis collapses.',
    ],

    avoidWhen: [
      'The subject is transforming scene points into camera space. Here only the three axes are built; no other point is moved.',
      'The article is about quaternions, Euler angles or smooth camera rotation. There is one fixed frame computed once.',
      'The topic is perspective or image size. Nothing is projected onto a screen here.',
    ],

    contrastWith: [
      {
        concept: 'worldToCamera',
        note: 'Look-at produces the camera\'s orientation. Applying that orientation to every point of the scene, after shifting by the eye position, is the view transform that uses it.',
      },
      {
        concept: 'projection',
        note: 'Where the camera points is settled before any projecting happens; projection then asks how depth along that viewing axis becomes image size.',
      },
      {
        concept: 'rotateTurns',
        note: 'A rotation is usually given by an angle. Look-at arrives at a rotation without naming any angle: the three rows come from a target and an up vector through normalizing and cross products.',
      },
    ],
  },
};
