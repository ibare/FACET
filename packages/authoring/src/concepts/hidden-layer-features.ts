/**
 * hiddenLayerFeatures 개념 선언.
 *
 * canonical facet 은 `facet:hiddenLayerFeatures` — XOR 네 입력 (0,0) · (0,1) · (1,0) · (1,1) 의 자리를, 학습된 2-2-1
 * 시그모이드 망의 가운데 층 단위 둘 h1 · h2 의 값으로 가로 · 세로 차례로 바꾼다. 답 0 짝의 거리 1.41 → 1.00 → 0.01,
 * 답 1 짝은 1.37 로 떨어진 채. 스스로 재생하고 멈춘다. 세 걸음.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `mlpActivation` 은 입력 평면의 경계가 휘는 것으로 성패를 본다. 형제 `layersCompose` 도 입력 평면에 머문다.
 * 이쪽의 한 동사는 **옮긴다** — 평면을 가운데 층의 좌표로 바꾸면 점이 새 자리에 모인다. 그래서 definition 은
 * new coordinates · representation · same-answer points pulled together · one straight line 을 쥐고, boundary bends ·
 * corner · training run · activation choice 를 쓰지 않는다.
 *
 * 전제: 무게는 예로 한 번 학습시킨 결과(교차 엔트로피 · 전체 묶음 경사 하강 · 학습률 2.0 · 3000 번)를 소수 한 자리로
 * 줄인 것 · 첫 무게가 다르면 다른 특징 · 출력 층은 나오지 않는다 · 거리는 유클리드.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const hiddenLayerFeaturesConcept: FacetConceptSource = {
  id: 'hiddenLayerFeatures',
  label: 'Hidden Layer Remaps Inputs to New Coordinates',
  canonicalFacet: 'facet:hiddenLayerFeatures',

  surface: {
    definition:
      'A trained hidden layer gives each input new coordinates, its units\' activations, and in those coordinates same-answer points that were far apart sit together, so one straight line can separate the classes.',
    exemplarKeywords: [
      'hidden representation',
      'learned features',
      'representation learning',
      'feature space of a hidden layer',
      'hidden units as feature detectors',
      'XOR becomes linearly separable in hidden space',
      'change of coordinates',
      'embedding learned by a network',
      'what the hidden layer learns',
    ],
  },

  briefing: {
    observable: [
      'The four XOR inputs (0,0), (0,1), (1,0), (1,1) start at their own places (x1, x2). The answer-0 pair (0,0) and (1,1) is diagonally farthest apart: "Answer-0 pair distance: 1.41".',
      'The horizontal place becomes unit 1\'s value, h1 = σ(7.3·x1 − 7.4·x2 − 3.9). All four points slide sideways together; (1,1) goes to the left edge and the answer-0 distance falls 1.41 → 1.00.',
      'The vertical place becomes unit 2\'s value, h2 = σ(7.3·x1 − 7.1·x2 + 3.5). (0,0) rises beside (1,1) and the answer-0 distance falls to 0.01 — almost one spot. The answer-1 pair stays 1.37 apart.',
      'In the new places (h1, h2) one straight line can separate the gathered answer-0 points from the two scattered answer-1 points.',
      'The features were not designed by hand: unit 1 is above 0.5 only for (1,0), unit 2 is below 0.5 only for (0,1). They are not the textbook OR and AND pair.',
      'Premises the screen does not footnote: the weights come from one example training run of a 2-2-1 sigmoid network (cross-entropy, full-batch gradient descent, learning rate 2.0, 3000 updates), rounded to one decimal; other starting weights give other features; the output layer does not appear, though with the rounded weights it still classifies all four inputs; distance is Euclidean.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself — the input places, then the horizontal swap, then the vertical swap — and stops. Three steps.',
        'A Replay button and a playback strip sit below it. Holding the last step shows the answer-0 pair nearly on top of each other at distance 0.01.',
        'Both unit formulas and all distances are fixed and can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article says a hidden layer "learns a representation" and needs that phrase made literal: four points given new coordinates, with the two XOR points that were farthest apart ending 0.01 apart.',
      'A reader assumes hidden units detect human-named features such as OR and AND; these two units, one firing only for (1,0) and one silent only for (0,1), show a network choosing its own.',
    ],

    avoidWhen: [
      'The article is about how the network was trained or how fast. The weights arrive already trained and nothing updates.',
      'The subject is the decision boundary drawn on the original input plane. The input plane is replaced here, not bent.',
      'The article discusses high-dimensional embeddings, word vectors or deep feature hierarchies. There are two hidden units and four points.',
    ],

    contrastWith: [
      {
        concept: 'layersCompose',
        note: 'A boundary bending in input space and points moving into hidden-unit space describe the same network from two sides; this concept keeps the separator straight and lets the data move.',
      },
      {
        concept: 'mlpActivation',
        note: 'Whether training on XOR succeeds is judged by the final boundary and correct count; what a successful hidden layer did to the inputs is the representation question asked here.',
      },
      {
        concept: 'kernelLifts',
        note: 'Both reach separability by moving data into other coordinates. A kernel\'s mapping is chosen in advance; a hidden layer\'s is learned from the data.',
      },
    ],
  },
};
