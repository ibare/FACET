/**
 * leastSquares 개념 선언.
 *
 * canonical facet 은 `facet:leastSquares` — 점 넷과 미리 정해 둔 직선 셋,
 * 그리고 직선마다 하나씩 선 쌓는 자리. 부호를 지닌 채 쌓으면 셋 다 기준선으로
 * 돌아오고(문제), 재는 자를 길이에서 넓이로 바꾼 뒤(장치), 다시 쌓으면 셋이
 * 갈린다(결과). 직선은 학습하지 않는다.
 *
 * ── 묶음 안에서 갈라 둔 자리
 *
 * 완제품 `linearRegression`(이미 있음) 은 선을 옮겨 오차를 줄여 가는 절차
 * 전체를 진다. 형제 조각 `residualDistance` 는 한 점에서의 어긋남을 무엇으로
 * 재는가를 진다.
 *
 * 이 조각이 지는 것은 그 둘 사이의 한 칸이다 — **여러 어긋남을 한 수로 접는
 * 방법의 선택**. 왜 그냥 더하면 안 되고 무엇을 제곱이 고치는가. 그래서
 * definition 의 주어는 직선도 점도 아니고 "후보 직선에 매기는 점수" 이며,
 * "fit" · "slope" · "descent" 는 한 번도 쓰지 않았다.
 *
 * 변별어를 붙이지 않았다. "least squares" 는 이 셈법 하나를 가리키는 이름이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const leastSquaresConcept: FacetConceptSource = {
  id: 'leastSquares',
  label: 'Least Squares (Why the Errors Get Squared)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:leastSquares',

  surface: {
    definition:
      'Scoring a candidate line by the total of its squared errors, because errors kept with their signs cancel against each other and rank good and bad candidates alike.',
    exemplarKeywords: [
      'least squares',
      'sum of squared errors',
      'why square the errors',
      'the errors cancel out',
      'signed sum comes to zero',
      'absolute value versus squaring',
      'squared loss',
      'comparing candidate lines',
      'a length becomes an area',
      'choosing a cost function',
      'penalising large misses more',
    ],
  },

  briefing: {
    observable: [
      'Three candidate lines are laid over the same four points and stay exactly where they are for the whole run, so nothing on screen suggests a line is being searched for.',
      'The misses leave the points: they detach and travel to a lane of their own, one lane per line, where they stack head to tail.',
      'Stacked with their signs the stack climbs and then comes back down, and all three lanes end level with the baseline — an obviously bad line and an obviously good one score the same.',
      'The measure then changes in a step of its own: the lanes are emptied and the baseline drops to the floor to make room for something that only goes up.',
      'Each bar unfolds into a square on its own length, and the square is then squeezed to the lane width and stretched upward with its area preserved, so the height of a tower is the area of the squares in it.',
      'The three towers now stand at different heights and the flat line, the steep line and the fitting line finally separate, with the fitting line lowest.',
      'The two totals are labelled with different notation, so the reader can see that the same misses are being run through two different sums rather than being recomputed.',
      'The closing step points at the shortest tower, which states the rule in terms of what is on screen rather than in terms of a formula.',
    ],

    screen: {
      affordances: [
        'The screen plays the argument by itself on mount — three lanes cancelling, the change of measure, three lanes piling up — and stops on the verdict.',
        'Two buttons: Replay, and a step control that walks the same sequence one move at a time, which is how a reader can stay on the frame where all three signed totals are zero.',
        'The four points and the three lines are fixed, so an article can name 26, 11 and 6 and rely on the reader reading them off the towers.',
      ],
    },

    useWhen: [
      'The article has stated the rule as "minimise the sum of squared errors" and the reader takes the squaring for a convention. Watching three signed totals land on zero turns the squaring into an answer to a problem the reader has just seen.',
      'The reader needs to feel that a scoring rule is a design choice rather than something handed down: the same four points and the same three lines produce a useless ranking under one rule and a usable one under the other.',
      'The prose calls the squared error an area and the reader hears a metaphor. Bars unfolding into actual squares and pouring into a tower whose height is their combined area makes the word literal.',
      'An argument is being made that a scoring rule must be able to separate candidates before it can be optimised, and a rule that scores everything the same is the cleanest counterexample.',
    ],

    avoidWhen: [
      'The subject is solving for the best line in closed form — normal equations, matrix inverses, the algebra of the solution. Three lines are handed over here and nothing is solved.',
      'The article is about reaching the answer by iteration — steps, learning rates, convergence. Nothing moves toward anything on this screen.',
      'The point is that squaring is the wrong choice in the presence of outliers, and a robust alternative should be used instead. The absolute-value route is not on screen at all.',
      'The article uses "least squares" as the name of a routine applied to many variables at once, where what matters is the call and not the reason for the square.',
      'The subject is what a single error is or which direction it is measured in. That is settled before this screen begins.',
    ],

    contrastWith: [
      {
        concept: 'residualDistance',
        note: 'That one defines the quantity and stops at one point; this one takes a whole set of them and asks what arithmetic turns them into a verdict on a line.',
      },
      {
        concept: 'linearRegression',
        note: 'The scoring rule examined on three fixed candidates, against the run where that same score is driven downward by moving one line.',
      },
      {
        concept: 'impurityDrops',
        note: 'Both judge a choice by a single number computed from the data, and both depend on that number being unable to stay flat when the choice is a bad one.',
      },
    ],
  },
};
