/**
 * scaleRotateTranslate 개념 선언.
 *
 * canonical facet 은 `facet:scaleRotateTranslate` — 같은 L 자에 늘임 S (2, 1) · 반시계 90° 회전 R · 옮김 T (3, 1)
 * 을 동차 3×3 행렬로 하나씩 합성 행렬 M 의 왼쪽에 곱하고(걸음 1..3), 걸음 4 에서 M 하나를 처음 도형에 한 번 곱한다.
 * 손잡이 둘 — 순서 여섯(S→R→T 기본) · 회전 중심 둘(원점 기본 · (1, 1)) — 을 돌리면 판을 다시 재생한다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 다섯)
 *
 * 조각 다섯은 각각 한 장면이다 — 축마다 늘여 각이 벌어짐(`scaleStretches`) · 원점 둘레를 돎(`rotateTurns`) ·
 * 모든 점이 같은 벡터로 미끄러짐(`translateSlides`) · 셋째 칸 1 로 옮김을 곱으로(`extraDimensionForTranslate`) ·
 * w 로 나누어 평면으로 되돌림(`wDivide`). 이쪽은 세 변환을 **한 행렬로 합치고 곱하는 순서 · 회전 중심을 돌려
 * 도착이 갈리는 것**을 맡는다. 그래서 definition 은 order · composite · pivot · 뒤 인수가 앞의 옮김을 늘이거나
 * 돌린다는 쪽 낱말을 쥐고, 조각들이 독점한 angles open · circle · same vector · third entry 1 · divide by w 를
 * 쓰지 않는다.
 *
 * 전제 (설명 글 `scaleRotateTranslate.md` 가 밝힌 것 — 화면은 각주를 달지 않는다):
 *  - 좌표는 x 오른쪽 · y 위. 점은 열 벡터, 행렬은 왼쪽에서 곱한다(p′ = M·p) — "A 다음 B" 가 B·A. 행 벡터 규약의 책과 거꾸로다.
 *  - 회전은 90° 배수로 묶어 행렬이 모두 정수다. 회전 중심은 세계에 박힌 점이다.
 *  - 모두 affine 이라 셋째 칸 w 는 늘 1 이다. w 로 나누는 걸음은 없다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const scaleRotateTranslateConcept: FacetConceptSource = {
  id: 'scaleRotateTranslate',
  label: 'Composing Transforms (Order and Pivot Decide Where a Shape Lands)',
  canonicalFacet: 'facet:scaleRotateTranslate',

  surface: {
    definition:
      'Scale, rotation and translation combined into one composite 3x3 matrix, where changing the multiplication order or the rotation pivot changes the result, because a later factor also stretches or turns an earlier shift.',
    exemplarKeywords: [
      'transform composition',
      'order of transformations matters',
      'matrix multiplication is not commutative',
      'TRS matrix',
      'model matrix',
      'scale then rotate then translate',
      'rotate about a pivot point',
      'rotation around an arbitrary point T(p)·R·T(−p)',
      'concatenating affine transforms',
      'glm::translate glm::rotate glm::scale order',
      'column-vector vs row-vector convention',
    ],
  },

  briefing: {
    observable: [
      'An L shape with six vertices a..f starts at a (0, 0), b (2, 0), c (2, 1), d (1, 1), e (1, 2), f (0, 2). Three factor chips name the transforms with a letter and a value: S Scale (2, 1), R Rotate +90° with its pivot, T Shift (3, 1), listed in the order they apply.',
      'Steps 1 to 3 multiply one factor onto the composite matrix M from the left, and the shape actually moves by that factor: the scale stretches it away from the origin, the rotation carries it along an arc around the pivot mark, the shift slides it straight. The matrix table reads M = S, then R·S, then T·R·S.',
      'Step 4 multiplies the single composite M once onto each vertex of the first shape and reports "Vertices on their step 3 place: 6/6 · third coordinate 1: 6/6". A dashed arrival frame moves from the previous round\'s arrival to this one and settles over the shape.',
      'Two readouts, Shift column x and Shift column y, show the third column of M so far. Vertex a sits at (0, 0), so its arrival always equals that column.',
      'With the pivot at the origin, only the two orders that end with the shift (S→R→T and R→S→T) keep the shift column at (3, 1). A later scale stretches the shift (R→T→S gives (6, 1)); a later rotation turns it (S→T→R gives (−1, 3)). With the pivot at (1, 1), none of the six orders leaves it at (3, 1).',
      'The upper-left 2x2 of M, the shape part, splits only two ways per pivot — whether scale or rotation comes first — while the position splits six ways. All twelve order-and-pivot combinations arrive in different places.',
      'Switching only the pivot from the origin to (1, 1) slides the whole arrival without changing its shape: by (2, 0) when scale comes before rotation, by (4, 0) when rotation comes before scale, since that extra shift is then stretched by the later (2, 1) scale.',
      'Points are column vectors and matrices multiply from the left, so "A then B" is written B·A; books using row vectors write it the other way round. Rotation is limited to multiples of 90° so every matrix entry is an integer, the pivot is a fixed point in the world, and the third coordinate stays 1 throughout — nothing is divided by w.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Order of transforms" with six positions from S→R→T (default) to T→R→S, and "Rotation pivot" with Origin (default) and (1, 1). Each change replays a round of about nine seconds, then the screen waits after step 4.',
        'The move that makes the idea land is stepping the order handle while watching the Shift column readouts and the dashed arrival frame jump; flipping only the pivot handle shows the arrival sliding without changing shape.',
        'The code panel, labelled "Compose, then apply once", starts empty with an add-language button; it shows the composition and the single application as the same program in Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article says "scale, then rotate, then translate" and the reader needs to see that any other order lands the object elsewhere, with a number — the shift column — that shows how far.',
      'A reader\'s object orbits instead of spinning in place, and the explanation needs the rotation pivot, and the order in which the shift is applied, as the two things that decide it.',
    ],

    avoidWhen: [
      'The article is about what one transform does on its own — how scaling bends angles or how rotation keeps lengths. Here all three are fixed and only their order and the pivot change.',
      'The subject is perspective projection, the camera, or dividing by w. The third coordinate is 1 throughout, and nothing here gets smaller with distance.',
      'The rotation needs arbitrary angles, quaternions or 3D axes. Rotation here is a quarter turn in the plane.',
    ],

    contrastWith: [
      {
        concept: 'scaleStretches',
        note: 'Non-uniform scaling on its own changes angles about a fixed origin; in a composition the same scale also lengthens any shift applied before it, which is one way the order changes the result.',
      },
      {
        concept: 'rotateTurns',
        note: 'A bare rotation matrix always turns around the origin. Composing it between two shifts is how a rotation about any other pivot is built, and why that pivot moves the final position.',
      },
      {
        concept: 'translateSlides',
        note: 'A translation alone moves every point by the same vector, and successive translations simply add. Once scaling or rotation follows it, that vector itself is transformed, so translations no longer sum as written.',
      },
      {
        concept: 'extraDimensionForTranslate',
        note: 'The appended coordinate is what lets a shift be a matrix at all. Composition takes that for granted and asks what happens when three such matrices are multiplied in different orders.',
      },
      {
        concept: 'wDivide',
        note: 'Composition of affine transforms keeps the third coordinate at 1, so recovering the point needs no division; dividing by w only matters once that coordinate can take other values.',
      },
      {
        concept: 'matrixTransform2d',
        note: 'A 2x2 matrix describes a linear map that fixes the origin. Composing scale, rotation and translation needs a matrix that can also move the origin, and makes the order of factors decide the outcome.',
      },
    ],
  },
};
