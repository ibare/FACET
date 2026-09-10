/**
 * residualDistance 개념 선언.
 *
 * canonical facet 은 `facet:residualDistance` — 고정된 직선 하나와 관측점
 * 다섯. 한 점에서 원이 자라 직선에 닿는 것으로 최단거리를 먼저 보이고, 그
 * 원을 뚫고 나가는 세로 막대로 그것을 대체한 뒤, 나머지 점에도 같은 막대를
 * 내려꽂는 조각이다. 계수는 학습하지 않는다.
 *
 * ── 묶음 안에서 갈라 둔 자리
 *
 * 완제품 `linearRegression`(이미 있음) 은 **선을 옮겨 오차를 줄여 가는 절차
 * 전체** 를 진다 — 기울기와 절편, 손실 곡선, 학습률.
 *
 * 이 조각이 지는 것은 그보다 앞선 한 가지다 — **틀림을 무엇으로 재는가**.
 * 재는 방향이 수선이 아니라 세로인 까닭 하나에 definition 전부를 걸었고,
 * "fit" · "minimise" · "gradient" 같은 말은 한 번도 쓰지 않았다.
 *
 * 잰 값들을 어떻게 한 수로 합치는가는 형제 조각 `leastSquares` 의 몫이다.
 *
 * 변별어를 붙였다. "residual" 하나로는 신경망의 잔차 연결과 회계상의 잔여가
 * 같은 이름을 쓴다 (C4 명명 규칙 2).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const residualDistanceConcept: FacetConceptSource = {
  id: 'residualDistance',
  label: 'Residual (Vertical Gap Between Observed and Predicted)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:residualDistance',

  surface: {
    definition:
      'The signed vertical gap between an observed value and what a line predicts at the same input, measured along the axis being predicted rather than at right angles.',
    exemplarKeywords: [
      'residual',
      'observed minus predicted',
      'error at one data point',
      'vertical distance to the line',
      'why not the perpendicular distance',
      'sign of the error',
      'over-prediction and under-prediction',
      'how wrong is the model here',
      'shortest distance to a line',
      'reading a scatter plot against a trend line',
    ],
  },

  briefing: {
    observable: [
      'The rejected way of measuring is shown before the accepted one: a circle grows out of the point until it just touches the line, and a right-angle mark is planted where it touches.',
      'The vertical bar is then drawn through that same circle and out the other side to reach the line, so it is plainly the longer of the two reaches rather than an equally good alternative.',
      'The circle and the perpendicular stay behind as faint ghosts instead of being erased, which keeps the comparison on screen while the rest of the points are measured.',
      'Each of the remaining four points drops its own vertical bar in turn, and the bars land on both sides of the line — some points sit above it and some below.',
      'Every bar carries its value with a sign, so above the line and below the line are told apart by the number and not only by the picture.',
      'The line never moves for the whole run, so nothing on screen suggests that measuring and improving are the same act.',
      'The vertical scale is deliberately generous, which keeps the line steep enough that a perpendicular reach and a vertical one point in visibly different directions.',
    ],

    screen: {
      affordances: [
        'The screen plays itself once on mount, from the first point to the last, and stops.',
        'Two buttons: Replay, and a step control that walks the same measurements one at a time, which is how a reader can hold the frame where the circle and the vertical bar are both present.',
        'The line and the five points are fixed, so an article can name the point that sits below the line and rely on the reader finding it.',
      ],
    },

    useWhen: [
      'The article is about to add errors up or square them, and the reader has never been told what one error is. Everything downstream reads differently once the quantity being summed is a specific segment on screen.',
      'The reader\'s instinct is that "distance to the line" means the shortest distance, and the prose is quietly using a different one. Growing the circle first and then overshooting it settles which is meant without an argument.',
      'A model is being described as a machine that takes an input and returns a value, and the reader should see that the input is not something the model can be wrong about — only the returned value is.',
      'The article needs the sign to carry meaning: a point above the line and a point below it are different kinds of miss, and the numbers on the bars say which is which.',
    ],

    avoidWhen: [
      'The article uses "residual" for the skip connections in a deep network. That is a shortcut around layers and has nothing to do with a gap from a line.',
      'The subject is a leftover in accounting, scheduling or inventory — a residual value, a residual claim, what remains after allocation.',
      'The article is about fitting a line where both variables carry error and the perpendicular gap is the right measure. Here that measure is shown in order to be set aside.',
      'The point is how the individual errors are combined into a single score for a line, or why they get squared.',
      'The subject is moving a line to make the errors smaller. The line here is fixed precisely so the act of measuring can be seen on its own.',
    ],

    contrastWith: [
      {
        concept: 'leastSquares',
        note: 'This is one gap, measured; that one takes a whole set of such gaps and asks what arithmetic turns them into a single verdict on a line.',
      },
      {
        concept: 'linearRegression',
        note: 'The quantity being minimised, held still and examined, against the run in which a line moves until the total of those quantities stops shrinking.',
      },
      {
        concept: 'projectAndLose',
        note: 'Both drop a point onto a line, but there the drop is at right angles and is the whole point, and here the right-angled drop is the candidate that gets rejected.',
      },
    ],
  },
};
