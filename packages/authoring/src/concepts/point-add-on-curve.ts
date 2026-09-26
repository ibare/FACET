/**
 * pointAddOnCurve 개념 선언.
 *
 * canonical facet 은 `facet:pointAddOnCurve` — 조각. 실수 위 곡선 y² = x³ − 7x + 10 위의 P (1, 2) · Q (3, 4) 를 곧은 선
 * (λ = 1)이 잇고, 선이 곡선을 셋째로 (−3, −2) 에서 만나고, 그 점을 x 축에 대해 뒤집은 (−3, 2) 가 P + Q 다. 끝에 곡선 위
 * 확인(2² = 4 = (−3)³ − 7·(−3) + 10). 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `ecc` 는 점 덧셈을 한 단위로 세어 kG 를 만드는 셈과 되찾는 셈을 견준다. 이쪽은 **덧셈 한 번의 모양** — 잇고 · 만나고 ·
 * 뒤집는다 — 과 결과가 곡선 위에 남는 까닭만 말한다. 그래서 definition 은 line · third intersection · reflect · stays on the curve
 * 쪽 낱말을 쥐고, 되풀이 · 비밀 · 셈 수 · 열쇠 길이는 쓰지 않는다.
 *
 * 전제 (설명 글 `pointAddOnCurve.md`): 곡선은 모양을 보이려고 실수 위에 그렸고 정수로 떨어지게 골랐다 · 4a³ + 27b² = 1328 ≠ 0 ·
 * 같은 점 더하기(접선)와 무한원점은 다루지 않는다 · 실물(secp256k1 · P-256)은 같은 식을 256 비트 소수 p 로 셈한다 — mod 17 로
 * 셈해도 P + Q 는 (14, 2).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pointAddOnCurveConcept: FacetConceptSource = {
  id: 'pointAddOnCurve',
  label: 'Adding Two Points on an Elliptic Curve',
  canonicalFacet: 'facet:pointAddOnCurve',

  surface: {
    definition:
      'Two points on an elliptic curve are added by drawing the line through them, finding where it meets the curve a third time, and reflecting that point across the x-axis, so the sum stays on the curve.',
    exemplarKeywords: [
      'elliptic curve point addition',
      'chord rule',
      'P + Q on a curve',
      'third intersection point',
      'reflect across the x axis',
      'slope lambda',
      'x3 = λ² − x1 − x2',
      'y² = x³ + ax + b',
      'elliptic curve group law',
      'why the sum stays on the curve',
    ],
  },

  briefing: {
    observable: [
      'A smooth curve y² = x³ − 7x + 10 drawn over the real numbers, with two marked points "P (1, 2)" and "Q (3, 4)". Opening caption: "Two points on the curve: P and Q".',
      'Step 1: "A straight line joins P and Q", with the working "λ = (4 − 2) / (3 − 1) = 1".',
      'Step 2: "The line meets the curve a third time" at (−3, −2), with "x = 1² − 1 − 3 = −3" and "y = 1 · (−3 − 1) + 2 = −2".',
      'Step 3: "Flip that point across the x axis: P + Q" — the third point drops to its mirror image "P + Q (−3, 2)" on the other side of the axis.',
      'The run closes with the on-curve check written out: "y² = 2² = 4" and "x³ − 7x + 10 = (−3)³ − 7·(−3) + 10 = 4". The two sides match, so the sum is on the curve.',
    ],

    screen: {
      affordances: [
        'The screen plays four steps on its own, counting the opening, and stops on the flipped point and the check.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip between the meet and flip steps shows the third point and its reflection one after the other.',
        'The curve and both points are fixed and every value is an integer, so the slope, the third point and the sum can be quoted exactly.',
      ],
    },

    useWhen: [
      'The reader asks what it can possibly mean to "add" two points in elliptic-curve cryptography, having tried adding the coordinates and landed off the curve.',
      'An article states the point-addition formulas (λ, x3 = λ² − x1 − x2, y3) and needs a picture that shows where each one comes from.',
      'The article wants to justify why the reflected point is still on the curve — the curve is symmetric about the x-axis because only y² appears.',
    ],

    avoidWhen: [
      'The article is about scalar multiplication, public keys kG, or why recovering k is hard. A single addition of two distinct points is all that happens.',
      'The subject is point doubling (the tangent case) or the point at infinity. Neither case appears.',
      'The point is that real elliptic-curve cryptography works over a finite field. The curve here is drawn over the real numbers.',
      'The article compares key lengths or security levels.',
    ],

    contrastWith: [
      {
        concept: 'ecc',
        note: 'Elliptic-curve cryptography repeats this operation to build a public point and compares that with recovering the secret; this concept stops at what one addition is and why it stays on the curve.',
      },
      {
        concept: 'smallerKeySameStrength',
        note: 'Both belong to elliptic-curve cryptography, but that one is a claim about key length for equal attack cost, while this one is the geometry of the underlying operation, with no key in sight.',
      },
    ],
  },
};
