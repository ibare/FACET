/**
 * unrollThenBackprop 개념 선언.
 *
 * canonical facet 은 `facet:unrollThenBackprop` — 같은 셀 넷을 펼쳐 입력 2 · −1 · 1 · 1 로 앞으로 한 번 흘리고,
 * 마지막 걸음의 손실 L = ½·(h4 − y)² (y −0.5, L 0.75) 에서 기울기 δ4 1.23 을 거슬러 보낸다. 셀마다 공유 무게 w_x 의
 * 기울기 칸에 몫 0.58 · 0.33 · −0.26 · 0.18 이 보태져 모인 합 0.83 이 된다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `unrolledRnn` 은 손실 없이 끝 출력의 기울기를 보내고 되먹임 무게를 돌려 두 방향의 도달을 견준다.
 * 형제 `vanishingOverTime` 은 거슬러 갈수록 곱이 쌓여 줄어드는 것을 쥔다. 이쪽의 한 동사는 **모인다** — 몫이 한
 * 무게의 기울기 하나로 더해진다. 그래서 definition 은 loss · contribution · summed · shared weight 를 독점하고,
 * shrink · distance · vanishing 을 쓰지 않는다.
 *
 * 전제: 칸 하나 · w_x 0.5 · w_h 0.8 · b 0 · h0 0 은 예로 정한 값 · 손실은 마지막 걸음에만 · 기울기는 w_x 하나만 모은다 ·
 * 무게 갱신 없음.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const unrollThenBackpropConcept: FacetConceptSource = {
  id: 'unrollThenBackprop',
  label: 'Backpropagation Through Time Sums Each Step’s Share',
  canonicalFacet: 'facet:unrollThenBackprop',

  surface: {
    definition:
      'Backpropagation through time lays recurrent steps out as copies of one cell, sends the loss gradient from the last step to the first, and adds each step’s contribution into one gradient for the shared weight.',
    exemplarKeywords: [
      'backpropagation through time',
      'BPTT',
      'gradient of a shared weight',
      'sum of gradients over time steps',
      'dL/dW_x in an RNN',
      'loss at the last time step',
      'delta passed to the previous step',
      'chain rule through time',
      'unrolled computational graph',
      'training a recurrent neural network',
    ],
  },

  briefing: {
    observable: [
      'Four copies of the same cell stand in a row under the caption "The same cell, unrolled. Cells: 4", with inputs x1 2, x2 -1, x3 1, x4 1, a target y -0.5 after the last cell, and a panel "shared by every step" holding w_x 0.5, w_h 0.8 and b 0.',
      'Steps 1–4 go forward: h1 0.76, h2 0.11, h3 0.53, h4 0.73. Step 5 computes the loss: "Loss: 0.75 · gradient sent back: 1.23".',
      'Steps 6–9 go backward from cell 4 to cell 1. At each cell the incoming δ is multiplied by (1 − h²) to give d, and d times that cell\'s x is the share added — cell 4: δ4 1.23 ×0.47 → 0.58, ×1 → 0.58; cell 3: 0.46 ×0.72 → 0.33; cell 2: 0.27 ×0.99 → 0.26, ×-1 → -0.26; cell 1: 0.21 ×0.42 → 0.09, ×2 → 0.18. A ×0.8 hop marks δ passing to the previous cell.',
      'A "∂L/∂w_x" box fills as a sum: 0.58 + 0.33 + -0.26 + 0.18, with the running total 0.58, 0.91, 0.65 and finally 0.83. The last caption reads "gradient of the shared weight: 0.83". The shares differ in size and sign; the one w_x receives them all.',
      'No weight is updated; the run ends once the gradient is collected.',
      'Premises the screen does not footnote: the hidden state is one number; w_x = 0.5, w_h = 0.8, b = 0 and h0 = 0 are chosen for the example; the loss sits on the last step only; only w_x\'s gradient is collected, though w_h and b gather theirs the same way.',
    ],

    screen: {
      affordances: [
        'The screen plays forward, the loss, and backward by itself, one cell per step, and stops once the sum is complete.',
        'A Replay button and a playback strip sit below it. Scrubbing across the backward steps shows each share landing in the sum, including the one negative share that pulls the total down.',
        'All inputs, weights and the target are fixed, so an article can quote 0.58, 0.33, -0.26, 0.18 and 0.83 exactly.',
      ],
    },

    useWhen: [
      'The article explains how a recurrent network is trained and has to answer the question a reader always asks: if the same weight is used at every step, which step\'s gradient updates it? Here all four shares are added into one number.',
      'The reader knows backpropagation for feed-forward layers and needs to see the one thing that changes over time: the gradient for a single weight is the total of its contributions from every step it was used in.',
    ],

    avoidWhen: [
      'The subject is gradients fading with distance in long sequences. Four steps are shown and the claim is about adding shares, not about how small they get.',
      'The article is about gradient descent updates or learning rates. No weight is changed here.',
      'The subject is backpropagation through layers of a feed-forward network, where each layer has its own weights. Here there is one weight shared by all four cells.',
      'The point is truncated BPTT or losses at every time step. There is one loss, at the last step, and the whole chain is walked.',
    ],

    contrastWith: [
      {
        concept: 'vanishingOverTime',
        note: 'Both walk the gradient back through time, but one adds and one multiplies: here each step\'s share is added into a total for one weight, there the factors met along the way are multiplied and the result shrinks with distance.',
      },
      {
        concept: 'sameWeightsEachStep',
        note: 'That one weight set is reused at every step is what makes this summation necessary; the reuse itself is a fact about the forward pass, and this is its consequence for training.',
      },
      {
        concept: 'unrolledRnn',
        note: 'The procedure of sending a loss gradient back and collecting one weight\'s contributions is the core of the method. How the recurrent weight sets how far that gradient reaches, and that forward influence follows the same product, is a separate claim about its behaviour.',
      },
    ],
  },
};
