/**
 * errorFlowsBackward 개념 선언.
 *
 * canonical facet 은 `facet:errorFlowsBackward` — 입력 둘 · 은닉 셋 · 출력 하나의 망. 앞으로 셈은 끝나 있고(ŷ 0.59 · y 1.20 ·
 * L 0.18), 출력의 틀림 δ = −0.61 이 가지 셋으로 δ_h = w · δ 만큼 갈라져(h1 −0.55 · h2 0.30 · h3 −0.24) 은닉으로 흐르고,
 * 다시 입력 가지로 갈라진다. 무게가 −0.50 인 가지만 부호가 뒤집힌다. 스스로 재생하고 멈춘다. 네 걸음.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `backprop` 은 역전파의 비용을 밀어 보기와 견준다. 형제 `gradientThroughLayers` 는 한 줄 사슬에서 층마다
 * 곱해지는 크기를 쥔다. 이쪽의 한 동사는 **갈라진다** — 한 마디의 틀림이 여러 가지로 무게 비례로 나뉜다. 그래서
 * definition 은 output error · splits across branches · in proportion to weights · sign flips · error times input 을
 * 쥐고, cost · finite difference · product over layers · grow or shrink with depth 를 쓰지 않는다.
 *
 * 전제: 손으로 고른 장난감 값 · 치우침 없음 · 은닉은 ReLU 지만 셋 다 켜져 있어 기울기 1(사실상 선형 층 둘) ·
 * 출력 활성화 없음 · 무게는 바꾸지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const errorFlowsBackwardConcept: FacetConceptSource = {
  id: 'errorFlowsBackward',
  label: 'Output Error Splits Backward Across the Weights',
  canonicalFacet: 'facet:errorFlowsBackward',

  surface: {
    definition:
      'In the backward pass the output error splits across the incoming branches in proportion to their weights, a negative weight flipping its sign, and each weight\'s gradient is the error arriving at it times its input.',
    exemplarKeywords: [
      'backward pass step by step',
      'error signal delta',
      'delta rule for hidden units',
      'blame assignment',
      'credit assignment in neural networks',
      'chain rule for one hidden layer',
      'dL/dw = delta times activation',
      'propagating error to hidden layer',
      'worked example of backpropagation',
    ],
  },

  briefing: {
    observable: [
      'A network of two inputs, three hidden units and one output, with the forward pass already done: x = (1.00, 0.60), hidden h = (0.52, 0.18, 0.54), output ŷ = 0.59, target y = 1.20, loss L = ½(ŷ − y)² = 0.18.',
      'Step 1: an error appears at the output, δ = ŷ − y = −0.61, drawn as a ring around the output node.',
      'Step 2: the error splits over the three branches into the hidden units, each receiving δ_h = w · δ — thicker branches carry more: h1 −0.55, h2 0.30, h3 −0.24. Only the share that crossed the −0.50 branch arrives at h2 with its sign flipped to positive. Each branch it crossed keeps its weight\'s gradient ∂L/∂w = δ · h: −0.32, −0.11, −0.33.',
      'Step 3: each hidden unit\'s share splits again over its two input branches, and the six front weights receive ∂L/∂W1 = δ_h · x — the error that reached the weight times the input that came in through it.',
      'The weights never change; the round stops once every gradient is found.',
      'Premises the screen does not footnote: the numbers are hand-picked toy values with no biases; the hidden units are ReLU but all three are on (every z is positive), so their slope is 1 and the network is effectively two linear layers — an activation shrinking or cutting the error is not shown; the output has no activation.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself — forward result, output error, split to hidden, split to inputs — and stops. Four steps.',
        'A Replay button and a playback strip sit below it. Holding step 2 shows the three shares side by side with the one positive share at h2.',
        'Every share and gradient is fixed, so −0.61, the split −0.55 · 0.30 · −0.24 and the gradients can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article walks through the backward pass by hand and needs the "blame" metaphor made exact: an output error of −0.61 divided among three hidden units in proportion to the weights that connect them.',
      'A reader is puzzled that a hidden unit\'s error can have the opposite sign from the output\'s; the −0.50 branch turning −0.61 into +0.30 at h2 shows why.',
    ],

    avoidWhen: [
      'The article is about the computational cost of backpropagation or comparing it with numerical gradients. Only one backward pass on one fixed network appears.',
      'The subject is gradients vanishing or exploding with depth. There are only two layers of weights, and no activation slope reduces the error.',
      'The point is updating the weights. The round ends with gradients; no weight changes.',
    ],

    contrastWith: [
      {
        concept: 'gradientThroughLayers',
        note: 'Dividing one node\'s error among several branches is about width — who gets what share. Following a gradient down a long chain is about depth — how repeated factors change its size.',
      },
      {
        concept: 'backprop',
        note: 'The rule for dividing the error is what one backward pass executes; why a single such pass is so much cheaper than nudging each weight is a separate claim about cost.',
      },
      {
        concept: 'unrollThenBackprop',
        note: 'In a recurrent network unrolled over time, a shared weight collects gradient from every step it appears in; in a feedforward layer each weight receives its share from one place.',
      },
    ],
  },
};
