/**
 * weightedSumThreshold 개념 선언.
 *
 * canonical facet 은 `facet:weightedSumThreshold` — 입력 셋 x = (0.80, 0.50, 0.90) 에 무게 (0.60, −0.40, 0.70) 을 곱해
 * 합 s 에 차례로 싣고(0.48 → 0.28 → 0.91), 다 실린 뒤 문턱 θ = 0.70 과 한 번 견주어 출력이 0 에서 1 로 건너뛴다.
 * 스스로 재생하고 멈춘다. 다섯 걸음.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `perceptron` 은 이 판정을 틀린 점마다 고치는 학습 규칙이 끝나는가를 쥔다. 이쪽의 한 동사는 **견준다** —
 * 학습 없이 한 입력을 한 번 판정한다. 그래서 definition 은 multiply · sum · compare once · all-or-nothing 을 쥐고,
 * learning · epoch · separable · converge 를 쓰지 않는다.
 *
 * 전제: 무게와 문턱은 예로 고른 값(학습한 것이 아니다) · 치우침 항은 문턱 θ 로 말한다 · 합이 문턱과 같거나 낮으면 0.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const weightedSumThresholdConcept: FacetConceptSource = {
  id: 'weightedSumThreshold',
  label: 'Weighted Sum and Threshold (One Artificial Neuron)',
  canonicalFacet: 'facet:weightedSumThreshold',

  surface: {
    definition:
      'An artificial neuron multiplies each input by its weight, adds the products into one sum, and compares that sum once with a threshold, giving an all-or-nothing output of 0 or 1.',
    exemplarKeywords: [
      'artificial neuron',
      'McCulloch-Pitts neuron',
      'weighted sum of inputs',
      'step activation function',
      'Heaviside step function',
      'threshold logic unit',
      'bias as negative threshold',
      'negative weight is inhibitory',
      'dot product then threshold',
      'how a perceptron makes a decision',
    ],
  },

  briefing: {
    observable: [
      'Three inputs x1, x2, x3 with weights w1 = 0.60, w2 = −0.40, w3 = 0.70 feed one sum s, and the threshold θ = 0.70 sits beside it. At the start nothing is loaded: s = 0.00, output 0.',
      'The inputs load in order. x1: 0.80 × 0.60 = 0.48 and the sum rises 0.00 → 0.48. x2: 0.50 × −0.40 = −0.20 and, because the weight is negative, the sum falls to 0.28. x3: 0.90 × 0.70 = 0.63 and the sum rises to 0.91.',
      'The partial sums are never compared with the threshold. Only after all three are loaded does one comparison happen: "Compared once: s = 0.91 > θ = 0.70", and the output jumps from 0 to 1 in a single step.',
      'The sum clears the threshold by 0.21, but the output is 1 whatever that margin; there is no value between 0 and 1. A sum equal to or below the threshold would give 0.',
      'Premises the screen does not footnote: the weights and threshold are chosen for the example, not learned; there is no separate bias term — it is expressed as the threshold θ.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one input per step, and stops after the comparison — five steps from the empty sum.',
        'A Replay button and a playback strip sit below it. Holding the x2 step shows the sum going down, the one moment a weight works against the output.',
        'All inputs, weights and sums are fixed, so 0.48, 0.28, 0.91 and the single comparison with 0.70 can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article defines an artificial neuron and wants its two operations separated: products accumulate into one number first, and only that finished number meets the threshold.',
      'A reader wonders what a negative weight does; the sum dropping from 0.48 to 0.28 while the output still ends at 1 shows an input that argues against firing without deciding alone.',
    ],

    avoidWhen: [
      'The article is about how weights are learned or whether training terminates. Every weight here is fixed and nothing updates.',
      'The neuron under discussion has a smooth activation such as sigmoid or ReLU. The output here jumps straight from 0 to 1 with nothing in between.',
      'The subject is a layer or network of several units. One unit with three inputs is all there is.',
    ],

    contrastWith: [
      {
        concept: 'perceptron',
        note: 'Deciding one input with fixed weights involves no learning at all; the perceptron rule is what adjusts those weights after mistakes, and its question is whether that adjustment ever stops.',
      },
      {
        concept: 'squashToProbability',
        note: 'Both start from a weighted sum. A hard threshold makes it a 0 or 1 verdict with no margin information; a sigmoid turns the same sum into a graded probability.',
      },
      {
        concept: 'layersCompose',
        note: 'A single thresholded unit decides by one straight cut; combining several units in a following layer is what lets a decision boundary gain corners.',
      },
    ],
  },
};
