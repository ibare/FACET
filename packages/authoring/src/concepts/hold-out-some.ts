/**
 * holdOutSome 개념 선언.
 *
 * canonical facet 은 `facet:holdOutSome` — 점 열 가운데 셋(x = 2 · 7 · 9)이 맞추기 전에 받침으로 떨어져 나가고,
 * 남은 일곱으로만 최소 제곱 직선 ŷ = 1.139 + 0.617·x 를 맞춘다. 같은 직선으로 훈련 쪽 MSE 0.46, 떼어 둔 쪽
 * MSE 1.11 을 잰다. 스스로 다섯 걸음을 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `crossValidation` 은 나누는 법을 돌려 점수가 섞음마다 얼마나 흩어지는지를, 형제 조각 `rotateTheFold` 는
 * 시험지 자리가 돌아 모두 한 번씩 재이는 것을 말한다. 이쪽은 그보다 앞선 한 질문 — **맞춘 자료로 재면 왜 안 되는가** —
 * 하나다. 나눔은 한 번뿐이고 폴드도 섞음 여럿도 없다. 그래서 definition 은 fitted to · never seen · training error
 * understates 쪽 낱말을 쥐고, fold · spread · reshuffle · exactly once 를 쓰지 않는다. 잣대도 정확도가 아니라
 * 회귀 오차(MSE)다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `holdOutSome.md` 가 밝힌 것):
 *  - 점 열 개는 장난감 자료다. 실제로는 두 쪽 오차의 차이가 이보다 작을 수도 클 수도 있다.
 *  - 떼어 둘 점은 섞은 결과를 값으로 적어 두었다. 다시 틀어도 같은 셋이 떨어진다.
 *  - 모형은 직선 하나이고 닫힌 식으로 한 번에 맞춘다. 점수는 MSE = Σ(y − ŷ)² / n.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const holdOutSomeConcept: FacetConceptSource = {
  id: 'holdOutSome',
  label: 'Hold Out Data Before Fitting (Training Error vs Held-Out Error)',
  canonicalFacet: 'facet:holdOutSome',

  surface: {
    definition:
      'Error measured on the very points a model was fitted to understates its error on new data; points set aside before fitting, never seen by the fit, show the larger error of the same model.',
    exemplarKeywords: [
      'train/test split',
      'training error vs test error',
      'why not evaluate on the training data',
      'held-out test set',
      'generalization error',
      'optimistic training score',
      'train_test_split',
      'mean squared error on unseen data',
      'set aside a test set before training',
      'in-sample vs out-of-sample error',
    ],
  },

  briefing: {
    observable: [
      'Ten points stand on a plot, labelled "Points: 10. Nothing fitted yet."',
      'Three of them — at x = 2, 7 and 9 — drop down to a tray under the plot marked "Held out" before anything is fitted: "Set aside before fitting — x: 2, 7, 9".',
      'A straight line is fitted to the remaining seven only: "Fitted to the training points only: ŷ = 1.139 + 0.617·x". It pivots on the mean of those seven and is not pulled toward the three in the tray.',
      'The line is measured on the seven training points: each residual y − ŷ is drawn and labelled (−0.91, −0.81, −0.46, 0.61, 0.83, 0.06, 0.68), and a readout shows "Training MSE: 0.46".',
      'The three held-out points return to their places and are measured against the same line: residuals −0.89, 0.83 and −1.36, "Held-out MSE: 1.11" — more than twice the training figure. The line has not moved; only the points it is measured on changed.',
      'The ten points are a toy set, and which three are held out is fixed from a shuffle written into the data, so every run sets aside the same three. The model is a single least-squares line and the score is mean squared error. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays itself once, five steps from the bare points to the held-out measurement, and stops.',
        'A Replay button and a playback strip sit below it. Dragging the strip back and forth between the last two steps sets "Training MSE: 0.46" and "Held-out MSE: 1.11" against the one unchanged line.',
        'The points, the three held out and the fitted line are fixed, so an article can quote the equation, the residuals and both MSE values exactly.',
      ],
    },

    useWhen: [
      'The reader believes a model that scores well on the data it was trained on has been shown to work, and the article needs one line whose error doubles the moment it is measured on points it never saw.',
      'The article explains why a test set has to be split off before training rather than after, and wants the fit visibly ignoring the three points in the tray.',
    ],

    avoidWhen: [
      'The article compares several ways of splitting or averages over many splits. There is one split here, made once.',
      'The subject is classification accuracy, precision or recall. The model is a regression line and the score is squared error.',
      'The point is a model that is too flexible and memorises noise. The model here is a straight line with two parameters; the gap comes from measuring on fitted points, not from excess capacity.',
    ],

    contrastWith: [
      {
        concept: 'crossValidation',
        note: 'Holding data out answers whether a score can be trusted at all; cross-validation assumes that and asks how much the held-out score depends on which data happened to be held out.',
      },
      {
        concept: 'rotateTheFold',
        note: 'A single hold-out leaves most items never tested. Rotating the test role gives every item one turn, fixing that waste but keeping the same rule that the tested items stay out of the fit.',
      },
      {
        concept: 'memorizeVsGeneralize',
        note: 'Both find a gap between training and unseen error. Here the gap exists even for a simple model because it was fitted to those points; memorizing is about a model flexible enough to make that gap huge.',
      },
      {
        concept: 'leastSquares',
        note: 'Least squares decides which line fits the training points best. Holding points out says that the resulting error on those same points is no measure of how the line does elsewhere.',
      },
    ],
  },
};
