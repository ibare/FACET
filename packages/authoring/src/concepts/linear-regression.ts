/**
 * linearRegression 개념 선언.
 *
 * canonical facet 은 `facet:linearRegression` — 좌측 데이터 평면(직선 + 잔차 정사각형)과
 * 우측 매개변수 평면(등고선 + 굴러가는 점)이 1:1 로 동기하는 두 시점 구조 +
 * 손실 곡선 + 학습률 3단계 슬라이더.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const linearRegressionConcept: FacetConceptSource = {
  id: 'linearRegression',
  label: 'Linear Regression',
  domain: 'ml-basics',
  canonicalFacet: 'facet:linearRegression',

  surface: {
    definition:
      'Fitting a straight line to scattered points by adjusting its slope and intercept until the sum of squared vertical distances is as small as possible.',
    exemplarKeywords: [
      'linear regression',
      'least squares',
      'residual',
      'line of best fit',
      'gradient descent',
      'learning rate',
      'loss function',
      'convergence',
      'slope and intercept',
      'first machine learning model',
    ],
  },

  briefing: {
    observable: [
      'Each residual is drawn as an actual square standing on the gap between a point and the line, so "sum of squared errors" is an area on screen rather than a formula.',
      'Two views move together: the line rotating in the data plane on the left and a dot rolling across a contour map on the right are the same event seen twice.',
      'The contours are labelled outer = larger, centre = smaller, so the dot rolling inward is visibly rolling downhill.',
      'Two gauges move asymmetrically — the signed residual sum can sit near zero while the squared sum is still large, which is why the squares are what gets minimised.',
      'A loss curve accumulates below, turning the run into a history instead of only a current position.',
      'The learning rate has three settings and each produces a different motion: slow crawls, tuned settles, diverge throws the line off entirely.',
      'Convergence is marked as an event when the loss stops shrinking, so stopping is something that happens rather than something the reader has to judge.',
    ],

    screen: {
      affordances: [
        'Playback controls: play, single step, pause, reset, plus a learning-rate slider with three positions.',
        'The learning-rate slider is the control that carries the lesson — running the same data at slow, tuned and diverge is the argument about step size, made by the screen.',
        'Stepping once is how to catch a single update: the squares shrink and the dot moves a notch, in the same frame.',
      ],
    },

    useWhen: [
      'The reader should see that the line is chosen, not derived — moving slope and intercept and watching the error shrink is what "fitting" means.',
      'The article is about why squared distances rather than plain ones, which needs the reader to see one far point dominate.',
    ],


    avoidWhen: [
      'The article is about multiple regression or higher-dimensional features. There are two parameters here precisely so the loss surface can be drawn as a map.',
      'The subject is classification or logistic regression. The residual squares assume a continuous target.',
      'The point is overfitting, regularization, or train/test splits. There is one dataset here and no notion of generalisation.',
      'The article needs a closed-form solution (normal equations). This shows iterative descent, which is the opposite approach.',
    ],

    contrastWith: [
      {
        concept: 'matrixTransform2d',
        note: 'Both draw a parameter space beside the thing it controls, but here the reader watches a point roll to a minimum rather than watching a plane deform.',
      },
    ],
  },
};
