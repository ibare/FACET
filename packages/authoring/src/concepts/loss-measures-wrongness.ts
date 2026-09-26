/**
 * lossMeasuresWrongness 개념 선언.
 *
 * canonical facet 은 `facet:lossMeasuresWrongness` — 보기 다섯(e1 … e5)마다 정답에 준 확률이 1 에서 모자란 폭을 가로축에
 * 눕히고, 곡선 높이 −ln q 까지 솟게 해 값으로 만든다. 값을 한 기둥에 쌓아 합 5.104, 보기 수 5 로 나눠 손실 1.021.
 * 스스로 재생하고 멈춘다. 일곱 걸음.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `loss` 는 두 손실의 **기울기**가 확신하고 틀린 출력을 얼마나 세게 되미는가를 견준다. 이쪽의 한 동사는
 * **잰다** — 틀림을 한 수로 바꿔 평균 낸다. 기울기 · 갱신 · 제곱 손실과의 비교가 없다. 그래서 definition 은
 * negative log of the probability given to the correct label · grows faster than the gap · averaged 를 쥐고,
 * gradient · push · squared loss 를 쓰지 않는다.
 *
 * 전제: 확률 · 정답은 예로 고른 장난감 값 · 자연로그 · 여기 보인 손실은 교차 엔트로피 하나(회귀의 제곱 오차 등은 다른 손실).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const lossMeasuresWrongnessConcept: FacetConceptSource = {
  id: 'lossMeasuresWrongness',
  label: 'Cross-Entropy Loss Measures How Wrong Predictions Are',
  canonicalFacet: 'facet:lossMeasuresWrongness',

  surface: {
    definition:
      'Cross-entropy scores each prediction as the negative log of the probability it gave the correct label, which grows faster than the shortfall itself, and averages those scores over examples into one loss.',
    exemplarKeywords: [
      'what is a loss function',
      'cross-entropy loss',
      'log loss',
      'negative log-likelihood',
      '-log(p)',
      'average loss over a batch',
      'confident wrong prediction dominates the loss',
      'cost function',
      'measuring prediction error with one number',
    ],
  },

  briefing: {
    observable: [
      'Five examples e1 … e5 each have an answer y (ring) and a predicted probability p of answer 1 (dot). The gap is how far the probability given to the correct answer falls short of 1.',
      'For each example in turn, its gap lies down along the horizontal axis and rises to the height of the curve, becoming its value: Lᵢ = −[y·ln p + (1 − y)·ln(1 − p)], shown as −ln(q) with q the probability given to the correct answer.',
      'A dashed straight line "value = gap" sits beside the curve, and the curve pulls away from it: a gap of 0.10 becomes 0.105, a gap of 0.95 becomes 2.996. The value per unit of gap reads 1.05, 1.15, 1.28, 1.72, 3.15 across the examples.',
      'The values stack into one column, reaching a sum of 5.104. The confidently wrong e5 alone is more than half of that sum.',
      'The last step divides by the five examples: "5.104 ÷ 5 = 1.021", the loss.',
      'Premises the screen does not footnote: the probabilities and answers are chosen for the example; the logarithm is natural; this is cross-entropy, the loss for probability outputs — other losses such as squared error for regression penalise differently.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one example per step, then the division — seven steps from the empty column — and stops.',
        'A Replay button and a playback strip sit below it. Holding the e5 step shows one example\'s value towering over the dashed "value = gap" line.',
        'All five values, the sum 5.104 and the loss 1.021 are fixed and can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces the loss function as "one number for how wrong the model is" and wants the construction shown piece by piece: a value per example, a sum, a division.',
      'A reader asks why a single very confident mistake hurts so much; e5 contributing more than half of 5.104 shows the logarithm punishing it out of proportion to its gap.',
    ],

    avoidWhen: [
      'The article compares how different losses drive learning or how large their gradients are. Nothing is updated here and no gradient is shown.',
      'The task is regression with a real-valued target. The predictions here are probabilities for a yes-or-no answer.',
      'The subject is the train-versus-validation loss curve over epochs. There is one set of five predictions and one loss value.',
    ],

    contrastWith: [
      {
        concept: 'loss',
        note: 'Turning errors into one number is what a loss is; how hard that loss\'s slope pushes a wrong output back is what makes one loss better for learning than another.',
      },
      {
        concept: 'residualDistance',
        note: 'A regression residual is a distance measured in the units of the target. Cross-entropy measures a shortfall in probability and bends it through a logarithm, so the penalty is not proportional to the gap.',
      },
      {
        concept: 'logisticRegression',
        note: 'Logistic regression is fitted by minimising exactly this average; the concept here is the scoring itself, with the model left fixed.',
      },
    ],
  },
};
