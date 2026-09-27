/**
 * dotProductShadow 개념 선언.
 *
 * canonical facet 은 `facet:dotProductShadow` — 한 주장을 말하는 조각(piece) facet.
 * b = (3, 4) 는 멈춰 있고, 길이 5 인 a 가 b 와 겹친 자리에서 돌아 나가며 b 의 줄 위에 드리우는 그림자가
 * 5.0 → 4.8 → 3.0 → 0.0 → −4.0 → −5.0 으로 바뀐다. 걸음마다 성분 곱의 합 a·b 와 |b| × 그림자 가 따로 셈되어 같은 수로 선다.
 *
 * ── 묶음 안에서의 자리 (가 · 벡터와 그래프 — 완제품 없음, origin vector-ops)
 *
 * 이쪽은 **내적 · 성분 곱의 합 · 부호 있는 그림자(사영) 길이 · 직각에서 0 · 넘어가면 음수** 를 쥔다.
 * 외적(crossProductPerpendicular)은 곱해서 벡터가 나오고, 이쪽은 수가 나온다.
 * 이웃 분야: 잃는 거리는 projectAndLose, 길이를 나눈 닮음은 angleNotLength 의 말이라 definition 에 넣지 않는다.
 *
 * 전제: a 의 길이를 5 로 묶은 것은 그림자가 각만으로 바뀌게 하려는 예다. 그림자 · 각은 소수 첫째 반올림이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const dotProductShadowConcept: FacetConceptSource = {
  id: 'dotProductShadow',
  label: 'Dot Product as a Projection Shadow',
  canonicalFacet: 'facet:dotProductShadow',

  surface: {
    definition:
      'The dot product a·b, the sum of componentwise products, equals the signed length of a’s shadow on b’s line times |b|; it is zero at a right angle and negative beyond.',
    exemplarKeywords: [
      'dot product',
      'inner product',
      'scalar product',
      'geometric meaning of the dot product',
      'a·b = |a||b|cos θ',
      'scalar projection',
      'projection of a onto b',
      'orthogonal vectors have zero dot product',
      'negative dot product',
      'work = force · displacement',
    ],
  },

  briefing: {
    observable: [
      '`b = (3, 4)` stays fixed with `|b| = 5.0`. A vector `a` of length 5.0 starts on top of `b` at `(3, 4)` and turns away through `(4, 3)`, `(5, 0)`, `(4, −3)`, `(0, −5)`, `(−3, −4)`.',
      'A perpendicular drops from the head of `a` to the line of `b`; the stretch from the origin to its foot is the shadow. The angle between them reads `0.0°`, `16.3°`, `53.1°`, `90.0°`, `143.1°`, `180.0°`, and past shadows remain as ticks on the line.',
      'The shadow reads 5.0, 4.8, 3.0, 0.0, −4.0, −5.0. At 90.0° the caption says it has "shrunk to the origin"; after that it "crosses to the far side of the origin from b" and becomes negative.',
      'Two computations stand side by side each step: "Sum of component products" (for example `a·b = 4×3 + (−3)×4 = 0`) and "|b| × shadow" (`5.0 × 0.0 = 0.0`). They match on every step: 25, 24, 15, 0, −20, −25.',
      'The shadow is computed from the angle, not by dividing a·b by |b|, so the match is a result rather than a restatement. Holding |a| at 5 is an example choice that makes the shadow change with the angle alone; values are rounded to one decimal.',
    ],

    screen: {
      affordances: [
        'The screen plays six steps by itself (the first frame counted) and stops with `a` pointing opposite to `b`.',
        'A Replay button and a playback strip sit below. Holding the strip at the 90.0° step shows the dot product and the shadow both at zero together.',
      ],
    },

    useWhen: [
      'The article gives the formula a₁b₁ + a₂b₂ and the reader asks what the number means. Watching it equal |b| times a shadow that shortens as the angle opens gives it a place in the picture.',
      'The reader needs to see why a zero dot product means perpendicular and a negative one means "pointing away", before that sign is used in a test, a projection or a physics formula such as work.',
    ],

    avoidWhen: [
      'The article is about cosine similarity or ranking vectors by closeness. Lengths are not divided out here and nothing is ranked.',
      'The point is what information is lost when points are projected onto a line. Only the length of one shadow is reported.',
      'The subject is the cross product or any product that yields a vector. The result here is a single number.',
      'The subject is matrix multiplication in general; the dot product appears only between two 2D vectors.',
    ],

    contrastWith: [
      {
        concept: 'projectAndLose',
        note: 'Both drop a perpendicular onto a line. The dot product is about the length that is kept — it equals a·b divided by |b|; projection loss is about the perpendicular distance that is thrown away.',
      },
      {
        concept: 'angleNotLength',
        note: 'The dot product still carries both lengths; cosine similarity divides them out so only the angle is compared.',
      },
      {
        concept: 'crossProductPerpendicular',
        note: 'The dot product turns two vectors into a number that vanishes when they are perpendicular; the cross product turns two 3D vectors into a third vector that is perpendicular to both.',
      },
      {
        concept: 'matvecAsCombination',
        note: 'Each entry of a matrix-vector product is a dot product of a row with the vector; read by columns, the same product is a weighted sum of arrows instead.',
      },
    ],
  },
};
