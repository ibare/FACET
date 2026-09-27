/**
 * secantToTangent 개념 선언.
 *
 * canonical facet 은 `facet:secantToTangent` — 곡선 x² 의 점 (1, 1) 을 붙들고, 둘째 점을 오른쪽 거리 h 에 두어
 * h 를 1 → 0.5 → 0.25 → 0.1 → 0.01 로 줄인다. 할선이 붙든 점을 축으로 돌아 눕고 기울기가 3.00 → 2.01 로 2.00 에 다가간다.
 * 마지막 걸음에 두 점이 겹쳐 접선이 선다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `integral` 은 폭 h 로 기울기와 넓이를 함께 셈하며 **오차가 줄어드는 빠르기**를 견준다. 이쪽은 그 앞의 물음 —
 * 한 점의 기울기란 무엇인가 — 하나다. 그래서 definition 은 secant · second point slides · tangent · settles on 을 쥐고,
 * 오차의 비 · 넓이 · 잡는 자리 같은 말을 넣지 않는다. 형제 `chainRuleMultiply` 는 두 함수를 잇는 말, `riemannSum` 은
 * 넓이의 말이라 겹치지 않는다.
 *
 * 전제 (설명 글 `secantToTangent.md` 가 밝힌 것):
 *  - 곡선 x² · 점 a = 1 · h 의 수열은 예로 정한 값이다. 둘째 점은 오른쪽에만 둔다.
 *  - 접선 기울기 2 는 거듭제곱 규칙으로 셈한 값이지 극한을 수로 셈한 것이 아니다. 화면은 한 사례를 보인다.
 *  - x² 에서는 접선과의 차가 h 와 똑같다 — 다른 곡선에서는 아니다. 꺾인 점에서는 접선 기울기가 없다.
 *  - 가로 · 세로 축척이 달라 화면 속 직선의 기울어진 정도는 값과 눈으로 맞지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const secantToTangentConcept: FacetConceptSource = {
  id: 'secantToTangent',
  label: 'From Secant to Tangent (The Derivative at a Point)',
  canonicalFacet: 'facet:secantToTangent',

  surface: {
    definition:
      'The derivative at a point is the value that secant slopes through that point settle on as a second point slides along the curve toward it, the slope of the tangent line.',
    exemplarKeywords: [
      'secant line',
      'tangent line',
      'derivative as a limit',
      'difference quotient',
      'instantaneous rate of change',
      'average rate of change',
      'slope of a curve at a point',
      "f'(a)",
      'limit definition of the derivative',
      'introduction to derivatives',
    ],
  },

  briefing: {
    observable: [
      'The curve f(x) = x² is drawn with a fixed first point (1, 1). The opening step shows only the curve and that point.',
      'A second point appears to the right, joined by a secant, then slides along the curve toward the first point as h runs 1, 0.5, 0.25, 0.1, 0.01. Each step\'s readout says "h = … · secant slope … · gap to the tangent …": 3.00 with gap 1.00, then 2.50, 2.25, 2.10, 2.01 with gaps 0.50, 0.25, 0.10, 0.01.',
      'Each time, the secant turns about the fixed point and lies flatter. A marker on a slope scale at the right moves down with it, leaving marks for earlier slopes whose spacing narrows as they gather toward one value.',
      'In the last step the two points meet and the line touching the curve there is labelled the tangent, with "tangent slope f′(a) = 2.00". The first point never moves. Seven steps in all, counting the opening.',
      'The curve, the point and the sequence of h are chosen examples, and the tangent slope 2 comes from differentiating x² by the power rule rather than from computing a limit numerically. That the gap equals h exactly is special to x². Horizontal and vertical scales differ, so the tilt on screen is not the slope value. None of this is footnoted on screen.',
    ],

    screen: {
      affordances: [
        'The screen plays its seven steps by itself and stops on the tangent.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging the strip back and forth over the middle steps swings the secant and shows the slope marks bunching up.',
        'The curve, the point and the values of h are fixed, so every slope and gap can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces the derivative and needs the reader to see that the slope at a single point is defined by what the slope between two points approaches, not by one pair of points.',
      'A reader thinks a tangent is just a line touching the curve once and the article wants the limit of secants as the real definition, with numbers that visibly close in on 2.',
    ],

    avoidWhen: [
      'The article is about how accurate a finite-difference approximation is or how its error scales with the step. Only one-sided secants on one curve appear, and error rates are not compared.',
      'The subject is a point where the derivative fails to exist, such as a corner or a jump. The curve here is smooth and the approach is from one side only.',
      'The reader should choose the curve or the point. Everything is fixed.',
    ],

    contrastWith: [
      {
        concept: 'integral',
        note: 'Defining the derivative needs only that secant slopes settle on one value; how quickly they settle, and how that changes with where the difference is taken, is a question of numerical accuracy.',
      },
      {
        concept: 'chainRuleMultiply',
        note: 'Both treat a derivative as a ratio of a small output change to a small input change. The chain rule asks how those ratios combine when one function feeds another; this asks what a single ratio becomes as the change shrinks.',
      },
      {
        concept: 'riemannSum',
        note: 'Both reach an exact value as the limit of approximations, one of slopes and one of areas; the derivative takes the limit of a ratio, the integral the limit of a sum.',
      },
      {
        concept: 'partialSlice',
        note: 'With one input there is one tangent slope at a point; with two inputs a slope needs a direction, and a partial derivative fixes that direction by holding the other input still.',
      },
    ],
  },
};
