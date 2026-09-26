/**
 * gradientThroughLayers 개념 선언.
 *
 * canonical facet 은 `facet:gradientThroughLayers` — 입력 x = 0.5 가 한 줄로 이어진 층 넷(h_k = w_k · h_(k−1), 무게
 * 1.5 · 0.4 · 2.0 · 0.8)을 지나 ŷ = 0.48. 출력의 기울기 −0.52 가 층을 거슬러 건널 때마다 그 층의 무게를 곱한다 —
 * −0.416 → −0.832 → −0.333 → −0.499. 맨 앞의 크기가 출력 바로 뒤보다 크다. 스스로 재생하고 멈춘다. 여섯 걸음.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `backprop` 은 비용을, 형제 `errorFlowsBackward` 는 한 마디에서 여러 가지로 갈라지는 폭을 쥔다. 이쪽의 한
 * 동사는 **곱해진다** — 깊이 방향 사슬에서 크기는 지나온 무게들의 곱이 정한다. 그래서 definition 은 chain of layers ·
 * multiplied by each layer's weight · product · grow or shrink 를 쥐고, split · branches · sign flip · cost 를 쓰지 않는다.
 * 딥러닝의 `vanishingOverTime`(시간 걸음마다 1 보다 작은 같은 곱)과는 "크기가 오를 수도 있다" 로 갈린다.
 *
 * 전제: 활성화 함수와 치우침을 뺐다(곱하는 수를 무게 하나로 보이려는 단순화) · 값은 커짐과 작아짐이 섞이도록 손으로
 * 고른 것 · 기울기는 셋째 자리, 앞으로 값은 둘째 자리로 찍는다 · 무게는 바꾸지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const gradientThroughLayersConcept: FacetConceptSource = {
  id: 'gradientThroughLayers',
  label: 'Gradient Size Through a Chain of Layers',
  canonicalFacet: 'facet:gradientThroughLayers',

  surface: {
    definition:
      'Going backward through a chain of layers, the gradient is multiplied by each layer\'s weight in turn, so its size at the front is the product of those factors and can grow as well as shrink.',
    exemplarKeywords: [
      'chain rule across layers',
      'gradient magnitude in deep networks',
      'product of weights',
      'vanishing and exploding gradients',
      'depth and gradient flow',
      'deep linear chain',
      'gradient at early layers',
      'Jacobian product',
      'why deep networks are hard to train',
    ],
  },

  briefing: {
    observable: [
      'Input x = 0.5 passes through four layers in a single chain, each multiplying the previous value by its weight — 1.5, 0.4, 2.0, 0.8 from the front — to give ŷ = 0.48. Against target y = 1.0 the loss is L = ½(ŷ − y)² = 0.1352. The forward pass is done at the start.',
      'The gradient starts at the output: ∂L/∂h₄ = ŷ − y = −0.52.',
      'Each step crosses one layer backward and multiplies by that layer\'s weight, captioned "The size shrinks" or "The size grows": through 0.8 it becomes −0.416, through 2.0 −0.832, through 0.4 −0.333, through 1.5 −0.499.',
      'The size at the front, 0.499, ends larger than right after the output, 0.416. A running "Product of the multipliers so far" ends at 0.96 — distance alone does not make the gradient smaller; the product of the weights crossed does.',
      'At each crossing the layer\'s weight gradient is also shown, ∂L/∂w_k = ∂L/∂h_k · h_(k−1). No weight is changed.',
      'Premises the screen does not footnote: activation functions and biases are removed so that each factor is one weight — in a real network each layer also multiplies by its activation\'s slope; the input, target and weights are hand-picked to mix growing and shrinking; gradients print to three decimals and forward values to two, while the arithmetic keeps full precision.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself — forward result, output gradient, then one layer per step — and stops after the fourth layer. Six steps.',
        'A Replay button and a playback strip sit below it. Scrubbing between the 2.0 and 0.4 layers shows the size doubling to 0.832 and then dropping to 0.333.',
        'Every weight, gradient and running product is fixed, so the sequence −0.416, −0.832, −0.333, −0.499 can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces vanishing and exploding gradients and wants the root cause first: through a chain, the gradient is a product of per-layer factors, and factors above or below one change its size.',
      'A reader assumes the gradient always fades the farther back it goes; a chain where the front receives 0.499 against 0.416 near the output shows that the product, not the distance, decides.',
    ],

    avoidWhen: [
      'The article is about sigmoid or tanh saturation. There is no activation here; the factors are plain weights.',
      'The network has several units per layer and the question is how error divides among them. This is a single chain with one unit per layer.',
      'The subject is recurrent networks and long time lags. The chain here is four distinct layers with different weights, not one weight repeated over time.',
    ],

    contrastWith: [
      {
        concept: 'errorFlowsBackward',
        note: 'Splitting an error across parallel branches decides how it is shared; multiplying along a series of layers decides how large it stays. One is about width, the other about depth.',
      },
      {
        concept: 'vanishingOverTime',
        note: 'Through time, the same recurrent factor is applied again and again, so a factor below one makes the gradient decay steadily. Through distinct layers each factor differs, and the product can rise as well as fall.',
      },
      {
        concept: 'saturateAndVanish',
        note: 'An activation\'s flat tail is one reason a single factor can be tiny; the product along the chain is what turns small factors into a vanishing gradient.',
      },
      {
        concept: 'backprop',
        note: 'Computing all gradients in one backward pass is a statement about cost; how big the gradient is when it arrives at the front layers is a statement about the values multiplied along the way.',
      },
    ],
  },
};
