/**
 * nonlinearBends 개념 선언.
 *
 * canonical facet 은 `facet:nonlinearBends` — 활성화 없는 층 셋을 입력 x 위에 띠로 쌓는다. 어느 단위의 출력도
 * a·x + b 꼴의 곧은 선이고, 마지막 걸음에서 무게를 곱해 한 층(기울기 0.75 · 절편 2.00)으로 접으면 층 3 의 선 위에
 * 그대로 겹친다. 스스로 재생하고 멈춘다. 다섯 걸음.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `mlpActivation` 은 활성화 없음이 학습에서 곧은 경계로 멈추는 것을 결과로 보인다. 형제 `layersCompose` 는
 * ReLU 가 모서리를 더하는 쪽을 쥔다. 이쪽의 한 동사는 **접힌다** — 굽힘이 없으면 층 여럿이 한 층과 같다. 그래서
 * definition 은 without activation · composition · collapses · single linear layer · matrix product 를 쥐고,
 * corner · hinge · XOR · training 을 쓰지 않는다.
 *
 * 전제: 무게(W1 · b1 · W2 · b2 · W3 · b3)는 예로 고른 값 · 입력은 x 하나(−2 … 2) · 어떤 무게를 골라도 결과는 같다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const nonlinearBendsConcept: FacetConceptSource = {
  id: 'nonlinearBends',
  label: 'Linear Layers Without Activation Collapse Into One',
  canonicalFacet: 'facet:nonlinearBends',

  surface: {
    definition:
      'Stacking layers with no activation function between them only composes linear maps, so multiplying their weight matrices yields a single equivalent linear layer and the extra depth adds nothing.',
    exemplarKeywords: [
      'why activation functions are necessary',
      'composition of linear functions is linear',
      'deep linear network',
      'collapsing layers',
      'W3 W2 W1 product',
      'affine transformation',
      'linear activation',
      'depth without nonlinearity',
      'identity activation',
    ],
  },

  briefing: {
    observable: [
      'Layers stack as bands from the bottom up. The bottom band is the input x itself, running from −2 to 2.',
      'Layer 1 adds two units, 1.50·x + 0.50 and −1.00·x + 1.00. Layer 2 adds −0.25·x + 1.25 and −2.00·x − 0.50. Layer 3 adds one unit, 0.75·x + 2.00, running from 0.50 to 3.50. Each caption lists the stacked layer and its slopes.',
      'No unit\'s slope is 0, so no line lies flat, but none of them ever bends.',
      'The last step folds the three layers into one: slope W3·W2·W1 = 0.75 and intercept W3·(W2·b1 + b2) + b3 = 2.00. The "one layer" line lies exactly on layer 3\'s line.',
      'Premises the screen does not footnote: the weights W1 = [[1.5], [−1]], b1 = (0.5, 1), W2 = [[0.5, 1], [−1, 0.5]], b2 = (0, −0.5), W3 = [[1, −0.5]], b3 = (0.5) are chosen for the example, not learned; with no activation any weights fold the same way into one straight line.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself — input, layer 1, layer 2, layer 3, fold — and stops. Five steps.',
        'A Replay button and a playback strip sit below it. The final step is the one to hold: the folded single-layer line lands exactly on top of the three-layer result.',
        'Every slope and intercept is fixed, so 0.75 and 2.00 can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article asserts that a network without nonlinear activations is no more powerful than one layer, and wants the algebra shown: three layers\' slopes multiplied to 0.75, landing on the same line.',
      'A reader thinks more layers automatically mean more expressive power; the fold step shows depth doing nothing until something bends between layers.',
    ],

    avoidWhen: [
      'The article is about what ReLU or sigmoid adds. No activation appears here; the claim is only about its absence.',
      'The subject is training, loss or classification accuracy. There is no data and no learning, only fixed lines in x.',
      'The input has many dimensions and the article is about matrix rank or dimensionality reduction. The input is one number and the output is one line.',
    ],

    contrastWith: [
      {
        concept: 'layersCompose',
        note: 'Linear layers fold into one no matter how many are stacked; ReLU units each contribute a place where the output may turn. The two claims are the two halves of why the bend matters.',
      },
      {
        concept: 'mlpActivation',
        note: 'The collapse is an algebraic identity true for every choice of weights; a network without activation failing to fit XOR is what that identity looks like once training is involved.',
      },
      {
        concept: 'linearRegression',
        note: 'A linear regression is exactly the one-layer linear map that any stack of activation-free layers reduces to; depth alone does not take a model beyond it.',
      },
    ],
  },
};
