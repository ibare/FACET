/**
 * trainDownValUp 개념 선언.
 *
 * canonical facet 은 `facet:trainDownValUp` — 훈련 점 여덟 · 검증 점 일곱 위에서 다항식 차수를 0 부터 6 까지 하나씩
 * 올리며 매번 훈련 점만으로 다시 맞추고, 훈련 MSE 와 검증 MSE 를 차수 축 위에 나란히 찍는다. 훈련은 3.25 → 0.00 으로
 * 내려가기만 하고, 검증은 차수 2 의 0.23 에서 꺾여 0.41 · 0.51 · 0.63 · 0.88 로 오른다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `overfitting` 은 이 장면(차수 손잡이 혼자) 위에 데이터 양을 돌린다. 이쪽은 **유연함을 한 칸씩 올릴 때 두 곡선이
 * 갈라지는 무늬** 한 장면이다. definition 은 degree · each step · bottoms out · climbs · U-shaped · complexity 를 독점하고,
 * 완제품의 more training points · sample, 형제 `memorizeVsGeneralize` 의 memorize · mislabeled 를 쓰지 않는다.
 * 가로축이 학습 시간이 아니라는 점으로 조기 종료 조각 `stopBeforeTurn` 과 갈린다.
 *
 * 전제 (설명 글 `trainDownValUp.md`): 점은 가운데가 불룩한 장난감 데이터. 차수 6 에서 멈춘다 — 계수 일곱 < 점 여덟이라
 * 차수 6 의 훈련 MSE 는 두 자리로 0.00 이지만 실제로는 0.003 남짓이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const trainDownValUpConcept: FacetConceptSource = {
  id: 'trainDownValUp',
  label: 'Training Error Falls While Validation Error Turns (Model Complexity Curve)',
  canonicalFacet: 'facet:trainDownValUp',

  surface: {
    definition:
      'Raising polynomial degree one step at a time drives training MSE down at every step, while validation MSE bottoms out at a moderate degree and then climbs: the U-shaped complexity curve.',
    exemplarKeywords: [
      'model complexity curve',
      'validation curve',
      'U-shaped validation error',
      'underfitting vs overfitting',
      'choosing polynomial degree',
      'scikit-learn validation_curve',
      'training error always decreases',
      'sweet spot of model capacity',
      'bias-variance U curve',
    ],
  },

  briefing: {
    observable: [
      'Two panels. On the left, eight train points and seven validation points with the current polynomial written out ("ŷ = c₀ + c₁x + c₂x²") and a vertical bar from each point to the curve. On the right, a "train" line and a "validation" line over an axis labelled "degree (model flexibility)" from 0 to 6, with MSE upward.',
      'Each step raises the degree by one and refits using the train points only; the curve bends from its previous shape into the new one. Captions read "Degree 3: refitted to the train points" and "Train MSE: 0.30 → 0.08 · validation MSE: 0.23 → 0.41".',
      'Train MSE falls at every step: 3.25, 3.23, 0.30, 0.08, 0.04, 0.03, 0.00. Validation MSE follows it down to 0.23 at degree 2, then rises at every further step: 0.41, 0.51, 0.63, 0.88. From degree 3 on, a "lowest validation MSE" mark stays at degree 2.',
      'After the turn the band between the two lines widens step by step. At degrees 0 and 1 validation is slightly below train (3.03 vs 3.25, 3.00 vs 3.23); the widening belongs only to the part after the turn.',
      'The points are toy data, high in the middle and low at both ends. Degree stops at 6: seven coefficients for eight points, so the curve does not pass through every train point and the 0.00 shown at degree 6 is really about 0.003. The horizontal axis is model flexibility, not training time. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one degree per step, seven steps from degree 0 to degree 6.',
        'A Replay button and a playback strip sit below it. Dragging between degree 2 and degree 3 holds the turn: train still drops (0.30 → 0.08) while validation starts to rise (0.23 → 0.41).',
        'All points are fixed, so every MSE pair can be quoted to two decimals.',
      ],
    },

    useWhen: [
      'The article introduces the validation curve over model complexity and needs the textbook shape produced by real refits: one line only falls, the other falls, turns and rises.',
      'A reader believes a lower training error always means a better model; the step from degree 2 to 3, train improving and validation worsening, contradicts it directly.',
      'The article uses the degree of a polynomial to explain underfitting on one side of the minimum and overfitting on the other.',
    ],

    avoidWhen: [
      'The horizontal axis the article has in mind is epochs or training iterations. Here each point is a separate, fully fitted model.',
      'The subject is how the pattern changes with more data. The data never changes here.',
      'The article discusses double descent or interpolation beyond the number of points. The degree stops below the point count.',
    ],

    contrastWith: [
      {
        concept: 'stopBeforeTurn',
        note: 'Both watch validation loss turn upward, but along different axes: complexity is chosen by selecting a model, training time by deciding when to stop.',
      },
      {
        concept: 'overfitting',
        note: 'The complexity curve is drawn for one fixed dataset; how far the validation line climbs at the flexible end depends on how much data the fit had.',
      },
      {
        concept: 'memorizeVsGeneralize',
        note: 'Memorizing and generalizing are opposite kinds of learner; a complexity sweep shows one model family sliding from the second kind toward the first as its capacity grows.',
      },
      {
        concept: 'linearRegression',
        note: 'A straight-line fit is the low-capacity end of this sweep; raising the degree keeps the same least-squares fitting and only enlarges the family of curves it may choose from.',
      },
      {
        concept: 'crossValidation',
        note: 'Reading the minimum of a validation curve assumes the validation estimate is trustworthy; cross-validation is how that estimate is made less dependent on one split.',
      },
    ],
  },
};
