/**
 * vanishingOverTime 개념 선언.
 *
 * canonical facet 은 `facet:vanishingOverTime` — 칸 하나짜리 RNN 의 h1..h8 이 이미 셈해져 서 있고, 끝 h8 에서 1 로 출발한
 * 기울기 ∂h8/∂h_k 가 한 걸음 거슬러 갈 때마다 w_h 0.50 × tanh′ 를 곱한다 (0.37 ~ 0.49). 거리 1 에서 0.471, 거리 7 에서 0.003
 * (처음의 0.3%). 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 형제 `unrollThenBackprop` 은 몫을 **더하는** 것을, 완제품 `unrolledRnn` 은 되먹임 무게를 돌려 앞뒤 도달이 함께 움직이는
 * 것을 쥔다. 이쪽의 한 동사는 **줄어든다** — 거리마다 곱이 쌓인다. 그래서 definition 은 vanishing · distance · shrinks
 * geometrically · early steps 를 독점하고, loss · sum · forward influence · turning the weight 를 쓰지 않는다.
 * tanh 기울기는 0.74 ~ 0.99 라 포화와 거리가 멀다 — 줄어듦은 같은 w_h 를 거듭 곱하는 데서 온다.
 *
 * 전제: 칸 하나 · |w_h| < 1 · w_x 0.5 · w_h 0.5 · b 0 · 입력 여덟은 예로 정한 값. w_h 가 1 을 넘으면 불어나지만 화면에 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const vanishingOverTimeConcept: FacetConceptSource = {
  id: 'vanishingOverTime',
  label: 'Vanishing Gradient Over Time Steps',
  canonicalFacet: 'facet:vanishingOverTime',

  surface: {
    definition:
      'Going back one time step multiplies an RNN gradient by the recurrent weight times that step’s tanh slope, so with factors below one it vanishes geometrically with distance and barely reaches early steps.',
    exemplarKeywords: [
      'vanishing gradient problem',
      'vanishing gradients in RNNs',
      'long-term dependency problem',
      'gradient decays exponentially with time lag',
      'product of Jacobians',
      'dh_T/dh_k',
      'why plain RNNs forget long-range context',
      'tanh derivative',
      'repeated multiplication by the recurrent weight',
      'exploding gradient (the opposite case)',
    ],
  },

  briefing: {
    observable: [
      'Eight hidden states h1 … h8 are already computed and stand in a row (0.46, -0.26, 0.12, 0.51, -0.24, 0.13, 0.51, -0.24), each link marked w_h. The first caption reads "The gradient starts at the last hidden state." with ∂h8/∂h8 = 1.000, "Distance: 0" and "Share of the start: 100.0%".',
      'Each step goes one state further back and shows its factor as w_h times the tanh slope: "w_h 0.50 × tanh′ 0.94 = 0.47", and the gradient becomes 0.471 at distance 1.',
      'The factors run 0.47, 0.37, 0.49, 0.47, 0.37, 0.49, 0.47 — never above one half — and the gradient falls 1.000, 0.471, 0.174, 0.086, 0.040, 0.015, 0.007, 0.003. The share of the start reads 47.1%, 17.4%, 8.6%, 4.0%, 1.5%, 0.7%, 0.3%.',
      'The w_h in every factor is the same 0.50; only the tanh slope changes, and it stays between 0.74 and 0.99, far from flat.',
      'Premises the screen does not footnote: the hidden state is one number; w_x = 0.5, w_h = 0.5, b = 0 and the eight inputs are chosen for the example; with a weight above one the product could grow instead (exploding gradients), which is not shown.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one step back per step, from distance 0 to distance 7, and stops at h1.',
        'A Replay button and a playback strip sit below it. Scrubbing lets an article hold the moment the gradient drops below one percent of its start (distance 5, 1.5% → distance 6, 0.7%).',
        'Every factor and gradient value is fixed, so 0.471 and 0.003 can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces the vanishing gradient problem for recurrent networks and needs to make "exponential decay" concrete: seven factors of about a half take the gradient from 1 to 0.003.',
      'A reader assumes the gradient vanishes because the activation saturates, and the article wants a case where every tanh slope is 0.74 or more and the gradient still disappears, because the same small weight is multiplied in again and again.',
    ],

    avoidWhen: [
      'The subject is how the per-step contributions are added up into the gradient of a weight. Nothing is summed here; only the product along the chain is followed.',
      'The article is about exploding gradients or gradient clipping. The weight is below one and everything shrinks.',
      'The subject is a sigmoid or tanh saturating inside one layer of a feed-forward network. The shrinking here comes from repeated multiplication across time, not from a flat activation.',
      'The point is how LSTM or GRU fixes the problem. Only the plain cell appears.',
    ],

    contrastWith: [
      {
        concept: 'unrollThenBackprop',
        note: 'Both follow the gradient back through time, but one adds and one multiplies: there each step\'s share is summed into one weight\'s gradient, here the factors along the chain are multiplied and the result shrinks with every step of distance.',
      },
      {
        concept: 'gatedCells',
        note: 'The vanishing gradient is the problem: a product of factors each well below one. Gated cells answer it by replacing that factor with a gate that can stay close to one for many steps.',
      },
      {
        concept: 'cellCarriesLong',
        note: 'Here each step multiplies by the recurrent weight and a slope, and the product shrinks fast. An LSTM cell state is multiplied only by its forget gate, so when that gate sits near one the product barely shrinks.',
      },
      {
        concept: 'squashToProbability',
        note: 'A squashing function flattens far from the middle, which is one way a gradient can die inside a single step. The decay here needs no flattening at all; it comes from multiplying the same weight below one across many steps.',
      },
      {
        concept: 'unrolledRnn',
        note: 'The shrinking backward product is one direction of a larger fact: the same product also governs how long an early input influences later outputs, and changing the recurrent weight moves both together.',
      },
    ],
  },
};
