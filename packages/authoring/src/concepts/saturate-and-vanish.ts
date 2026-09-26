/**
 * saturateAndVanish 개념 선언.
 *
 * canonical facet 은 `facet:saturateAndVanish` — 시그모이드 σ(z) 를 z ∈ [−8, 8] 에 그리고 z = 0, 3, −3, 6, −6 을 차례로
 * 짚는다. 짚은 자리에 접선이 걸리고 아래 판 막대가 σ′ = σ(1 − σ) 만큼 선다 — 0.2500 · 0.0452(18.1%) · 0.0025(1.0%).
 * 스스로 재생하고 멈춘다. 여섯 걸음.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `mlpActivation` 은 시그모이드 학습이 느린 것을 결과로 보인다. 이쪽의 한 동사는 **눕는다** — 함수 하나의
 * 기울기가 양끝에서 0 에 붙는다. 그래서 definition 은 sigmoid derivative · peak 0.25 · saturates · tails 를 쥐고,
 * 망 · 학습 · 층을 건너는 곱(형제 `gradientThroughLayers` 와 딥러닝 `vanishingOverTime` 의 것)을 쓰지 않는다.
 *
 * 전제: σ(z) = 1 / (1 + e^−z) 하나만 그린다 · z = −6 에서 σ 와 σ′ 가 둘 다 0.0025 로 찍히는 것은 다른 두 값이
 * 넷째 자리에서 같게 보이는 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const saturateAndVanishConcept: FacetConceptSource = {
  id: 'saturateAndVanish',
  label: 'Sigmoid Saturation: Where the Slope Disappears',
  canonicalFacet: 'facet:saturateAndVanish',

  surface: {
    definition:
      'The sigmoid\'s derivative σ(z)(1 − σ(z)) peaks at 0.25 when z = 0 and falls toward zero as |z| grows, so a saturated unit in either flat tail passes almost no gradient.',
    exemplarKeywords: [
      'sigmoid saturation',
      'derivative of the sigmoid',
      'sigmoid gradient max 0.25',
      'saturated neurons',
      'flat regions of the activation function',
      'why sigmoid causes vanishing gradients',
      'logistic function slope',
      'tanh saturation',
      'dead gradient at large inputs',
    ],
  },

  briefing: {
    observable: [
      'The curve σ(z) = 1 / (1 + e^−z) is drawn for z from −8 to 8. At the start no point is probed.',
      'Each step probes one z, in the order 0, 3, −3, 6, −6 — the middle first, then alternately outward. A tangent hangs at the probed point, and a bar in the lower panel stands as tall as σ′(z) = σ(z)·(1 − σ(z)).',
      'At z = 0 the slope is its peak, 0.2500. At z = ±3 it is 0.0452, 18.1% of the peak. At z = ±6 it is 0.0025, 1.0% of the peak, and the bar lies almost on the floor.',
      'As the probe moves, the dot rides the curve, the tangent tilts to the local slope and the bar follows. Crossing from 3 to −3 passes the middle, where the slope briefly steepens again before flattening. Equal distances on either side give equal slopes.',
      'At z = −6 both σ and σ′ read 0.0025. They are two different values that happen to agree to four decimals, so the screen names which is which.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one probe per step, and stops after z = −6 — six steps including the unprobed start.',
        'A Replay button and a playback strip sit below it. Holding z = 6 shows the tangent nearly flat and the bar at 1.0% of the peak.',
        'Every probed value and percentage is fixed, so 0.25, 0.0452 and 0.0025 can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article says sigmoid units "saturate" and needs the numbers: the slope that is 0.25 at the centre is 18% of that at z = 3 and 1% at z = 6.',
      'A reader wonders why a unit with a large input barely learns; seeing the tangent go flat at both ends ties "almost no gradient" to the shape of one function.',
    ],

    avoidWhen: [
      'The article is about the gradient shrinking across many layers or many time steps. Only one function\'s own slope is shown, with no chain of multiplications.',
      'The activation under discussion is ReLU. Its slope is constant on one side; the flattening here belongs to sigmoid-shaped curves.',
      'The subject is using the sigmoid to turn a score into a probability. The output value appears, but the point is its slope.',
    ],

    contrastWith: [
      {
        concept: 'gradientThroughLayers',
        note: 'Saturation is why one factor in the backward product can be tiny; how factors accumulate as the gradient crosses layer after layer is a separate claim about their product.',
      },
      {
        concept: 'vanishingOverTime',
        note: 'A flat activation tail makes a single step\'s factor small. Vanishing across time steps comes from repeating a factor below one many times, and can happen even when no unit is saturated.',
      },
      {
        concept: 'squashToProbability',
        note: 'The same curve read for its output turns any score into a probability; read for its slope, it shows where that output stops responding to the score.',
      },
    ],
  },
};
