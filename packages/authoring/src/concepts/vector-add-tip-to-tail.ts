/**
 * vectorAddTipToTail 개념 선언.
 *
 * canonical facet 은 `facet:vectorAddTipToTail` — 한 주장을 말하는 조각(piece) facet.
 * a = (3, 1) · b = (1, 2) · c = (−2, 1) 가 원점에 모여 있다가 b 가 a 의 머리에, c 가 b 의 새 머리에 꼬리를
 * 붙이고, 마지막에 원점에서 (2, 4) 까지 합 화살표 하나가 그어진다. 그 끝은 성분끼리 더한 수와 같다.
 *
 * ── 묶음 안에서의 자리 (가 · 벡터와 그래프 — 완제품 없음, origin vector-ops)
 *
 * 이쪽은 **서로 다른 화살표를 잇는 것과 그 지름길(합)** 을 쥔다 — 덧셈 · 잇기 · 합 · 누적 · 성분끼리의 합
 * 낱말을 독점한다. "어디에 두어도 같은 화살표" 는 vectorAsArrow 의 말이라 definition 에 넣지 않는다.
 *
 * 전제: 세 벡터와 잇는 차례는 예로 정한 값이다. 차례를 바꿔도 끝이 같다는 교환 법칙은 화면이 보이지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const vectorAddTipToTailConcept: FacetConceptSource = {
  id: 'vectorAddTipToTail',
  label: 'Vector Addition, Tip to Tail',
  canonicalFacet: 'facet:vectorAddTipToTail',

  surface: {
    definition:
      'Vectors add by attaching each tail to the previous head; the arrow from the first tail to the last head is the sum, whose coordinates are the componentwise sums.',
    exemplarKeywords: [
      'vector addition',
      'head-to-tail method',
      'tip-to-tail rule',
      'resultant vector',
      'sum of vectors',
      'componentwise addition',
      'adding forces',
      'net displacement',
      'polygon rule for vectors',
      'a + b + c',
    ],
  },

  briefing: {
    observable: [
      'The first frame has three arrows all starting at the origin: `a (3, 1)`, `b (1, 2)`, `c (−2, 1)`. Beside them a table lists each vector’s x and y, and a "Running total" reads `3, 1` — `a` stays where it is as the first link.',
      'Step 1: the tail of `b` moves onto the head of `a` at `(3, 1)`; its head lands at `(4, 3)` and the running total becomes `4, 3`.',
      'Step 2: the tail of `c` moves onto `(4, 3)`; because its x is negative the path bends back left, ending at `(2, 4)`, and the running total becomes `2, 4`.',
      'Step 3: one arrow is drawn straight from the origin to `(2, 4)`, labelled `a + b + c = (2, 4)`, and the table shows `x 3 + 1 + (−2) = 2` and `y 1 + 2 + 1 = 4` — the picture and the column sums land on the same point.',
      'The last frame also reads "Joined path: 7.63" and "Sum arrow: 4.47": the chain is longer than the arrow that replaces it, since the sum keeps only where the path ends.',
      'The three vectors and the order a → b → c are example values. Only one order is played, so the commutative law is not on display.',
    ],

    screen: {
      affordances: [
        'The screen plays four steps by itself (the first frame counted) and stops once the sum arrow is drawn.',
        'A Replay button and a playback strip sit below. Scrubbing back and forth between steps 1 and 2 shows the running total moving with each attachment.',
      ],
    },

    useWhen: [
      'The reader can add vectors column by column but has no picture of what the result is. Watching the chained arrows end exactly at the componentwise sum ties the arithmetic to the drawing.',
      'The article explains a resultant — net force, total displacement — and needs to show that a winding path of pushes is replaced by one straight arrow whose length is shorter than the path.',
    ],

    avoidWhen: [
      'The article is about subtracting vectors or the parallelogram rule for two vectors. Three vectors are joined in a chain here; no difference vector and no parallelogram appear.',
      'The point is that the order of addition does not matter. Only one order is played.',
      'The subject is adding numbers in an array or summing a list in code. This is geometric vector addition.',
    ],

    contrastWith: [
      {
        concept: 'vectorAsArrow',
        note: 'That an arrow keeps its meaning wherever it is drawn is what makes chaining legal; addition then uses that freedom to combine different displacements into one.',
      },
      {
        concept: 'matvecAsCombination',
        note: 'A matrix times a vector is also a sum of arrows, but each arrow is a column first scaled by a coefficient; plain addition joins fixed arrows with no weights.',
      },
      {
        concept: 'vectorScale',
        note: 'Addition combines two different vectors into a new one pointing elsewhere; scaling changes one vector’s length and keeps its line.',
      },
    ],
  },
};
