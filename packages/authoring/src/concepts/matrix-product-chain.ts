/**
 * matrixProductChain 개념 선언.
 *
 * canonical facet 은 `facet:matrixProductChain` — 점 셋이 H = [1 1 ; 0 1](먼저) 로 한 번, S = [1 0 ; 0 2](다음) 로
 * 또 한 번 뛴다. 두 기호가 곱 카드로 날아가 SH = [1 1 ; 0 2] 가 되고, SH 로 처음 자리에서 한 번에 뛰면 3 / 3 같은 곳,
 * 차례를 바꾼 HS = [1 2 ; 0 2] 로 뛰면 0 / 3. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `matrixOps` 는 이 한 짝(H 먼저 · S 다음)을 36 짝으로 늘려 차례 · 되돌림 · 납작을 견준다. 이쪽의 한 동사는
 * 「두 번 가던 길을 한 번에 간다」, 질문은 「그 한 행렬은 두 행렬을 어느 차례로 곱한 것인가」다.
 * 그래서 definition 은 one after another · single matrix · written on the right · one jump 을 쥐고,
 * pair · cancel · flattening · commute 를 쓰지 않는다 (차례를 바꾼 뜀은 observable 에만 둔다).
 *
 * 전제: 두 행렬 · 점 셋은 예로 정한 값이다. 결합 법칙 (SH) p = S (H p) 는 일반에 서지만 이 화면은 증명하지 않는다.
 * 차례를 바꾼 곱이 늘 다른 곳에 닿는 것도 아니다 — 바꿔 걸어도 같은 짝이 있다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const matrixProductChainConcept: FacetConceptSource = {
  id: 'matrixProductChain',
  label: 'Matrix Product as Composition (Two Jumps, One Matrix)',
  canonicalFacet: 'facet:matrixProductChain',

  surface: {
    definition:
      'Doing one transformation and then another equals a single matrix, their product with the first-applied matrix written on the right; one jump by that product lands exactly where two jumps did.',
    exemplarKeywords: [
      'matrix multiplication as composition',
      'composite transformation',
      'function composition order',
      'right-to-left order of matrix product',
      'S(Hx) = (SH)x',
      'combine two transformations into one matrix',
      'why multiply matrices',
      'shear then scale',
    ],
  },

  briefing: {
    observable: [
      'Three points start at (1, 1), (2, −1), (−1, 2) on a small grid. Two matrix cards sit side by side — S on the left, labelled "then · doubles height", and H on the right, labelled "first · slides sideways" — in the order the product is written. The caption reads "First H, then S."',
      'The points jump twice: "One jump by H: (2, 1) · (1, −1) · (1, 2)", then "One jump by S: (2, 2) · (1, −2) · (1, 4)".',
      'The two symbols fly into a product card: "First H, then S — one matrix: SH", with SH = [1 1 ; 0 2]. The entries of the product appear finished; how each entry is calculated is not shown.',
      'From the starting places the points jump once by SH and land on (2, 2), (1, −2), (1, 4): "Same place as the two jumps: 3 / 3".',
      'Finally the symbols cross over to form HS = [1 2 ; 0 2], and one jump by it lands on (3, 2), (0, −2), (3, 4): "Same place as the two jumps: 0 / 3".',
      'H, S and the three points are chosen examples. That one jump by the product matches two jumps holds for all matrices and points; that swapping the order changes the result does not always hold, since some pairs give the same product either way. The screen does not footnote either point.',
    ],

    screen: {
      affordances: [
        'The screen plays six steps on its own and stops.',
        'A Replay button and a playback strip sit below it. Scrubbing between the second jump and the single SH jump shows the two routes ending on the same three spots.',
        'The matrices and points are fixed, so an article can quote the product entries and every coordinate exactly.',
      ],
    },

    useWhen: [
      'The article introduces matrix multiplication by what it is for — replacing two transformations applied in turn with one — rather than by the entry-by-entry rule.',
      'A reader keeps writing the product in the order the maps were applied and needs to see that "first H, then S" is SH, with the first one on the right.',
    ],

    avoidWhen: [
      'The article is about computing a product entry from a row and a column. The entries appear without their arithmetic.',
      'The subject is undoing a transformation or inverse matrices. Neither map here undoes the other.',
      'The topic is chaining many transforms in graphics pipelines with translation. Both maps are 2×2 and fix the origin.',
    ],

    contrastWith: [
      {
        concept: 'matrixOps',
        note: 'One pair shows that two maps in sequence are one product and that its order is fixed by the sequence. Varying the pair is what answers when swapping the order does or does not matter.',
      },
      {
        concept: 'rowTimesColumn',
        note: 'Row-times-column is how the entries of a product are obtained; composition is what the product means once it is obtained.',
      },
      {
        concept: 'inverseUndoes',
        note: 'Composing a map with its inverse is the special case where the product does nothing at all. In general the product is a new map, and this claim is about that general case.',
      },
      {
        concept: 'matrixAsTransform',
        note: 'A single matrix moving the plane is the building block; composition is the rule for replacing two such moves with one.',
      },
    ],
  },
};
