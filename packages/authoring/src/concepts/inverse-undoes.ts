/**
 * inverseUndoes 개념 선언.
 *
 * canonical facet 은 `facet:inverseUndoes` — 점 셋이 A = [3 1 ; 1 1] 로 제자리를 떠나고, det 2 로 셈한
 * A⁻¹ = 1/2 · [1 −1 ; −1 3] = [0.5 −0.5 ; −0.5 1.5] 로 옮기면 셋 모두 떠나기 전 자리로 돌아와 남은 거리 0.
 * 마지막에 A⁻¹A = [1 0 ; 0 1] 을 적는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `matrixOps` 는 되돌리는 짝을 손잡이로 찾는다(역행렬을 셈하지 않는다). 이쪽은 **주어진 행렬 하나의 역행렬을 셈해
 * 걸고, 정말 돌아오는지 본다.** 형제 `determinantZeroCollapse` 는 역행렬이 없는 쪽이라 여기서 꺼내지 않는다.
 * 그래서 definition 은 inverse · 1 / (ad − bc) · swapped · back to where it started · identity 를 쥐고,
 * pair · order · same spot 을 쓰지 않는다.
 *
 * 전제: 행렬 · 점 셋은 예로 정한 값이다. A⁻¹(A p) = (A⁻¹A) p = p 이라 어느 점이든 같다 — 설명 글이 밝힌다.
 * 수는 정수이거나 0.5 의 배수라 반올림이 끼지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const inverseUndoesConcept: FacetConceptSource = {
  id: 'inverseUndoes',
  label: 'The Inverse Matrix Brings Points Back',
  canonicalFacet: 'facet:inverseUndoes',

  surface: {
    definition:
      'The inverse of a 2×2 matrix, one over ad − bc times the matrix with a and d swapped and b and c negated, sends every moved point back where it started; inverse times matrix is the identity.',
    exemplarKeywords: [
      'inverse matrix',
      '2x2 inverse formula',
      'A⁻¹A = I',
      'identity matrix',
      'undo a linear transformation',
      'adjugate divided by determinant',
      'invertible matrix',
      'reverse a transformation',
    ],
  },

  briefing: {
    observable: [
      'Three points (1, 2), (−2, 1), (1, −1) each leave an empty ring at their starting place, beside A = [3 1 ; 1 1]. The caption reads "Start — points at their place: 3".',
      'A moves them to (5, 3), (−5, −1), (2, 0), with a string stretched from each ring to its point: "After A — points that left their place: 3 / 3".',
      'The inverse is computed on screen: "Computing A⁻¹ — det A = ad − bc = 2"; a and d trade places and b and c change sign to give [1 −1 ; −1 3], and A⁻¹ = 1/2 · [1 −1 ; −1 3] = [0.5 −0.5 ; −0.5 1.5].',
      'A⁻¹ applied to the moved points winds each string back into its ring: "After A⁻¹ — points back at their place: 3 / 3 · distance left: 0".',
      'The last step writes the two as one matrix: "A⁻¹A as one matrix — points it moves: 0 / 3", with A⁻¹A = [1 0 ; 0 1].',
      'The matrix and the three points are chosen examples; since A⁻¹(A p) = (A⁻¹A) p = p, every point would return. All numbers are integers or multiples of 0.5, so "back at their place" is exact equality. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays five steps on its own and stops.',
        'A Replay button and a playback strip sit below it. Scrubbing back and forth across the return step shows the strings winding in and every point settling into its ring.',
        'The matrix, its inverse and the points are fixed, so an article can quote every entry and coordinate exactly.',
      ],
    },

    useWhen: [
      'The article gives the 2×2 inverse formula and wants the reader to check that the matrix it produces really undoes the original on actual points.',
      'A reader needs to connect "inverse" with "identity": applying the inverse after the matrix is the same as applying a matrix that moves nothing.',
    ],

    avoidWhen: [
      'The article is about matrices that have no inverse. The determinant here is 2 and the inverse exists.',
      'The subject is computing inverses of larger matrices by Gauss–Jordan elimination. Only the 2×2 formula appears.',
      'The topic is the order of matrix products in general. Only A⁻¹A is written, and no other product.',
    ],

    contrastWith: [
      {
        concept: 'determinantZeroCollapse',
        note: 'The inverse formula divides by the determinant, and it exists only when no two points share a landing spot. The zero-determinant case is where both fail together.',
      },
      {
        concept: 'matrixOps',
        note: 'Computing the inverse of one given matrix answers "what undoes this?" directly. Among a set of chained maps, undoing is instead a property that only certain pairs turn out to have.',
      },
      {
        concept: 'matrixProductChain',
        note: 'Any two maps in sequence make one product; the inverse is the second map chosen so that the product is the identity.',
      },
      {
        concept: 'svdThreeSteps',
        note: 'Undoing a rotation, a stretch and another rotation one at a time in reverse is another route to the same inverse; this claim takes the direct 2×2 formula instead.',
      },
    ],
  },
};
