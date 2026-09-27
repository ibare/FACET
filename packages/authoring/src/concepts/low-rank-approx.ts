/**
 * lowRankApprox 개념 선언.
 *
 * canonical facet 은 `facet:lowRankApprox` — 6 행 7 열 수의 표(하트 모양) 하나를 특이값 분해로 여섯 겹으로 가르고,
 * **가장 작은 겹부터** 한 겹씩 버린다. 처음 세 번은 반올림해 같은 칸이 42 · 42 · 41 로 거의 그대로이고, 넷째 · 다섯째
 * 버림에서 22 · 11 로 무너진다. 겹 하나(A_1)에서 멈춘다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리 (완제품 svd 아래 조각 둘)
 *
 * 완제품 `svd` 는 그림 넷을 견주어 **몇 겹이면 서는지를 σ 가 주는 빠르기가 정한다**를, 조각 `svdThreeSteps` 는
 * 한 변환의 기하(돌리고 · 늘이고 · 돌리고)를 맡는다. 이쪽은 표 하나에서 **버리는 동작**과 그 값 — 오차가 버린 σ 들의
 * 제곱합의 제곱근이라는 것, 작은 것을 버리는 동안은 싸고 큰 것을 버리면 무너진다는 것 — 을 쥔다. 그래서 definition 은
 * truncated · discarding smallest · error equals discarded singular values · collapses 를 독점하고, 완제품의
 * decay · depends on the picture · simple-looking 을 쓰지 않는다.
 *
 * 전제 (설명 글 `lowRankApprox.md`):
 *  - 표는 예로 정한 것이다 — 일부러 좌우가 조금 어긋나게 적었다 (좌우가 같으면 겹이 넷으로 준다).
 *  - 오차는 프로베니우스 노름 ‖A − A_k‖ / ‖A‖ (‖A‖ = 36.414). "반올림해 같은 칸" 은 모양을 세는 한 방법일 뿐이다.
 *  - 칸 값은 0..9 밖(−0.7 .. 9.94)으로 나가며 음수 칸은 다른 색으로 칠한다. 한 표의 사례가 일반을 증명하지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const lowRankApproxConcept: FacetConceptSource = {
  id: 'lowRankApprox',
  label: 'Low-Rank Approximation: Dropping the Smallest Singular Values',
  canonicalFacet: 'facet:lowRankApprox',

  surface: {
    definition:
      'Truncating an SVD by discarding the smallest singular-value terms first barely changes a matrix until large ones go, since the error equals the root of the sum of squares of the discarded singular values.',
    exemplarKeywords: [
      'low-rank approximation',
      'truncated SVD',
      'rank-k approximation',
      'Eckart–Young theorem',
      'discard small singular values',
      'SVD image compression',
      'best approximation in Frobenius norm',
      'approximation error from dropped singular values',
      'how much can be thrown away',
    ],
  },

  briefing: {
    observable: [
      'On the left is the current table, 6 rows by 7 columns of a heart shape, with each cell\'s value written in it and shaded by its size; the heading reads "Sum of the first 6 layers". On the right the six layers sit under "Kept layers" as σ₁ 34.864, σ₂ 9.884, σ₃ 3.326, σ₄ 1.042, σ₅ 0.692, σ₆ 0.401, with "Dropped layers" empty.',
      'The opening caption reads "The table is the sum of its layers, largest σ first. Layers: 6" and "Layers left: 6 · Error: 0.0% · Same after rounding: 42/42".',
      'Each step the smallest remaining layer slides from "Kept layers" to "Dropped layers" ("Dropped the smallest layer left: σ₆ = 0.401") while the cell values flow from their old to their new values. A cell that no longer rounds to its original value gets a red outline.',
      'Dropping σ₆, σ₅ and σ₄ gives errors of 1.1 %, 2.2 % and 3.6 % with 42, 42 and 41 of 42 cells still rounding to the original.',
      'Dropping σ₃ = 3.326 takes the error to 9.8 % and the matching cells to 22; dropping σ₂ = 9.884 leaves only the first layer, "Layers left: 1 · Error: 28.9% · Same after rounding: 11/42", a smooth mound where rows and columns rise and fall together.',
      'Cell values drift outside 0 to 9 (down to −0.7, up to 9.94) and negative cells are shaded in a different colour rather than clipped. The table is a chosen example, the error is the Frobenius norm, and the screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays itself, six steps including the opening, about thirteen seconds, and stops with one layer left.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging between the third and fifth steps shows the table holding and then giving way as the dropped σ jumps from 1.042 to 3.326 to 9.884.',
        'The table and all its layers are fixed, so an article can quote the singular values, errors and cell counts exactly.',
      ],
    },

    useWhen: [
      'The article explains compressing an image or matrix by keeping only the top singular values and needs the moment it stops being free: three layers go with the error under 4 %, and the next one alone nearly triples it.',
      'The prose states that the approximation error equals the size of the discarded singular values, and wants a table where each dropped σ and the resulting error can be read side by side.',
    ],

    avoidWhen: [
      'The subject is choosing a rank across many different matrices or images. One table is shown.',
      'The article is about PCA or projecting data points onto fewer axes. There are no points, axes or projections, only a grid of numbers.',
      'The point is low-rank methods that fill in missing entries, such as matrix completion for recommendations. Every cell of this table is known.',
    ],

    contrastWith: [
      {
        concept: 'svd',
        note: 'Discarding the smallest terms of one matrix shows what truncation costs; comparing several matrices shows that the number of terms needed differs from matrix to matrix, and that a simple-looking one can need them all.',
      },
      {
        concept: 'svdThreeSteps',
        note: 'Reading one decomposition as rotate, stretch, rotate keeps every singular value; low-rank approximation throws the smallest stretches away and accepts the error that follows.',
      },
      {
        concept: 'projectAndLose',
        note: 'Projecting points onto a line loses their distances from it; dropping singular-value terms loses the finer structure of a matrix, and the loss is measured over the whole table rather than point by point.',
      },
      {
        concept: 'pca',
        note: 'Keeping the top principal components of centred data is a low-rank approximation read as axes of variation; truncating a table\'s decomposition reads the same idea as layers of the table itself.',
      },
    ],
  },
};
