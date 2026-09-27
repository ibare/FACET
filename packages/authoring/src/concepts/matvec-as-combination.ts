/**
 * matvecAsCombination 개념 선언.
 *
 * canonical facet 은 `facet:matvecAsCombination` — 2×3 행렬 A = [1 2 −2 ; 2 −1 2] 와 v = (2, −1, 0.5).
 * v 의 수 셋이 A 의 열 셋에 하나씩 무게로 걸려(늘고 · 뒤집히고 · 준다) 합에 더해지고, 합 (−1, 6) 이 곧 A v 다.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 형제 `matrixColumnsAreBasis` 는 열을 **만드는** 쪽, 이쪽은 열을 **쓰는** 쪽이다. 행렬을 변환(점이 옮겨 가는 그림)으로
 * 말하지 않고, 행으로 읽는 셈(`rowTimesColumn`)도 두지 않는다. 그래서 definition 은 weights · stretched · flipped ·
 * shrunk · added · linear combination 을 쥐고, rule · basis · plane · moves 를 쓰지 않는다.
 * 행렬이 정사각이 아닌 것은 「열이 여럿 섞인다」가 기저 둘의 이야기로 읽히지 않게 하려는 사양의 뜻이다.
 *
 * 전제: A 와 v 는 예로 정한 값이다. 0.5 배의 셈만 소수가 나오며 정확히 떨어진다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const matvecAsCombinationConcept: FacetConceptSource = {
  id: 'matvecAsCombination',
  label: 'Matrix Times Vector as a Weighted Sum of Columns',
  canonicalFacet: 'facet:matvecAsCombination',

  surface: {
    definition:
      'A matrix times a vector is a linear combination of the matrix\'s columns: each entry of the vector weights one column, stretching, flipping or shrinking it, and the weighted columns are added.',
    exemplarKeywords: [
      'linear combination of columns',
      'column picture of Ax',
      'Ax as a combination of columns',
      'matrix-vector multiplication intuition',
      'column space',
      'scalar multiple of a column',
      'non-square matrix times vector',
      'weights on columns',
    ],
  },

  briefing: {
    observable: [
      'The matrix A has three columns, (1, 2), (2, −1) and (−2, 2), and v has three entries, 2, −1 and 0.5; the answer is a pair of numbers, since A has two rows. A running Sum starts at (0, 0). Each column is drawn as a pair of bars (top entry, bottom entry), and the Sum has its own pair of bars.',
      'When a weight is applied, the column\'s original bars stay as a dashed outline so the change can be compared, and the weighted bars cross over into the Sum, which climbs like a staircase showing where each column\'s share started and ended.',
      'Step by step one entry of v is hung on one column as a weight, and the caption names the effect: "Column 1 × 2 stretches: (1, 2) → (2, 4). Sum: (2, 4)".',
      '"Column 2 × −1 flips: (2, −1) → (−2, 1). Sum: (0, 5)" — the negative weight turns the column around.',
      '"Column 3 × 0.5 shrinks: (−2, 2) → (−1, 1). Sum: (−1, 6)" — the fractional weight halves the column.',
      'The last step relabels the sum as the product: "Columns added: 3. A v = (−1, 6)". The row-by-row way of computing A v is not shown; it gives the same two numbers.',
      'A and v are one chosen example; the column reading holds for any matrix and vector of matching sizes.',
    ],

    screen: {
      affordances: [
        'The screen plays five steps on its own and stops.',
        'A Replay button and a playback strip sit below it. Scrubbing through the three weighting steps shows one column change size or direction and the running sum move each time.',
        'The matrix, the vector and every intermediate sum are fixed, so an article can quote them exactly.',
      ],
    },

    useWhen: [
      'The reader computes A v row by row and has never seen that the same answer is the columns of A mixed in the proportions given by v.',
      'The article introduces column space or span and needs a concrete case where each entry of the vector visibly scales one column before they are summed.',
    ],

    avoidWhen: [
      'The article teaches the row-times-column procedure for computing entries. That calculation is deliberately absent.',
      'The subject is a matrix as a transformation of the plane, with points moving. Nothing here moves points; only columns are weighted and added.',
      'The topic is adding two vectors tip to tail on their own, with no matrix involved.',
    ],

    contrastWith: [
      {
        concept: 'rowTimesColumn',
        note: 'Rows paired term by term with the vector give each entry of the answer separately; weighting and adding columns gives the whole answer vector at once. They are two readings of the same product.',
      },
      {
        concept: 'matrixColumnsAreBasis',
        note: 'Knowing that columns are the images of the basis is what makes the weighted-sum reading a statement about transformations; the weighted sum itself needs no basis and holds for non-square matrices too.',
      },
      {
        concept: 'vectorAddTipToTail',
        note: 'Adding vectors is the last operation of the combination; the combination claim is about the weights that reshape each column before that addition.',
      },
      {
        concept: 'dotProductShadow',
        note: 'A dot product collapses two vectors into one number and is what each row of a matrix-vector product computes; the column reading keeps the answer as a vector built from scaled columns.',
      },
      {
        concept: 'matrixOps',
        note: 'Chaining maps treats each matrix as a whole transformation; the column combination is the arithmetic meaning of applying a single matrix to a single vector.',
      },
    ],
  },
};
