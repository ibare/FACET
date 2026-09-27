/**
 * svdThreeSteps 개념 선언.
 *
 * canonical facet 은 `facet:svdThreeSteps` — 행렬 A = [[3, 0], [4, 5]] 가 단위원을 기운 타원으로 바꾸는 한 번의 변환을
 * Vᵀ(−45.00° 회전) → Σ(가로 6.708 배 · 세로 2.236 배) → U(+71.57° 회전) 세 동작으로 쪼개고, 마지막 걸음에 A 를 한 번에
 * 곱한 모양이 점선으로 겹쳐 차이 0.000 · 넓이 15 배(= det A) 를 보인다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리 (완제품 svd 아래 조각 둘)
 *
 * 완제품 `svd` 는 수의 표를 특이값 겹으로 나누어 쌓을 때 **몇 겹에서 서는지가 σ 가 주는 빠르기에 달렸다**를,
 * 조각 `lowRankApprox` 는 한 표에서 작은 겹부터 **버릴 때** 무엇이 남는가를 맡는다. 이쪽은 표도 겹도 없이 2×2 변환
 * 하나를 **기하로** 쪼갠다 — rotation · stretch along axes · rotation · unit circle · ellipse · semi-axes 를 독점하고,
 * layers · drop · decay · approximation 을 쓰지 않는다.
 *
 * 전제 (설명 글 `svdThreeSteps.md`):
 *  - 예로 정한 행렬 하나, 2×2 다. det A = 15 > 0 이라 U · V 를 둘 다 회전으로 잡았다 — det 이 음수면 뒤집기가 하나 낀다.
 *  - 부호 규약(v₁ 의 각을 (−90°, 90°] 에서 고른다)이 다르면 각의 부호나 180° 가 달라질 수 있다.
 *  - 원은 표본점 일흔둘이고 "같다" 는 점마다 1e−9 안이라는 뜻이다. 한 행렬의 사례가 일반을 증명하지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const svdThreeStepsConcept: FacetConceptSource = {
  id: 'svdThreeSteps',
  label: 'SVD as Rotate, Stretch, Rotate',
  canonicalFacet: 'facet:svdThreeSteps',

  surface: {
    definition:
      'The singular value decomposition A = UΣVᵀ read geometrically: a 2x2 linear map is a rotation, a stretch along the two axes by the singular values, then another rotation, turning the unit circle into an ellipse.',
    exemplarKeywords: [
      'singular value decomposition',
      'U Σ Vᵀ',
      'geometric interpretation of SVD',
      'rotation scaling rotation',
      'unit circle to ellipse',
      'singular values are the semi-axes',
      'right and left singular vectors',
      'product of singular values equals determinant',
      'orthogonal matrices as rotations',
    ],
  },

  briefing: {
    observable: [
      'The matrix "A = [3 0 ; 4 5]" is written as "= U · Σ · Vᵀ", with three labelled moves: "Vᵀ rotate −45.00°", "Σ stretch ×6.708 ×2.236", "U rotate +71.57°". The plane holds the unit circle and two marked vectors v₁ (0.707, 0.707) and v₂ (−0.707, 0.707), at 45.00° and 135.00°.',
      'Move 1, "Vᵀ rotates everything by −45.00°": the circle stays a circle and v₁, v₂ come to rest on the axes at (1.000, 0.000) and (0.000, 1.000), both still of length 1.000.',
      'Move 2, "Σ stretches along the two axes": ×6.708 along x and ×2.236 along y, and the circle becomes an ellipse lined up with the axes.',
      'Move 3, "U rotates everything by +71.57°": the ellipse tilts, and v₁, v₂ land at (2.121, 6.364) and (−2.121, 0.707).',
      'The last step overlays A applied to the circle "in one move" as a dotted shape, and the caption reads "A applied in one move lands on the same shape. · Largest gap: 0.000 · Area ×15.000 (det A = 15)".',
      'One matrix with positive determinant is shown, so both outer moves are rotations; the matrix is a chosen example, the circle is drawn from 72 sample points, and the screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays itself, five steps including the opening, about fourteen seconds, and stops on the overlay.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging between steps 1 and 2 shows the only move that changes the shape, and the last step sets the three-move result against the one-move result.',
        'The matrix and every angle and factor are fixed, so an article can quote them exactly as they appear.',
      ],
    },

    useWhen: [
      'The article writes A = UΣVᵀ and the reader sees three matrices without a picture. Watching the unit circle rotate, stretch into an axis-aligned ellipse and rotate again gives each factor one visible job.',
      'The prose claims that the singular values are the lengths of the ellipse axes and that their product is the area factor, and wants 6.708 × 2.236 = 15 next to det A = 15.',
    ],

    avoidWhen: [
      'The subject is SVD of large data matrices, image compression or truncating to a few singular values. Nothing is discarded here and the matrix is 2×2.',
      'The article needs a matrix with negative determinant, where a reflection enters the decomposition. This one is positive.',
      'The point is eigenvectors, directions a matrix leaves on their own line. The singular vectors here are rotated to the axes first; none of them stays in place.',
    ],

    contrastWith: [
      {
        concept: 'svd',
        note: 'The factorisation into rotations and a stretch is what a single term of the decomposition means; summing those terms as rank-one layers and asking how many a matrix needs is a separate question about how large the remaining singular values are.',
      },
      {
        concept: 'lowRankApprox',
        note: 'Splitting a map into rotate, stretch and rotate loses nothing; low-rank approximation starts from that split and deliberately drops the smallest stretches.',
      },
      {
        concept: 'eigenvectorDirection',
        note: 'An eigenvector keeps its direction under the matrix itself; a singular vector is carried to a possibly different direction but at right angles to its partner, which is why every real matrix has singular vectors while not every one has real eigenvectors.',
      },
      {
        concept: 'determinantZeroCollapse',
        note: 'When the determinant is zero one singular value is zero and the ellipse flattens to a segment; with both singular values positive, as here, the map keeps two dimensions.',
      },
      {
        concept: 'inverseUndoes',
        note: 'Undoing a map means undoing each of the three moves in reverse order, rotating back and dividing by each singular value, which is possible only while none of them is zero.',
      },
      {
        concept: 'matrixTransform2d',
        note: 'Reading a 2x2 matrix by where its columns send the basis vectors describes the whole map at once; the decomposition rewrites the same map as three simpler moves with their own angles and factors.',
      },
    ],
  },
};
