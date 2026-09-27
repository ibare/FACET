/**
 * matrixColumnsAreBasis 개념 선언.
 *
 * canonical facet 은 `facet:matrixColumnsAreBasis` — 규칙 「반시계로 직각만큼 돈다 (x, y) → (−y, x)」만 알 때,
 * 빈 행렬 [? ? ; ? ?] 이 한 열씩 채워진다. 규칙이 (1, 0) 을 옮긴 자리가 1 열로, (0, 1) 을 옮긴 자리가 2 열로.
 * 끝에 시험 점 (2, 1) 을 규칙과 행렬 두 길로 옮겨 같은 자리 (−1, 2) 에 닿는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 이웃 `matrixTransform2d` 는 행렬에서 출발해 기저의 도착지를 읽는다 — 이쪽은 **규칙에서 출발해 행렬을 적는다**.
 * 형제 `matvecAsCombination` 은 행렬 곱하기 벡터가 열의 가중합이라는 셈을 말하고, 이쪽은 그 셈 과정을 보이지 않는다.
 * 그래서 definition 은 write down the matrix · rule · (1, 0) and (0, 1) · first and second column 을 쥐고,
 * weighted · sum · combination · 평면 전체가 휜다는 말을 쓰지 않는다.
 *
 * 전제: 규칙 하나 · 시험 점 하나는 예로 정한 값이다. 시험 점 하나가 맞았다고 모든 점에서 맞음이 증명되지는 않는다 —
 * 선형인 규칙이면 일반에 선다는 것은 설명 글이 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const matrixColumnsAreBasisConcept: FacetConceptSource = {
  id: 'matrixColumnsAreBasis',
  label: 'Writing a Matrix from a Rule: Columns Are Where the Basis Goes',
  canonicalFacet: 'facet:matrixColumnsAreBasis',

  surface: {
    definition:
      'To write down the matrix of a linear rule, apply the rule to (1, 0) and (0, 1) and stand the two results as the first and second column; that matrix then agrees with the rule elsewhere.',
    exemplarKeywords: [
      'standard basis vectors',
      'columns of a matrix are images of the basis',
      'find the matrix of a linear transformation',
      'derive the rotation matrix',
      'matrix of a 90 degree rotation',
      'i-hat and j-hat',
      'from a transformation rule to a matrix',
      'standard matrix',
    ],
  },

  briefing: {
    observable: [
      'At the start only the rule is on screen — "Rule: turn a right angle counterclockwise (x, y) → (−y, x)" — beside an empty matrix M = [? ? ; ? ?] whose two columns are labelled "from (1, 0)" and "from (0, 1)". The caption says "Only the rule is known. The matrix is empty."',
      'The rule moves (1, 0) on a small plane: "By the rule: (1, 0) → (0, 1)". The next step drops that result into the first column: "Column 1 = (0, 1)", and M becomes [0 ? ; 1 ?].',
      'The same happens for (0, 1): "By the rule: (0, 1) → (−1, 0)", then "Column 2 = (−1, 0)", and M is now [0 −1 ; 1 0]. The matrix entries are never written directly from the formula; each column arrives from one moved point.',
      'A test point checks the finished matrix by two routes: "Test point by the rule: (2, 1) → (−1, 2)", then "Same point by the matrix: (2, 1) → (−1, 2)", ending with "Rule (−1, 2) = matrix (−1, 2)".',
      'Only the landing spot of M (2, 1) is shown, not the arithmetic that produces it. The rule and the single test point are chosen examples; one matching point illustrates the agreement rather than proving it for every point.',
    ],

    screen: {
      affordances: [
        'The screen plays seven steps on its own and stops.',
        'A Replay button and a playback strip sit below it. Scrubbing back and forth over the two column-filling steps shows each moved point landing as a column while the other column is still "?".',
        'The rule, the basis points and the test point are fixed, so an article can quote every coordinate exactly.',
      ],
    },

    useWhen: [
      'The reader knows what a transformation does in words or as a formula and asks how to get its matrix; the screen builds the matrix column by column from two moved points.',
      'The article derives the 90-degree rotation matrix and wants the reader to see that it was found, not memorised, and then confirmed on a point that was not used to build it.',
    ],

    avoidWhen: [
      'The article starts from a given matrix and asks what it does to the plane. Here the matrix is the output, not the starting point.',
      'The subject is how a matrix-vector product is calculated. The screen shows only the resulting point, not the sum that produces it.',
      'The topic is change of basis between two non-standard bases. Only (1, 0) and (0, 1) are used.',
    ],

    contrastWith: [
      {
        concept: 'matrixTransform2d',
        note: 'Both rest on the fact that the columns are where the basis lands. Going from matrix to picture reads that fact off; going from rule to matrix uses it to construct the entries.',
      },
      {
        concept: 'matvecAsCombination',
        note: 'Columns being the images of the basis is why a matrix times a vector is a weighted sum of columns; this claim is about building the columns, that one about using them.',
      },
      {
        concept: 'matrixAsTransform',
        note: 'That a matrix moves the whole plane at once is taken as given here; the question is only how the rule\'s action on two points fixes all four entries.',
      },
      {
        concept: 'matrixOps',
        note: 'Composition asks what two known matrices do in sequence. Before that, each matrix has to be written down, which is what reading off the basis images does.',
      },
    ],
  },
};
