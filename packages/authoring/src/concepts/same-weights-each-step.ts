/**
 * sameWeightsEachStep 개념 선언.
 *
 * canonical facet 은 `facet:sameWeightsEachStep` — 두 칸짜리 RNN 이 입력 다섯(1 · 2 · −1 · 0 · 1)을 지난다. 위에
 * "One set of weights" (W_x 둘 · W_h 넷 · b 둘 = 8) 가 한 벌 서 있고, 걸음마다 그 한 벌이 불려 나와 셈에 쓰인다.
 * 셈판 "Weights: 8 · Uses: n · If each step had its own: 8n" 이 걸음마다 오른다 (끝 8 · 5 · 40).
 *
 * ── 묶음 안에서의 자리
 *
 * 형제 `carryHiddenState` 는 건너가는 h 를, `unrollThenBackprop` 는 공유된 무게에 기울기가 모이는 것을 쥔다.
 * 이쪽의 한 동사는 **되쓰인다** — 주인공은 한 벌의 무게와 그 수다. 그래서 definition 은 parameter count ·
 * constant as the sequence grows · uses 를 독점하고, hidden state carried · gradient · output 을 쓰지 않는다.
 *
 * 전제: 은닉 상태 두 칸 · 무게는 예로 정한 값 · 출력층 없음 · 학습 없음(무게는 끝까지 한 값).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const sameWeightsEachStepConcept: FacetConceptSource = {
  id: 'sameWeightsEachStep',
  label: 'Same Weights at Every Time Step (Parameter Sharing in RNNs)',
  canonicalFacet: 'facet:sameWeightsEachStep',

  surface: {
    definition:
      'A recurrent network applies one fixed set of weights at every time step, so its parameter count stays constant as the sequence gets longer while the number of times those weights are used grows.',
    exemplarKeywords: [
      'parameter sharing across time',
      'weight sharing in RNNs',
      'number of parameters in an RNN',
      'W_x, W_h and b',
      'does a longer sequence need more weights',
      'variable-length input',
      'same cell applied at each time step',
      'tied weights',
      'model size independent of sequence length',
    ],
  },

  briefing: {
    observable: [
      'A box at the top, "One set of weights", holds W_x = (1, -1), W_h = ((0.5, -0.5), (0.5, 0.5)) and b = (0, 0.5) — eight numbers. Below it five input slots x = 1, 2, -1, 0, 1 wait in a row, with h0 = (0.00, 0.00) on the left.',
      'At each step the weight set is called down into that step\'s cell, which shows a and h for both units: step 1 gives a (1.00, -0.50) and h1 (0.76, -0.46); step 2 gives h2 (0.99, -0.87); step 5 ends at h5 (0.39, -0.35). The caption reads "Step n · the weight set is called up".',
      'A counter line updates with every step: "Weights: 8 · Uses: 1 · If each step had its own: 8", then 16, 24, 32 and finally "Weights: 8 · Uses: 5 · If each step had its own: 40". The first number never moves.',
      'The weights have the same values from start to finish; nothing is learned.',
      'Premises the screen does not footnote: the hidden state has two units; the weights and inputs are chosen for the example; there is no output layer.',
    ],

    screen: {
      affordances: [
        'The screen plays the five inputs by itself, one per step, and stops after the fifth.',
        'A Replay button and a playback strip sit below it. Scrubbing across the steps shows the Uses and "If each step had its own" counts climbing while Weights stays at 8.',
        'The weights, inputs and counts are fixed, so an article can quote 8, 5 and 40 exactly.',
      ],
    },

    useWhen: [
      'The article claims a recurrent network can take sequences of any length and needs to show why its size does not depend on that length: the same eight numbers serve step 1 and step 5.',
      'A reader wonders whether each word position in a sentence gets its own weights, and the article wants the counterfactual count (40 for five steps) beside the real one (8).',
    ],

    avoidWhen: [
      'The subject is what the hidden state carries from step to step. The h values are shown but the claim is about the weights.',
      'The article is about how the gradient for a shared weight is computed. Nothing is trained here, and no gradient appears.',
      'The subject is convolution kernels sharing weights across an image. The sharing here is across time steps of a sequence.',
      'The point is weight tying between an embedding and an output layer in language models. That is a different kind of sharing.',
    ],

    contrastWith: [
      {
        concept: 'carryHiddenState',
        note: 'Both describe what repeats at each step, but the hidden state is new at every step and holds the past, while the weights are the same at every step and hold nothing about the particular input.',
      },
      {
        concept: 'unrollThenBackprop',
        note: 'Reusing one weight set at every step is a fact about the forward computation. Its consequence for training is that the gradient for that one weight has to collect a contribution from every step it was used in.',
      },
      {
        concept: 'weightSharing',
        note: 'Both keep the parameter count fixed by reusing one set of weights. In a convolution the reuse is across positions in space; in a recurrent network it is across steps in time, and each use also depends on the previous step.',
      },
      {
        concept: 'unrolledRnn',
        note: 'Because one recurrent weight is reused at every step, it governs every link of the unrolled chain; how that single value sets the reach of influence and gradient is the question built on this fact.',
      },
    ],
  },
};
