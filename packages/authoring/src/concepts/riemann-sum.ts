/**
 * riemannSum 개념 선언.
 *
 * canonical facet 은 `facet:riemannSum` — 사분원 f(x) = √(4 − x²) 아래 넓이를 폭이 같은 평평한 조각으로 덮고, 걸음마다
 * 조각을 둘로 가른다 (n = 1 · 2 · 4 · 8 · 16 · 32). 왼쪽 끝 높이라 늘 넘치고, 합이 4.000 → 3.198 로 줄며 π(3.142) 에
 * 다가간다. 넘친 몫은 끝까지 0 이 되지 않는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `integral` 은 잡는 자리를 바꿔 가며 **오차가 줄어드는 빠르기**를 견준다. 이쪽은 넓이를 곧은 조각의 합으로 재고
 * 그 합의 **수열이 한 값에 다가간다**는 한 주장이다. 그래서 definition 은 rectangles · split finer · exact area ·
 * never reaches 를 쥐고, 오차의 비 · 가운데 점 · 기울기 같은 말을 넣지 않는다. 형제 `fundamentalTheorem` 은 쌓인 넓이의
 * 빠르기를 말하므로 accumulated · rate 를 이쪽에 두지 않는다.
 *
 * 전제 (설명 글 `riemannSum.md` 가 밝힌 것):
 *  - 곡선 · 구간 · 조각 수의 수열은 예로 정한 값이다. 참 넓이 π 는 원 넓이에서 기하로 아는 값이다.
 *  - 왼쪽 끝을 고른 한 사례다. 이어진 함수면 오른쪽 끝이나 가운데를 골라도 같은 값에 다가간다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const riemannSumConcept: FacetConceptSource = {
  id: 'riemannSum',
  label: 'Riemann Sum (Rectangles Closing In on an Area)',
  canonicalFacet: 'facet:riemannSum',

  surface: {
    definition:
      'Covering the region under a curve with equal-width rectangles and adding their areas gives a sum that approaches the exact area as the rectangles are split ever finer, though no finite count reaches it.',
    exemplarKeywords: [
      'Riemann sum',
      'left Riemann sum',
      'area under a curve',
      'rectangle approximation',
      'definite integral as a limit of sums',
      'partition into subintervals',
      'overestimate on a decreasing function',
      'approximating pi with rectangles',
      'quarter circle area',
      'introduction to integration',
    ],
  },

  briefing: {
    observable: [
      'The curve f(x) = √(4 − x²) on [0, 2], a quarter of a circle of radius 2, sits over its shaded area, labelled "Area under the curve". The opening step has no strips.',
      'Flat pieces then cover the area, each as tall as the curve at its left end. With n = 1 the single piece has width 2 and the sum is 4.000, overshooting by 0.858; the part sticking out above the curve is highlighted.',
      'At every step each piece splits in two: the left half keeps its parent\'s height and the right half drops to the lower height at its own left end. The count doubles to 2, 4, 8, 16, 32 and the sum falls 3.732, 3.496, 3.340, 3.248, 3.198, with overshoot 0.590, 0.354, 0.198, 0.107, 0.056.',
      'A panel at the right plots the sequence of sums: a dot steps down toward a line at π with a bar for the overshoot that shortens each time. The last step states "Value the sums approach: π = 3.142". Eight steps in all, counting the opening.',
      'Because the curve falls to the right, left-end heights always overshoot, so every sum is above π and the overshoot, though shrinking, is never zero. The curve, interval and counts are chosen examples, and π is known here from the circle, not from integration. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays its eight steps by itself and stops on π.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging the strip across the middle steps shows the pieces splitting and the sum dot sliding toward the π line.',
        'The curve and the counts are fixed, so every width, sum and overshoot can be quoted exactly to three decimals.',
      ],
    },

    useWhen: [
      'The article introduces the definite integral as the value that sums of rectangle areas approach, and wants a curve whose true area is already known so the approach can be checked against π.',
      'A reader wonders whether the rectangle approximation ever becomes exact; the overshoot shrinking at every split yet staying above zero answers that directly.',
    ],

    avoidWhen: [
      'The article compares left, right and midpoint rules or discusses how fast the error falls. Only left endpoints appear, and no rates are compared.',
      'The subject is computing an integral with an antiderivative or the fundamental theorem. No formula for the area is used on screen.',
      'The topic is Monte Carlo estimation of π or area by random points. The pieces here are deterministic and evenly spaced.',
    ],

    contrastWith: [
      {
        concept: 'integral',
        note: 'That rectangle sums approach the area defines the integral; which sampling position gets there faster, and by what factor the error falls when the width halves, is a separate question of accuracy.',
      },
      {
        concept: 'fundamentalTheorem',
        note: 'A Riemann sum measures one fixed area; the fundamental theorem treats the area as a function of its right end and relates how fast it grows to the curve\'s height.',
      },
      {
        concept: 'secantToTangent',
        note: 'Both reach an exact value as a limit of approximations. The integral is a limit of sums of many thin pieces, the derivative a limit of one ratio between two nearby points.',
      },
    ],
  },
};
