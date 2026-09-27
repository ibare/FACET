/**
 * extraDimensionForTranslate 개념 선언.
 *
 * canonical facet 은 `facet:extraDimensionForTranslate` — 옮김 (3, −1) 을 3×3 행렬의 셋째 열에 넣고, 점 셋
 * o (0, 0) · p (1, 2) · q (−2, 1) 에 셋째 칸 1 을 붙인 뒤(lift) 한 점씩 곱한다(multiply). 셋째 열 × 1 = (3, −1) 이
 * x · y 에 더해져 원점 o 도 (3, −1) 로 떠난다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `scaleRotateTranslate` 는 3×3 인수 셋을 여러 순서로 합성한다. 이쪽은 그 앞 — **왜 칸 하나를 더하면 옮김이
 * 곱이 되는가** 하나만 말한다. 형제와 가르는 낱말은 appended 1 · third column · 2x2 cannot move the origin 이고,
 * 순서 · 중심(완제품) · 같은 벡터의 합(translateSlides) · w 로 나눔(wDivide)은 쓰지 않는다. 여기서 셋째 칸은 늘 1 이다.
 *
 * 전제 (설명 글 `extraDimensionForTranslate.md`): x 오른쪽 · y 위, 열 벡터에 왼쪽 곱. 셋째 칸이 1 이 아닌 좌표를 w 로
 * 나누는 이야기는 다루지 않는다. 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const extraDimensionForTranslateConcept: FacetConceptSource = {
  id: 'extraDimensionForTranslate',
  label: 'An Extra Coordinate Makes Translation a Matrix Product',
  canonicalFacet: 'facet:extraDimensionForTranslate',

  surface: {
    definition:
      'No 2x2 matrix can move the origin, but appending a third coordinate 1 to each point lets a 3x3 matrix translate: its third column multiplies that 1 and is added to x and y.',
    exemplarKeywords: [
      'homogeneous coordinates',
      'translation matrix',
      'augmented matrix for affine transform',
      'why 3x3 matrices for 2D graphics',
      'why 4x4 matrices in 3D graphics',
      'translation is not linear',
      'append w = 1',
      'affine transformation as a matrix',
      'third column holds the offset',
      'OpenGL 4x4 transform matrix',
    ],
  },

  briefing: {
    observable: [
      'The caption opens with "Shift (3, −1) → third column of a 3×3 matrix", and the matrix reads rows 1 0 3 · 0 1 −1 · 0 0 1. Three points are listed: o (0, 0), p (1, 2), q (−2, 1).',
      'The first step reads "Attach a third entry 1 to every point: (x, y) → (x, y, 1)", and each point in the list gains a third entry 1.',
      'Then one point per step is multiplied: "o: (0, 0, 1) → (3, −1, 1)", "p: (1, 2, 1) → (4, 1, 1)", "q: (−2, 1, 1) → (1, 0, 1)". Each step adds "Third column × 1 = (3, −1), added to x and y".',
      'The origin o itself leaves for (3, −1) — the move no 2x2 matrix can make, since any 2x2 matrix times (0, 0) is (0, 0). All three points travel the same (3, −1) on the plane.',
      'The upper-left 2x2 of the matrix is the identity, so x and y are carried over unchanged; the whole shift comes from the third column meeting the appended 1. The bottom row 0 0 1 leaves that 1 as 1, so each result can be read straight back as a plane point.',
      'Coordinates have y pointing up and matrices multiply column vectors from the left. The third entry is always 1 here; coordinates whose third entry is not 1, and dividing by it, are outside this screen.',
    ],

    screen: {
      affordances: [
        'The screen plays the lift and the three products by itself and stops after q.',
        'A Replay button and a playback strip sit below it. Holding the step for o shows the origin itself leaving, with the third-column contribution spelled out.',
        'The matrix and points are fixed small integers, so an article can quote every product exactly as it appears.',
      ],
    },

    useWhen: [
      'The reader asks why graphics uses 3x3 matrices for 2D, or 4x4 for 3D, when the space has one fewer dimension, and the article needs the extra 1 doing visible work.',
      'The article states that translation is not a linear map and needs to show how appending a coordinate turns it into a matrix product anyway, origin included.',
    ],

    avoidWhen: [
      'The article is about combining several transforms or the order of multiplication. A single translation matrix is applied here.',
      'The subject is dividing by w, points at infinity, or perspective. The third entry stays exactly 1 on this screen.',
      'The point is translation in 3D with 4x4 matrices. The example is in the plane with a 3x3 matrix.',
    ],

    contrastWith: [
      {
        concept: 'translateSlides',
        note: 'Translation adds the same vector to every point; the extra coordinate is only a way to write that addition as a matrix product.',
      },
      {
        concept: 'scaleRotateTranslate',
        note: 'Making translation a matrix is the precondition; composition is what that buys, since scale, rotation and shift can then be multiplied into one matrix whose factor order matters.',
      },
      {
        concept: 'wDivide',
        note: 'Here the appended coordinate is fixed at 1, so the result is already a plane point. When that coordinate can be other values, the point is recovered by dividing by it.',
      },
      {
        concept: 'matrixTransform2d',
        note: 'A 2x2 matrix is a linear map and must send the origin to itself. Adding a third coordinate is exactly what escapes that constraint.',
      },
      {
        concept: 'rowTimesColumn',
        note: 'Each entry of a product is a row paired term by term with a column. Here that rule is used to explain one thing: the constant 1 pairs with the offset entries, which is how the shift gets added.',
      },
    ],
  },
};
