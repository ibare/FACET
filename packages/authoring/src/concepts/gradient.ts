/**
 * gradient 개념 선언.
 *
 * canonical facet 은 `facet:gradient` — f = x² + 3y² 의 한 점 p 에서 고른 방향으로 곡면을 잘라 그 단면의 기울기 s 를
 * 가운데 차분으로 재고, 두 편미분으로 만든 ∇f 와 같은 축척으로 견준다. 손잡이 둘 — 점(다섯)과 재는 방향(45° 씩 여덟).
 * 지도 위에는 ∇f 를 지름으로 하는 원이 서고, s·u 의 끝이 그 원 위에 놓인다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 각각 한 장면이다 — 한 입력을 붙들어 단면 한 줄기(`partialSlice`) · 한 점에서 방향을 한 바퀴 돌려 가장 가파른 쪽
 * 찾기(`gradientSteepest`) · −η∇f 로 한 번 옮기기(`gradientStep`). 이쪽은 **점과 방향을 둘 다 돌려 방향 기울기와 ∇f 의
 * 관계(투영 · 코사인 · 넘지 못함)를 견주는 것**을 맡는다. 그래서 definition 은 any direction · cosine of the angle ·
 * never exceeds 쪽 낱말을 쥐고, 조각들이 쥔 hold fixed · full circle · rises and falls · learning rate · step 을 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `gradient.md` 가 밝힌 것):
 *  - 함수 x² + 3y², 점 다섯, 방향 여덟은 예로 정한 값이다.
 *  - s 는 δ 0.001 의 가운데 차분으로 잰다 (이차 함수라 부동소수 오차 말고는 정확하다). ∇f 는 거듭제곱 규칙으로 셈한다.
 *  - 두 성질은 미분 가능한 함수에서의 것이다. 방향이 여덟 칸뿐이라 ∇f 가 칸 사이에 놓이는 점에서는 가장 큰 칸도 |∇f| 에 못 미친다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const gradientConcept: FacetConceptSource = {
  id: 'gradient',
  label: 'Directional Derivative and the Gradient',
  canonicalFacet: 'facet:gradient',

  surface: {
    definition:
      'At any point of a two-variable function, the slope along a chosen direction equals the gradient\'s length times the cosine of the angle between them, so it never exceeds |∇f| and reduces to a partial derivative along an axis.',
    exemplarKeywords: [
      'directional derivative',
      'gradient vector',
      '∇f · u',
      'directional derivative as a dot product',
      'magnitude of the gradient',
      'maximum rate of change',
      'contour map and level curves',
      'cross-section of a surface',
      'multivariable calculus',
      'partial derivatives form the gradient',
    ],
  },

  briefing: {
    observable: [
      'Three panels: a contour map of f = x² + 3y² with level curves 1, 3, 4, 7 and 9 and the point p; a section window plotting g(t) = f(p + t·u) for t from −1 to 1 along the cut; and bars that stand the slope s and the length |∇f| "on one scale", the s row framed by a dashed box from −|∇f| to |∇f|.',
      'A round has four steps: the point and its height f(p); the cut through p in the chosen direction and its section curve; the tangent of the section at t = 0 with "Slope of the section at t = 0 · s = …"; and the ∇f arrow with |∇f| and the angle of ∇f laid over everything.',
      'At the start — point (2, 1), direction 0° — the height is 7, s = 4.00, and the last step reads "s = 4.00 · ∂f/∂x = 4 · |∇f| = 7.21" with ∇f = (4, 6) at 56.3°. At 90° the partial shown beside s is ∂f/∂y instead; at the other directions only s and |∇f| stand.',
      'On the map a circle is drawn with ∇f as its diameter, and the tip of s·u always lands on that circle. At (3, 0) and (0, 1) the gradient lies on one of the eight directions, so s reaches |∇f| = 6 there; at (2, 1), (−1, 1) and (1, −1) it lies between directions (56.3°, 108.4°, 288.4°) and no direction reaches |∇f|.',
      'The counters show "Height f at the point" and "Angle to ∇f (degrees)", which is 0 at the head of the round and takes its value at the last step.',
      's is measured by a central difference (f(p + δu) − f(p − δu)) / (2δ) with δ = 0.001, while ∇f comes from the power rule, so the match between the 0° slope and ∂f/∂x is a comparison, not a restatement. The function, points and directions are chosen examples, and both properties shown hold for differentiable functions; the screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Point" with five positions (2, 1), (3, 0), (0, 1), (−1, 1), (1, −1), starting at (2, 1), and "Direction" with eight positions from 0° in 45° steps, starting at 0°. Each change replays the round.',
        'Changing the point slides it across the map and the cut follows; changing the direction swings the cut the short way round and morphs the section curve.',
        'The move that makes the idea land is keeping one point and stepping the direction around: s grows as the angle to ∇f shrinks, turns negative past 90°, and at (3, 0) meets |∇f| exactly when the angle counter reads 0.',
        'The code panel, labelled "Directional slope by central difference", starts empty with a "+ Add language" button and shows the chosen language with the current step\'s line highlighted, one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article derives D_u f = ∇f · u and wants the reader to try several points and directions and see the measured slope track |∇f| cos θ, including where it turns negative.',
      'A reader confuses partial derivatives with the gradient or with the slope in some arbitrary direction, and the article needs all three set against one another at the same point.',
    ],

    avoidWhen: [
      'The article is about gradient descent, learning rates or optimisation. No point moves here; the gradient is only measured and compared.',
      'The subject is the Hessian, curvature or second-derivative tests for maxima and minima. Only first derivatives appear.',
      'The function has more than two inputs or is not differentiable at the point in question. The surface here is a smooth quadratic in x and y.',
    ],

    contrastWith: [
      {
        concept: 'partialSlice',
        note: 'A partial derivative is the slope of one slice with the other input held fixed; the directional derivative generalises that slice to any direction, and the two partials become the components that predict every such slope.',
      },
      {
        concept: 'gradientSteepest',
        note: 'That the gradient points up the steepest direction is one consequence of D_u f = |∇f| cos θ; the formula also gives every other direction\'s slope, zero at right angles and negative beyond.',
      },
      {
        concept: 'gradientStep',
        note: 'Measuring the gradient and moving by it are different acts: the directional-derivative relation describes slopes at a point that stays put, while a descent step uses the negative gradient, scaled, to relocate the point.',
      },
      {
        concept: 'gradientDescent',
        note: 'Gradient descent is an optimisation procedure that relies on the gradient; the relation between directional slopes and the gradient is the calculus fact that justifies following it.',
      },
      {
        concept: 'integral',
        note: 'With one input, a finite-difference slope has only a sampling position to choose; with two inputs it also has a direction, and the gradient summarises all directions at once.',
      },
    ],
  },
};
