/**
 * partialSlice 개념 선언.
 *
 * canonical facet 은 `facet:partialSlice` — f(x, y) = x²y 의 점 (1, 2) 에서 먼저 y 를 2 로 붙들어 곡선 2x² 를 떼어 내고
 * 그 x = 1 기울기 4 = ∂f/∂x 를, 이어 x 를 1 로 붙들어 곡선 y 를 떼어 내고 그 y = 2 기울기 1 = ∂f/∂y 를 잰다.
 * 같은 점인데 자르는 방향에 따라 4 대 1. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `gradient` 는 아무 방향으로나 잘라 방향 기울기와 ∇f 를 견준다. 이쪽은 그 앞 — **한 입력을 붙들면 곡선 한 줄기가
 * 남고 그 기울기가 편도함수** — 하나다. 그래서 definition 은 hold fixed · single-variable curve · partial derivative ·
 * different slope at the same point 를 쥐고, 방향 · 코사인 · 가장 가파름 · 걸음 같은 말을 넣지 않는다. 두 수를 화살표로
 * 묶는 것은 형제 `gradientSteepest` 의 말이다.
 *
 * 전제 (설명 글 `partialSlice.md` 가 밝힌 것):
 *  - 함수 · 점 · 격자 간격은 예로 정한 값이다. 단면 기울기는 한 변수 항 목록을 거듭제곱 규칙으로 미분해 셈했다.
 *  - 함수가 그 점 둘레에서 매끄러우면 어느 함수, 어느 점에서나 같게 통한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const partialSliceConcept: FacetConceptSource = {
  id: 'partialSlice',
  label: 'Partial Derivative (Hold One Input, Slice Out a Curve)',
  canonicalFacet: 'facet:partialSlice',

  surface: {
    definition:
      'Holding one input of a two-variable function fixed leaves a single-variable curve whose slope at the point is the partial derivative; holding the other input instead yields a different slope there.',
    exemplarKeywords: [
      'partial derivative',
      '∂f/∂x and ∂f/∂y',
      'hold the other variable constant',
      'treat y as a constant',
      'cross-section of a surface',
      'function of two variables',
      'slice of a surface',
      'multivariable calculus introduction',
      'partial derivative notation',
    ],
  },

  briefing: {
    observable: [
      'The left panel is the input plane for f(x, y) = x²y: a grid from x 0 to 2 and y 0 to 3 in steps of 0.25, each grid point drawn as a circle sized by the function value there. The point (1, 2) is marked, "Point (1, 2) · f 2.00".',
      '"Hold y = 2 → slice f(x, 2) = 2x²": a cut line runs along y = 2 and the grid points on it fly into the first of two frames on the right and settle at their heights, forming the curve 2x². Next, "Slope of the slice at x = 1: 4.00 = ∂f/∂x" with a slope line drawn on that curve.',
      '"Hold x = 1 → slice f(1, y) = y": a vertical cut at x = 1 lifts its points, which turn sideways as they fly so that y becomes the horizontal axis of the second frame. Then "Slope of the slice at y = 2: 1.00 = ∂f/∂y".',
      'The last step reads "Same point (1, 2) · ∂f/∂x 4.00 · ∂f/∂y 1.00": the two numbers stand side by side, not combined into an arrow. Six steps in all, counting the opening.',
      'The two right frames share both horizontal and vertical scales, so the slope-4 line stands visibly four times steeper than the slope-1 line (within a frame the two axes use different scales). The function, the point and the grid spacing are chosen examples; the slice formulas are produced from the function, and the result equals the partial derivatives 2xy and x² computed directly. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays its six steps by itself and stops with both partial derivatives side by side.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging the strip back to either cut shows the grid points lifting into their slice.',
        'The function and the point are fixed, so every slice formula and slope can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces partial derivatives and needs to show what "hold y constant" actually does: it turns a surface into an ordinary curve whose slope is a familiar one-variable derivative.',
      'A reader expects a function of two inputs to have one slope at a point, and the article wants the same point giving 4 in one direction and 1 in the other.',
    ],

    avoidWhen: [
      'The article is about the gradient vector, directional derivatives or the steepest direction. The two partials are only placed side by side, never combined.',
      'The subject is mixed or second partial derivatives, or the Jacobian. Only first partials of one scalar function appear.',
      'The reader should pick the point or the function. Both are fixed.',
    ],

    contrastWith: [
      {
        concept: 'gradient',
        note: 'A partial derivative cuts along an axis; a directional derivative cuts along any direction, and the two partials turn out to be enough to predict all of those slopes.',
      },
      {
        concept: 'gradientSteepest',
        note: 'Partial derivatives are two slopes measured separately; bundling them into the gradient vector is what identifies the steepest direction at the point.',
      },
      {
        concept: 'secantToTangent',
        note: 'Once one input is held fixed, the slope of the remaining curve is an ordinary derivative, defined exactly as for a function of one variable.',
      },
      {
        concept: 'chainRuleMultiply',
        note: 'The chain rule composes rates along a chain of functions; partial differentiation separates the rates of one function with several inputs by freezing all but one.',
      },
    ],
  },
};
