/**
 * learningRateTooBig 개념 선언.
 *
 * canonical facet 은 `facet:learningRateTooBig` — 바닥이 하나인 그릇 L = w² 에서 η 1.25 로 경사 하강을 다섯 번 한다.
 * 한 갱신의 배율이 1 − 2η = −1.5 라 w 는 갱신마다 바닥(w = 0)을 건너 반대편에 떨어지고, 바닥에서 1.5 배 멀어지며
 * 손실은 0.10 → 5.90 으로 오른다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `gradientDescent` 는 η 와 출발이 함께 바닥을 고르는 대비를 쥔다. 이쪽은 **한 그릇 · 한 η 에서 갈수록 멀어지는
 * 장면** 하나다. definition 은 past the bottom · opposite side · farther and higher · loss rises every update 를 쥐고,
 * 완제품의 starting point · which minimum 과 조각 `localMinimum` 의 hill · shallow 를 쓰지 않는다.
 *
 * 전제: 손실은 무게 하나의 장난감 그릇 L = w² 이고, 처음 w 0.32 와 η 1.25 는 손으로 고른 값이다. 재생이 다섯 번째
 * 갱신에서 멈추는 것은 정해 둔 횟수이지 어딘가에 닿아서가 아니다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const learningRateTooBigConcept: FacetConceptSource = {
  id: 'learningRateTooBig',
  label: 'Learning Rate Too Big (Overshooting and Diverging)',
  canonicalFacet: 'facet:learningRateTooBig',

  surface: {
    definition:
      'With a learning rate that is too large, each downhill step jumps past the bottom of the bowl and lands on the opposite side, farther away and higher, so the loss rises every update.',
    exemplarKeywords: [
      'learning rate too high',
      'divergence',
      'overshooting the minimum',
      'loss explodes',
      'loss increases during training',
      'exploding updates',
      'oscillating sign',
      'stability condition',
      'step size larger than the curvature allows',
      'lower the learning rate',
    ],
  },

  briefing: {
    observable: [
      'A single bowl, the loss L = w², with its bottom marked "bottom (w = 0)". The start reads "Start: w = 0.32", "Learning rate: η = 1.25", "Loss: 0.10" and "Distance from bottom: 0.32".',
      'Each update step shows the arithmetic — "Update #1: w ← 0.32 − η·g = −0.48", "Gradient: g = 0.64 · η·g = 0.80" — and the ball lands on the other side of the bottom.',
      'A dashed line labelled "height before" marks the loss before the update; every new position sits above it. The loss readout climbs 0.10 → 0.23 → 0.52 → 1.17 → 2.62 → 5.90.',
      'The distance from the bottom grows by 1.5 times each update: 0.32 · 0.48 · 0.72 · 1.08 · 1.62 · 2.43, while the sign of w flips every time, so the landing marks on the axis spread out left and right alternately.',
      'Every move follows the gradient downhill in direction; it is the size, η·g of 0.80 up to 4.05, that carries the ball past the bottom.',
      'The bowl and the numbers are a toy: one weight, loss w², start 0.32 and η 1.25 chosen by hand. The run stops after five updates because that is its length, not because anything was reached.',
    ],

    screen: {
      affordances: [
        'The screen plays six steps by itself — the start and five updates — and stops.',
        'A Replay button and a playback strip sit below. Dragging back and forth between two neighbouring updates shows the ball crossing the bottom and landing above the "height before" line.',
        'All values are fixed, so an article can quote each update\'s g, η·g, w and loss exactly as shown.',
      ],
    },

    useWhen: [
      'The reader expects that following the negative gradient always lowers the loss, and needs to see every step go in the right direction and still end higher.',
      'The article explains why training loss suddenly climbs or becomes NaN and wants the simplest picture of a step that is longer than the distance to the bottom.',
    ],

    avoidWhen: [
      'The article compares several learning rates or discusses picking one. Only η 1.25 is shown.',
      'The subject is a loss with more than one valley, or getting stuck. The bowl here has a single bottom.',
      'The point is gradients growing through the layers of a deep network. The growth here comes from the step size on one weight.',
    ],

    contrastWith: [
      {
        concept: 'gradientDescent',
        note: 'Moving away from the bottom is the extreme of the learning-rate ladder; short of it, the rate together with the start decides which minimum is reached.',
      },
      {
        concept: 'localMinimum',
        note: 'Both end away from the best value, for opposite reasons: a small, shrinking step comes to rest short of a deeper valley, while an oversized step never comes to rest at all.',
      },
      {
        concept: 'adam',
        note: 'The steepest direction sets the largest stable learning rate; dividing each weight\'s step by its own gradient size is one way around being capped by that direction.',
      },
    ],
  },
};
