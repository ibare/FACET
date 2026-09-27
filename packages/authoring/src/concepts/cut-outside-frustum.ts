/**
 * cutOutsideFrustum 개념 선언.
 *
 * canonical facet 은 `facet:cutOutsideFrustum` — 클립 공간의 삼각형 A (−0.5, −0.6, 0.2, 1.0) · B (2.4, −0.3, 0.5, 1.5) ·
 * C (0.3, 2.0, 0.6, 1.25) 를 면 여섯에 차례로 건다(Sutherland–Hodgman). 오른쪽 면에서 B(d −0.900)를 버리고 P · Q 가,
 * 위 면에서 C(d −0.750)를 버리고 R · S 가 경계 위에 선다. 꼭짓점 3 → 4 → 5, 마지막에 꼭짓점 0 에서 부채꼴로
 * 삼각형 셋. x/w, y/w 넓이 2.162 → 1.693 (틀 넓이 4). 버릴 것이 없는 면은 걸음을 두지 않는다. 걸음 넷(처음 포함).
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `projection` 은 가까운 면 하나로 선틀 모서리를 자르고 그 결과를 상의 폭으로 잰다. 이 조각의 주장은 자르는
 * 절차 자체 — "면 밖 꼭짓점은 버리고, 모서리가 면을 지나는 자리에 새 꼭짓점을 세우고, 다각형을 다시 삼각형으로" — 다.
 * 그래서 definition 은 homogeneous clip space · plane at a time · discarded · new vertices where edges cross ·
 * re-triangulated 를 독점하고, 눈의 거리 · 폭 비 · 원근/직교 낱말을 쓰지 않는다.
 *
 * 전제: 교점은 w 로 나누기 전에 t = d_S / (d_S − d_E) 로 셈한다. d = 0 인 꼭짓점과 w ≤ 0 인 꼭짓점은 자료에 없다.
 * z 는 세 꼭짓점 모두 틀 안이라 가까운 · 먼 면은 자르지 않는다. 새 꼭짓점 이름 P · Q · R · S 는 생긴 차례. 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const cutOutsideFrustumConcept: FacetConceptSource = {
  id: 'cutOutsideFrustum',
  label: 'Clipping a Triangle Against the View Frustum',
  canonicalFacet: 'facet:cutOutsideFrustum',

  surface: {
    definition:
      'Clipping a triangle against the view frustum one plane at a time in homogeneous clip space: vertices outside a plane are discarded, new vertices are made where edges cross it, and the polygon is re-triangulated.',
    exemplarKeywords: [
      'frustum clipping',
      'Sutherland–Hodgman',
      'polygon clipping algorithm',
      'clip space',
      'homogeneous coordinates',
      '-w <= x <= w',
      'clip before perspective divide',
      'triangle partially off screen',
      'fan triangulation',
      'guard band',
      'graphics pipeline clipping stage',
    ],
  },

  briefing: {
    observable: [
      'At the start: "Triangle ABC in clip space" with the rule "Inside the frame: −w ≤ x, y, z ≤ w". Drawn in x/w, y/w, A (−0.500, −0.600) is inside, B (1.600, −0.200) sticks out to the right and C (0.240, 1.600) sticks out the top. Each vertex has its own w: 1.0, 1.5, 1.25.',
      'Right face: "Cut by the right face: inside where d = w − x > 0". B has d −0.900 and is dropped. P appears on edge A→B at t 0.625 and Q on edge B→C at t 0.486. "Dropped: B · new on the boundary: P, Q · vertices 3 → 4".',
      'Top face: d = w − y. C has d −0.750 and is dropped. R appears on edge C→A at t 0.319 and S on edge Q→C at t 0.427 — one of the new edges from the previous cut. Vertices 4 → 5.',
      'Every new vertex has d exactly 0: P and Q land on x/w = 1.000, R and S on y/w = 1.000.',
      'Last step: "Split from vertex 0 into triangles: 3" — the five-vertex polygon is fanned from R into (0, 1, 2), (0, 2, 3), (0, 3, 4). "Area in x/w, y/w: 2.162 → 1.693 · frame 4".',
      'The left, bottom, near and far faces are tested too but drop nothing, so they get no step. Intersections are computed with t = d_S / (d_S − d_E) before dividing by w; no vertex lies exactly on a face and none has w ≤ 0. The letters P, Q, R, S are given in order of creation.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself through four steps — the triangle and frame, the right-face cut, the top-face cut, and the split into triangles — and stops. A Replay button and a scrub strip sit below it.',
        'Scrubbing between the two cuts shows the second face cutting an edge that the first cut created, which is why the vertex count goes 3 → 4 → 5.',
        'A side list keeps "Polygon, in order", "Dropped" and "Triangles"; each new vertex is tagged with its d, t and the edge it came from. All numbers are fixed and can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains why a triangle half off-screen reaches the rasterizer as several triangles, and needs a case where the vertex count grows as faces cut it.',
      'A reader asks why clipping is done in clip space before the divide by w, and should see the intersection taken with a single t that gives x, y, z and w together.',
      'The article presents the Sutherland–Hodgman rule and wants each face\'s keep, drop and insert decisions laid out on real numbers.',
    ],

    avoidWhen: [
      'The subject is culling whole objects or back faces. Here a single triangle is cut, not accepted or rejected as a whole.',
      'The article is about 2D line clipping such as Cohen–Sutherland. The input here is a triangle in 4D homogeneous coordinates.',
      'The topic is vertices behind the eye with negative w. No such vertex is present, and the near and far faces cut nothing.',
    ],

    contrastWith: [
      {
        concept: 'projection',
        note: 'Clipping inside a camera pipeline can be judged by what it does to an image\'s measured size. As a procedure, it is a per-plane rule for keeping, dropping and inserting vertices that does not depend on which projection produced them.',
      },
      {
        concept: 'wDivide',
        note: 'Dividing by w turns clip coordinates into screen positions. Clipping must come first, because the frame\'s faces are straight conditions like x = w only before that division.',
      },
      {
        concept: 'triangleToPixels',
        note: 'Rasterization assumes a triangle already lies inside the frame and covers pixels; clipping is what guarantees that assumption by reshaping triangles that do not.',
      },
    ],
  },
};
