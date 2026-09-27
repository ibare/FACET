/**
 * matrixAsTransform 개념 선언.
 *
 * canonical facet 은 `facet:matrixAsTransform` — 행렬 A = [1 −1 ; 1 1] 하나가 격자 점 스물다섯을 한 걸음에 옮기고,
 * 이어 원점 · 움직인 거리 · 곧은 줄 · 고른 간격을 하나씩 짚는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `matrixOps` 는 변환 둘을 잇는 짝을 견주고, 형제 조각들은 열 · 가중합 · 곱 · 넓이 · 포개짐 · 되돌림을 맡는다.
 * 이쪽의 한 동사는 「옮겨 간다 — 평면 전체가 한꺼번에」이고, 질문은 「옮긴 뒤 무엇이 그대로 남는가」다.
 * 그래서 definition 은 every point at once · origin stays · straight · evenly spaced 를 쥐고,
 * 기저 · 열 · 넓이 · 행렬식 낱말을 쓰지 않는다.
 *
 * 전제: 행렬 하나 · 격자 점 스물다섯은 예로 정한 값이다. 이 행렬에서 움직인 거리가 원점에서의 거리와 같은 것은
 * 이 행렬(√2 배 · 45° 회전)의 우연이지 일반 성질이 아니다. 거리는 소수 둘째 자리로 반올림해 보인다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const matrixAsTransformConcept: FacetConceptSource = {
  id: 'matrixAsTransform',
  label: 'A Matrix Moves the Whole Plane at Once',
  canonicalFacet: 'facet:matrixAsTransform',

  surface: {
    definition:
      'Applying a matrix moves every point of the plane at once, each by its own distance, yet the origin stays put, lines of points stay evenly spaced, and they stay straight unless the matrix squashes a line to a single point.',
    exemplarKeywords: [
      'linear transformation',
      'matrix acting on the plane',
      'linear map preserves lines',
      'origin is fixed under a linear map',
      'grid lines stay parallel and evenly spaced',
      'transforming all points at once',
      'what a linear transformation keeps',
      'why it is called linear',
    ],
  },

  briefing: {
    observable: [
      'A 5 × 5 grid of points (x and y each −2 to 2) stands with its ten lines, beside the matrix A = [1 −1 ; 1 1]. The caption reads "Points: 25 · Lines: 10 — A acts on the whole plane".',
      'In one step all points leave together for their new places A p, leaving faint marks where they stood; the caption counts "points that changed place: 24 / 25". For example (1, 0) goes to (1, 1) and (0, 1) goes to (−1, 1).',
      'The next step points at the one that stayed: "Origin (0, 0) → (0, 0) · distance moved: 0".',
      'The distances moved differ from point to point. The four points next to the origin move 1.00, the four corners move 2.83 — (2, 2) → (0, 4), (2, −2) → (4, 0), (−2, 2) → (−4, 0), (−2, −2) → (0, −4) — and only five distances occur: 1.00, 1.41, 2.00, 2.24, 2.83.',
      'The last two steps check what the move kept: "Lines still straight after the move: 10 / 10" and "Lines still evenly spaced after the move: 10 / 10". A running tally on the side keeps each of these results as it arrives.',
      'The matrix and the grid are one chosen example. With this particular matrix each distance moved happens to equal the point\'s distance from the origin; that is a coincidence of this matrix, and the screen does not footnote it.',
    ],

    screen: {
      affordances: [
        'The screen plays six steps on its own and stops.',
        'A Replay button and a playback strip sit below it. Scrubbing back to the single move and forward again shows every point leaving at the same moment while the origin does not.',
        'The matrix and the grid are fixed, so an article can quote the counts and distances exactly.',
      ],
    },

    useWhen: [
      'The reader pictures a matrix as acting on one vector and needs to see it act on the whole plane in one go, with each point travelling a different distance.',
      'The article explains what "linear" guarantees geometrically — the origin is fixed, straight rows of points stay straight, equal spacing stays equal — and wants each checked by count.',
    ],

    avoidWhen: [
      'The article is about reading the columns of a matrix as the images of the basis vectors. The screen never singles out the basis or the columns.',
      'The subject is how areas change or what the determinant means. No area or determinant appears.',
      'The topic is a map that moves the origin, such as a translation. The origin here stays where it is by construction.',
    ],

    contrastWith: [
      {
        concept: 'matrixColumnsAreBasis',
        note: 'Seeing that a matrix moves the whole plane says nothing yet about how to write the matrix; reading the columns as where the basis goes is the step that connects a map to its entries.',
      },
      {
        concept: 'matrixTransform2d',
        note: 'Both treat a matrix as a map of the plane. This claim is about what any such map keeps unchanged; that one is about how the entries of the matrix encode where the basis vectors go.',
      },
      {
        concept: 'eigenvectorDirection',
        note: 'Straight lines staying straight holds for every line under a linear map. Eigenvectors are the special directions whose points also stay on their own line through the origin.',
      },
      {
        concept: 'matrixOps',
        note: 'One map moving the plane is the unit; chaining two maps and comparing orders is built out of it.',
      },
    ],
  },
};
