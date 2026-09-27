/**
 * vectorScale 개념 선언.
 *
 * canonical facet 은 `facet:vectorScale` — 한 주장을 말하는 조각(piece) facet.
 * 화살표 v = (2, 1) 하나에 k = 1 · 2 · 3 · 0.5 를 차례로 곱한다. 머리가 원점을 지나는 한 줄 위를
 * 미끄러지고, "길이 ÷ 처음 길이" 는 셈한 두 길이를 나눈 값인데 매번 k 와 같으며 각은 26.6° 그대로다.
 *
 * ── 묶음 안에서의 자리 (가 · 벡터와 그래프 — 완제품 없음, origin vector-ops)
 *
 * 이쪽은 **화살표 하나 · 곱하는 수 여럿** 이다 — 스칼라 · k 배 · 늘고 준다 · 방향 그대로 낱말을 독점한다.
 * vectorNormalize 는 **화살표 여럿 · 저마다 다른 수 · 길이 1** 이라 단위 · 1 · 모인다 낱말을 여기서 쓰지 않는다.
 *
 * 전제: k 는 모두 양수다. "길이만 바뀐다" 는 양수 k 에서의 말이다 (음수면 방향이 뒤집힌다).
 * 표시 값은 소수 둘째 · 첫째 반올림이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const vectorScaleConcept: FacetConceptSource = {
  id: 'vectorScale',
  label: 'Scalar Multiplication of a Vector',
  canonicalFacet: 'facet:vectorScale',

  surface: {
    definition:
      'Multiplying one vector by a positive scalar k multiplies its length by exactly k and leaves its direction unchanged, so the tip only slides along a fixed line through the origin.',
    exemplarKeywords: [
      'scalar multiplication',
      'scalar times vector',
      'scaling a vector',
      'kv',
      'stretch or shrink a vector',
      'length scales by k',
      'same direction longer arrow',
      'parallel vectors',
      'velocity times time',
      'learning rate times gradient',
    ],
  },

  briefing: {
    observable: [
      'There is one arrow, `v = (2, 1)`, and a dashed line running from the origin along its direction.',
      'Step by step `k` becomes 1, 2, 3, then 0.5, and the head slides along that dashed line: `kv = (2, 1)`, `(4, 2)`, `(6, 3)`, `(1, 0.5)`. A caption says "Length grows" or "Length shrinks", and each visited k leaves a tick on the line.',
      'The readout shows the length `2.24`, `4.47`, `6.71`, `1.12` and "length ÷ original length" as a division of the two computed lengths — `4.47 ÷ 2.24 = 2`, `6.71 ÷ 2.24 = 3`, `1.12 ÷ 2.24 = 0.5` — matching k each time.',
      'An arc at the origin reads `26.6°` on every step; the angle is recomputed each time and never moves.',
      'All values of k are positive and chosen as examples; lengths are shown to two decimals and the angle to one. With a negative k the arrow would flip to the opposite side, which this screen does not show.',
    ],

    screen: {
      affordances: [
        'The screen plays four steps by itself (the first frame, k = 1, counted) and stops at k = 0.5.',
        'A Replay button and a playback strip sit below; stepping between k = 3 and k = 0.5 shows the same arrow first long, then shorter than it started, on the same line.',
      ],
    },

    useWhen: [
      'The article writes kv = (k·x, k·y) and the reader cannot see what that does to the arrow. Seeing the length ratio equal k while the angle stays at 26.6° answers it.',
      'A later idea depends on "same direction, different size" — a step size times a direction, a speed times a heading — and the reader needs that separation made visible first.',
    ],

    avoidWhen: [
      'The point involves negative scalars or reversing direction. Every k shown is positive.',
      'The article is about making vectors unit length. That divides several vectors by different amounts; here one vector takes a series of chosen factors.',
      'The subject is scaling an image or a shape by a transformation matrix. This multiplies a single vector by a number, not a plane by a matrix.',
    ],

    contrastWith: [
      {
        concept: 'vectorNormalize',
        note: 'Normalizing is scaling with a factor chosen per vector — one over its own length — so that different vectors meet at length one; plain scaling picks the factor freely and applies it to one vector.',
      },
      {
        concept: 'eigenvectorDirection',
        note: 'An eigenvector is a vector that a matrix merely scales. Scaling by a number is the action itself; the eigenvector question is which directions a matrix leaves on their own line.',
      },
      {
        concept: 'vectorAddTipToTail',
        note: 'Scaling keeps one vector on its line and changes its size; adding two different vectors produces a new direction.',
      },
    ],
  },
};
