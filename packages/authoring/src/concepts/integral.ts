/**
 * integral 개념 선언.
 *
 * canonical facet 은 `facet:integral` — 곡선 y = x³ 위에서 기울기(점 x = 1 의 할선)와 넓이(구간 [0, 2] 의 리만 합)를
 * **같은 폭 h, 같은 잡는 자리**로 나란히 셈한다. 손잡이 둘 — 잡는 자리(왼쪽 · 오른쪽 · 가운데)와 폭 h(1 ~ 1/32, 처음 1/4).
 * 한 판 다섯 걸음의 끝에서 폭 2h 의 오차가 폭 h 의 오차로 줄고 그 비가 선다 — 끝을 잡으면 0.5 쪽, 가운데를 잡으면 0.250.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 넷)
 *
 * 조각 넷은 각각 한 장면이다 — 두 점이 붙어 접선이 됨(`secantToTangent`) · 이어 붙인 두 함수의 배가 곱해짐(`chainRuleMultiply`) ·
 * 조각이 갈라지며 합이 참 넓이로 다가감(`riemannSum`) · 쌓인 넓이의 빠르기가 높이와 같음(`fundamentalTheorem`).
 * 이쪽은 미분과 적분을 **한 폭으로 묶어 오차를 견주는 것**을 맡는다. 그래서 definition 은 halving · error ·
 * endpoint / midpoint · 반 대 사분의 일 쪽 낱말을 쥐고, 조각들이 쥔 secant slides · tangent · rectangles split ·
 * accumulated · chained 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `integral.md` 가 밝힌 것):
 *  - 곡선 x³ · 점 1 · 구간 [0, 2] · 2 진 폭 사다리는 예로 정한 값이다. 2 진 폭이라 이 곡선에서 중간값이 정확히 셈해진다.
 *  - 참값(기울기 3 · 넓이 4)은 거듭제곱 규칙으로만 셈하고, 추정은 차분과 합으로만 셈한다.
 *  - "반" 과 "사분의 일" 은 매끄러운 곡선에서 폭이 작을 때의 성질이다. 폭이 크면 끝의 비는 반에서 멀다.
 *  - x³ 에서 가운데 비가 매 칸 정확히 0.250 인 것은 셋째 도함수가 상수라서다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const integralConcept: FacetConceptSource = {
  id: 'integral',
  label: 'Derivative and Integral by Slicing (Endpoint vs Midpoint Error)',
  canonicalFacet: 'facet:integral',

  surface: {
    definition:
      'Halving the width h shrinks the error of both a difference-quotient slope and a Riemann-sum area, by about half when each sample sits at an endpoint and by a quarter at the midpoint.',
    exemplarKeywords: [
      'numerical differentiation',
      'numerical integration',
      'forward difference vs central difference',
      'backward difference',
      'left Riemann sum vs midpoint rule',
      'order of accuracy',
      'first-order vs second-order error',
      'truncation error',
      'error ratio when the step size halves',
      'finite difference step size',
      'derivative and integral side by side',
    ],
  },

  briefing: {
    observable: [
      'One curve, y = x³, carries two estimates computed with the same width h and the same sampling position: the slope at x = 1 from a secant, and the area over [0, 2] from strips of width h. Each has an Estimate, an Error and a True value; the true slope is 3 and the true area is 4.',
      'A round has five steps: the curve alone; the secant with its slope estimate, a dashed line marking the true tangent; the strip frames with one sample point per strip; the strips filling from left to right as the area estimate rises; and a comparison of errors at width 2h and width h with their ratio.',
      'At the start (Left, h = 1/4) the caption reads "Backward difference (f(a) − f(a − h)) / h · slope estimate 2.3125", the error is −0.6875, the 8 strips add up to 3.0625 with error −0.9375, and the last step shows "Width 1/2 → 1/4 · slope error ratio 0.550 · area error ratio 0.536".',
      'Sampling at an end gives ratios that head toward 0.5 as h shrinks: Left reaches 0.505 and 0.504 at h = 1/32, Right runs from 0.438 and 0.450 at h = 1/2 to 0.495 and 0.496 at h = 1/32. Middle gives 0.250 for both at every width from 1/2 to 1/32.',
      'The signs of the errors follow the position: Left undershoots both, Right overshoots both, Middle overshoots the slope and undershoots the area. At the same width Middle\'s errors are much smaller — at 1/4, 0.0625 and −0.0313 against Left\'s −0.6875 and −0.9375.',
      'At h = 1 there is no wider rung, so the comparison reads "no wider rung 2h to compare". The counters show the number of strips n (2 to 64) and "Calls to f", which is 2 + n whatever the sampling position.',
      'The curve, the point, the interval and the power-of-two widths are chosen examples; the true values come from the power rule, the estimates only from differences and sums. That the endpoint ratio nears one half and the midpoint ratio one quarter is a property of smooth curves at small widths — the exact 0.250 at every width here holds because the third derivative of x³ is constant. The screen footnotes none of this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Sample at" with Left, Right and Middle (starting at Left), and "Width h" with six positions 1, 1/2, 1/4, 1/8, 1/16, 1/32 (starting at 1/4). Each change replays the round.',
        'Moving "Sample at" slides each sample point inside its strip and moves the secant\'s moving end to the other side of the point; moving "Width h" pulls that end along the curve and splits every strip in two (or merges pairs when widening).',
        'The move that makes the idea land is holding the width and switching Left to Middle: the ratio jumps from about one half to 0.250 and both errors drop sharply, with no extra calls to f.',
        'The code panel, labelled "Difference and sum", starts empty with a "+ Add language" button and shows the chosen language with the current step\'s line highlighted. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why a central difference or the midpoint rule is more accurate than a one-sided rule for the same number of function evaluations, and wants the error ratio under halving to show it as a half versus a quarter.',
      'The article presents differentiation and integration as two limits of the same slicing idea and needs one screen where a single width controls both estimates and their errors.',
    ],

    avoidWhen: [
      'The subject is symbolic differentiation or integration rules such as substitution or integration by parts. The true values appear only as targets; no rule is derived on screen.',
      'The article is about higher-order schemes such as Simpson\'s rule, Richardson extrapolation or adaptive step control. Only endpoint and midpoint sampling are available.',
      'The topic is round-off error that grows when the step becomes too small. The widths stop at 1/32 and are exact in binary, so only truncation error is visible.',
    ],

    contrastWith: [
      {
        concept: 'secantToTangent',
        note: 'That secant slopes settle on the tangent slope defines the derivative; how fast the error shrinks, and how that speed depends on where the sample is taken, is a separate question about approximating it.',
      },
      {
        concept: 'riemannSum',
        note: 'A Riemann sum approaching the area is the definition of the integral; comparing endpoint and midpoint sampling asks how quickly each approach closes the gap.',
      },
      {
        concept: 'fundamentalTheorem',
        note: 'The fundamental theorem is why the exact area can be computed from an antiderivative at all; estimating that area by sums and measuring the error needs no such link.',
      },
      {
        concept: 'chainRuleMultiply',
        note: 'The chain rule concerns the rate of a composite function; approximating a single function\'s rate by a finite difference concerns how the step size controls the error.',
      },
      {
        concept: 'gradient',
        note: 'Both measure slope by a difference over a small width. With one input the only choice is where to sample; with two inputs the direction of the cut becomes the question.',
      },
    ],
  },
};
