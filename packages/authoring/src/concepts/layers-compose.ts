/**
 * layersCompose 개념 선언.
 *
 * canonical facet 은 `facet:layersCompose` — ReLU 단위 셋(h₁ = max(0, x₁ − 0.5·x₂) · h₂ = max(0, −x₁ − 0.5·x₂) ·
 * h₃ = max(0, x₂ − 1))을 둘째 층 합 o = −1 + h₁ + h₂ + h₃ 에 하나씩 더한다. 경계 o = 0 의 모서리가 0 → 0 → 2 → 4 로
 * 늘며 원점을 감싸는 그릇이 된다. 스스로 재생하고 멈춘다. 네 걸음.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `mlpActivation` 은 학습이 그런 무게를 찾는가를, 형제 `nonlinearBends` 는 굽힘이 없으면 층이 접힌다는 것을,
 * `hiddenLayerFeatures` 는 가운데 층이 점을 옮긴다는 것을 쥔다. 이쪽의 한 동사는 **꺾인다** — 꺾임선을 더할 때마다
 * 경계에 모서리가 생긴다. 그래서 definition 은 hinge line · corner · piecewise linear · summing ReLU units 를 쥐고,
 * training · XOR · collapse · moves points 를 쓰지 않는다.
 *
 * 전제: 무게와 치우침은 예로 고른 값(학습한 것이 아니다) · 앞으로 셈만 · 평면 [−2, 2]².
 */

import type { FacetConceptSource } from '../concept-types.js';

export const layersComposeConcept: FacetConceptSource = {
  id: 'layersCompose',
  label: 'ReLU Hinges Add Corners to the Boundary',
  canonicalFacet: 'facet:layersCompose',

  surface: {
    definition:
      'Each ReLU unit contributes one straight hinge line, and summing units in the next layer lets the decision boundary change direction only where a hinge is crossed, making it piecewise linear with corners.',
    exemplarKeywords: [
      'piecewise linear function',
      'ReLU network regions',
      'linear regions of a ReLU network',
      'hinge function max(0, x)',
      'sum of ReLUs',
      'how ReLU networks bend decision boundaries',
      'activation pattern',
      'second layer combines hidden units',
      'kink in the boundary',
    ],
  },

  briefing: {
    observable: [
      'The input plane is [−2, 2] × [−2, 2]. Three hidden units are fixed: h₁ = max(0, x₁ − 0.5·x₂), h₂ = max(0, −x₁ − 0.5·x₂), h₃ = max(0, x₂ − 1). Each unit\'s hinge line, where it switches on, is dashed. The second-layer sum is o = −1 + h₁ + h₂ + h₃, and o > 0 is on.',
      'Step 0: nothing is in the sum yet, o = −1 everywhere and there is no boundary.',
      'Adding h₁ pushes a boundary in from the lower-right corner until it is the straight line from (0, −2) to (2, 2). "Corners: 0".',
      'Adding h₂: in the lower band where both units are on, the boundary lies flat along x₂ = −1 and turns at (−0.5, −1) and (0.5, −1). "Corners: 2".',
      'Adding h₃: above x₂ = 1 the boundary turns again, gaining corners at (−1.5, 1) and (1.5, 1). "Corners: 4", and the boundary is a bowl around the origin. Each addition is animated by growing that unit\'s weight from 0 to 1.',
      'Every corner sits on a dashed hinge line: inside a region where the same units are on, o is linear in x and the boundary is straight; it can only change direction where a unit switches.',
      'Four marked places never move. At the end the origin (0, 0) has o = −1.00 and (0, 1.5) has −0.50, both off; (0, −1.5) and (1.5, 0) have 0.50, both on. The boundary changes shape; the points do not travel.',
      'Premises the screen does not footnote: the weights and biases are chosen for the example, not learned; the network only computes forward.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, adding one unit per step, and stops at the bowl — four steps including the empty sum.',
        'A Replay button and a playback strip sit below it. Scrubbing to the h₂ step holds the first two corners appearing exactly where the boundary crosses the dashed hinge lines.',
        'The units, corner coordinates and the four marked values are fixed and can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article claims that ReLU networks compute piecewise linear functions and wants the reason made visible: each corner of the boundary sits on some unit\'s hinge line.',
      'A reader cannot see how units that each draw only a straight line produce a curved-looking boundary; watching the corner count go 0, 2, 4 as units are summed answers it.',
    ],

    avoidWhen: [
      'The article is about training, loss or gradient descent. The weights are set by hand and never change.',
      'The activation under discussion is smooth, such as sigmoid or tanh. The corners here come from the sharp switch of ReLU.',
      'The point is that layers without any activation collapse into one. Every unit here has its ReLU, and the subject is what that bend adds.',
    ],

    contrastWith: [
      {
        concept: 'nonlinearBends',
        note: 'Without an activation, adding layers adds nothing; with ReLU, each added unit adds a possible corner. The two claims are the two halves of why the bend matters.',
      },
      {
        concept: 'hiddenLayerFeatures',
        note: 'One view keeps the input plane fixed and lets the boundary bend; the other keeps the boundary straight and moves the points into hidden-unit coordinates. The same network can be read either way.',
      },
      {
        concept: 'mlpActivation',
        note: 'Hand-set units show what a ReLU layer can express; training decides whether that shape is actually found, and how many units it has to work with.',
      },
      {
        concept: 'decisionBoundary',
        note: 'A logistic model has one straight boundary set by its weights. A second layer summing ReLU units is what lets the boundary have corners at all.',
      },
    ],
  },
};
