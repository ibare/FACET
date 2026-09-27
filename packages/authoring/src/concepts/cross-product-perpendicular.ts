/**
 * crossProductPerpendicular 개념 선언.
 *
 * canonical facet 은 `facet:crossProductPerpendicular` — 한 주장을 말하는 조각(piece) facet.
 * 3차원의 a = (2, 1, 0) · b = (1, 2, 2) 가 벌린 판에서 c = a × b = (2, −4, 3) 이 판을 뚫고 서고,
 * a·c · b·c 가 둘 다 0 · 사이각 90.0° 로 셈된다. 마지막에 b × a = (−2, 4, −3) 이 같은 줄의 반대쪽으로 선다.
 *
 * ── 묶음 안에서의 자리 (가 · 벡터와 그래프 — 완제품 없음, origin vector-ops)
 *
 * 벡터 조각 가운데 홀로 3차원이다. **둘 다에 수직 · 오른손 · 차례를 바꾸면 반대쪽** 을 쥔다.
 * 넓이 |a × b| 는 행렬식 조각들의 말이라 definition 에 넣지 않는다.
 *
 * 전제: a · b 는 예로 정한 값(서로 수직이 아니게 골랐다) · 오른손 좌표계 · 이 모양의 외적은 3차원에서만 정의된다.
 * 성분이 정수라 0 은 반올림 없이 정확하다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const crossProductPerpendicularConcept: FacetConceptSource = {
  id: 'crossProductPerpendicular',
  label: 'Cross Product Is Perpendicular to Both',
  canonicalFacet: 'facet:crossProductPerpendicular',

  surface: {
    definition:
      'In 3D the cross product a × b is a vector perpendicular to both a and b, pointing by the right-hand rule; swapping the order to b × a reverses it.',
    exemplarKeywords: [
      'cross product',
      'vector product',
      'a × b',
      'right-hand rule',
      'anticommutative',
      'b × a = −(a × b)',
      'normal vector to a plane',
      'surface normal',
      'torque and angular momentum',
      '3D vectors',
    ],
  },

  briefing: {
    observable: [
      'Two 3D vectors `a = (2, 1, 0)` and `b = (1, 2, 2)` start at the origin and span a shaded plane ("The plane spanned by a and b"). Their angle reads `53.4°`, and an arc on the plane points from `a` to `b`.',
      'Step 1: `c = a × b = (2, −4, 3)` appears in one move, with its three components worked out — `c₁ = 1×2 − 0×2 = 2`, `c₂ = 0×1 − 2×2 = −4`, `c₃ = 2×2 − 1×1 = 3` — and the caption "c = a × b stands out of the plane".',
      'Step 2: `a·c = 2×2 + 1×(−4) + 0×3 = 0` and "Angle (a, c): 90.0°". Step 3: `b·c = 1×2 + 2×(−4) + 2×3 = 0` and "Angle (b, c): 90.0°".',
      'Step 4 ("Order swapped: b × a"): `b × a = (−2, 4, −3) = −(a × b)` goes from the head of `c` through the origin to the opposite side of the same line, the arc’s arrowhead turns toward `a`, and `a·(b × a) = 0`, `b·(b × a) = 0` are shown.',
      'The 3D scene is drawn in one fixed projection that keeps the right-handed axes unmirrored. The two vectors are example values chosen not to be perpendicular, so `c` does not look like a coordinate axis; integer components make every zero exact.',
    ],

    screen: {
      affordances: [
        'The screen plays five steps by itself (the first frame counted) and stops after the order is swapped.',
        'A Replay button and a playback strip sit below. The view angle is fixed; stepping between steps 1 and 4 shows the two opposite directions on one perpendicular line.',
      ],
    },

    useWhen: [
      'The article introduces the cross product and the reader has only the component formula. Seeing both dot products come out exactly 0 shows the result really is perpendicular to both inputs.',
      'The reader needs to know which of the two perpendicular directions the product picks and why the order matters — before surface normals, torque, or a magnetic force depend on that sign.',
    ],

    avoidWhen: [
      'The article is about the area of a parallelogram or a determinant. The magnitude of the product is not the subject here.',
      'The subject is the 2D "cross product" that returns a single signed number, or wedge products in higher dimensions. This is the 3D vector-valued product only.',
      'The topic is a cross join or a Cartesian product of sets or tables.',
    ],

    contrastWith: [
      {
        concept: 'dotProductShadow',
        note: 'The dot product of two vectors is a number that is zero exactly when they are perpendicular; the cross product is a new vector, and dot products are how its perpendicularity is checked.',
      },
      {
        concept: 'determinantArea',
        note: 'The length of a × b equals the area spanned by a and b, which is the determinant’s claim; the cross product’s own claim is the direction and its dependence on order.',
      },
    ],
  },
};
