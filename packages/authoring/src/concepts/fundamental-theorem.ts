/**
 * fundamentalTheorem 개념 선언.
 *
 * canonical facet 은 `facet:fundamentalTheorem` — 곡선 f(t) = 3 − t 아래 넓이를 왼쪽 끝 0 에서 오른쪽 끝 x 까지 쌓아
 * 새 함수 A(x) 를 만들고, x 가 0 → 5 로 밀려 가는 자리마다 A 가 늘어나는 빠르기와 높이 f(x) 를 견준다 (3 · 2 · 1 · 0 · −1 · −2).
 * x 3 에서 A 가 가장 크고(4.50), 높이가 음이 되면 A 가 도로 준다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `integral` 은 참 넓이를 되돌린 항으로 셈하는 까닭을 전제로만 쓴다. 이쪽이 그 까닭 — **쌓인 넓이의 빠르기가
 * 곧 높이** — 하나다. 그래서 definition 은 accumulated area · function of x · rate equals height 를 쥐고,
 * 조각 · 합의 수열 · 오차 같은 말을 넣지 않는다 (형제 `riemannSum` 의 말이다).
 *
 * 전제 (설명 글 `fundamentalTheorem.md` 가 밝힌 것):
 *  - 곡선 · 정의역 · 오른쪽 끝의 자리는 예로 정한 값이다.
 *  - 넓이는 역도함수가 아니라 폭 0.001 의 가운데 점 합으로, 빠르기는 차분 δ = 0.001 로 셈했다. 빠르기는 f(x) 보다 0.0005 작아
 *    둘째 자리에서 같고, x 3 에서 0.00 으로 보인다. 같음 판정 허용 오차 0.001.
 *  - 한 곡선의 사례다. 정리는 f 가 이어진 함수일 때 성립한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const fundamentalTheoremConcept: FacetConceptSource = {
  id: 'fundamentalTheorem',
  label: 'Fundamental Theorem of Calculus (Accumulated Area Grows at the Height)',
  canonicalFacet: 'facet:fundamentalTheorem',

  surface: {
    definition:
      'The area accumulated under a curve from a fixed start up to x is itself a function of x, and it grows at a rate equal to the curve\'s height at x, shrinking where the height is negative.',
    exemplarKeywords: [
      'fundamental theorem of calculus',
      'accumulation function',
      'area function A(x)',
      'derivative of an integral',
      'differentiation undoes integration',
      'integration and differentiation are inverse operations',
      'antiderivative',
      'signed area',
      'negative area below the axis',
      'd/dx of the integral from a to x',
    ],
  },

  briefing: {
    observable: [
      'The upper panel shows the line f(t) = 3 − t with a dashed right edge that starts at the left end ("Nothing is piled up yet.") and is pushed right one unit at a time to x = 5. Area fills in behind the edge; the part below the axis is coloured differently and counted as negative.',
      'The lower panel plots the piled-up area A(x) as points and a line, and the same edge cuts through both panels.',
      'At each edge position two bars stand side by side: a height bar from the edge to the curve in the upper panel, and a rate bar in the lower panel showing how much A would rise over one unit at its current rate, with a dashed line at that slope. Both panels use the same vertical unit, so the bar lengths compare by eye.',
      'The readout at each position says "Edge x: … · Rate A grows: … · Height f(x): …": x 0, 1, 2, 3, 4, 5 give A 0.00, 2.50, 4.00, 4.50, 4.00, 2.50 and rate = height = 3.00, 2.00, 1.00, 0.00, −1.00, −2.00. Captions say "A grew", then at x 4 and 5 "A gave back".',
      'The last step sets the rates and heights side by side and concludes "Every pair differs by at most 0.001." Seven steps in all, counting the opening.',
      'The area is built by summing very thin midpoint strips (width 0.001) that are not drawn, and the rate by a difference over 0.001, so no antiderivative formula is used; the rate comes out 0.0005 below the height and shows 0.00 at x = 3. The curve and positions are chosen examples, and the theorem needs a continuous f. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays its seven steps by itself and stops on the side-by-side comparison.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging the strip across x = 2, 3 and 4 shows A peaking exactly where the height crosses zero and then falling.',
        'The line, the edge positions and all values are fixed, so the table of A, rate and height can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article states the fundamental theorem of calculus and wants the reader to see the accumulated area as a function whose rate of growth equals the height, position by position.',
      'A reader is puzzled that an area can decrease; the edge passing below the axis and A falling from 4.50 back to 2.50 shows negative height means negative growth.',
    ],

    avoidWhen: [
      'The article is about approximating one fixed area by rectangles or the accuracy of such sums. The thin strips used here are not drawn and are not the subject.',
      'The subject is evaluating a definite integral as F(b) − F(a) from an antiderivative. No antiderivative formula appears on screen.',
      'The function has jumps or the article discusses improper integrals. The curve here is a straight line on a closed interval.',
    ],

    contrastWith: [
      {
        concept: 'riemannSum',
        note: 'A Riemann sum approaches one number, the area over a fixed interval; the fundamental theorem lets the right end move and says the resulting area function grows at the rate of the curve\'s height.',
      },
      {
        concept: 'integral',
        note: 'Numerical slope and area estimates are compared against true values; the fundamental theorem is the reason the true area can come from reversing the derivative rather than from summing.',
      },
      {
        concept: 'secantToTangent',
        note: 'The derivative of a curve is defined by secants closing in; the fundamental theorem applies that same rate-of-change idea to an area function and finds the original curve.',
      },
    ],
  },
};
