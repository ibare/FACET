/**
 * encodeToDistribution 개념 선언.
 *
 * canonical facet 은 `facet:encodeToDistribution` — 입력 셋(A · B · C, 칸 넷)이 차례로 인코더를 지나, 먼저 가운데 μ 가
 * 잠재 축 하나 위에 놓이고 이어서 둘째 머리가 낸 σ 만큼 번진다. 셋이 다 번지면 이웃이 겹치고, 마지막 걸음이 두 μ 사이의
 * 빈 자리 z −0.75 에서 세 퍼짐의 밀도를 잰다. 스스로 재생하고 멈춘다. 뽑기 · 디코더 · 학습이 없다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `vae` 는 KL 무게를 돌려 퍼짐이 얼마나 넓어지는가를, 조각 `sampleAndDecode` 는 분포에서 뽑아 되돌리는 쪽을 진다.
 * 이쪽은 **입력 → 분포** 한 방향, "점이 아니라 폭" 이라는 한 주장이다. 그래서 definition 은 encoder · mean · log-variance ·
 * interval · 두 μ 사이의 빈 자리 쪽 낱말을 쥐고, KL weight · reconstruction · draw · decoder 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다): 인코더 무게는 예로 정한 값이지 학습한 값이 아니다 · 잠재 차원 하나 · 입력 셋 칸 넷 ·
 * 퍼짐의 폭은 μ±σ 로 그린다 (±2σ 아님) · 학습하면 KL 항이 퍼짐을 표준 정규 쪽으로 당겨 이웃이 겹치게 된다는 것은 이 화면
 * 밖의 이야기다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const encodeToDistributionConcept: FacetConceptSource = {
  id: 'encodeToDistribution',
  label: 'A VAE Encoder Outputs a Spread, Not a Point',
  canonicalFacet: 'facet:encodeToDistribution',

  surface: {
    definition:
      'A variational encoder maps each input to a mean and a log-variance, so the input occupies an interval of the latent axis rather than one point, and a location between two means falls inside both intervals.',
    exemplarKeywords: [
      'VAE encoder',
      'probabilistic encoder',
      'q(z|x)',
      'mean and variance heads',
      'log σ² output',
      'why predict log variance',
      'latent distribution instead of a latent point',
      'Gaussian posterior per input',
      'autoencoder code vs VAE code',
      'overlapping latent codes',
      'continuous latent space',
    ],
  },

  briefing: {
    observable: [
      'Three inputs are shown as four 0/1 cells each: A [1, 1, 0, 0], B [0, 1, 1, 0], C [0, 0, 1, 1]. Below them a single latent axis from −3 to 3 starts empty ("Inputs: 3. The latent axis is still empty.").',
      'Each input takes two steps. First the mean head places a point: "Mean head — A: μ = −1.50". Then the spread head widens that point into a bell curve and a μ ± σ band on its own row: "Spread head — A: log σ² = −0.20 · σ = 0.90 · μ±σ: −2.40 .. −0.60". The order is A, B, C.',
      'The three inputs get different widths: A σ 0.90 around −1.50, B σ 1.00 around 0.00, C σ 0.82 around 1.50. When a second band is drawn next to the first the shared stretch is marked: "Overlap A·B: 0.40", then "Overlap B·C: 0.32".',
      'The last step probes the midpoint between A and B, z = −0.75, and reads each band\'s normal density there: A 0.313, B 0.301, C 0.011. The caption adds "Inside μ±σ: A · B · On a μ point: none" — a place no input was encoded to still lies within two inputs\' spreads.',
      'The widths are drawn as μ ± σ, not ± 2σ. The encoder weights are fixed example values rather than trained ones, there is one latent dimension, and nothing is sampled or decoded; the screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, two steps per input and a final probe step, eight steps in all, and stops.',
        'A Replay button and a playback strip sit below. Dragging the strip back to a "place" step and forward to its "spread" step isolates the moment a point gains its width.',
        'Inputs, weights and the probe point are fixed, so every μ, σ, overlap and density can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article contrasts an ordinary autoencoder, which maps an input to one code, with a VAE encoder, and needs the reader to see the second output head turn a point into a band of a particular width.',
      'A reader wonders why the encoder outputs log σ² instead of σ, and the article wants each step showing the log-variance and the σ it becomes.',
      'The article claims the latent space between encoded inputs is not empty, and wants a concrete location that no input was mapped to yet sits inside two spreads with nearly equal density.',
    ],

    avoidWhen: [
      'The article is about drawing samples from the latent space and decoding them into outputs. Nothing is drawn or decoded here.',
      'The subject is the VAE loss, the KL term or how training changes the spreads. The weights are fixed and nothing is learned.',
      'The reader needs a multi-dimensional latent space or a picture of a latent map of many inputs. There is one axis and three inputs.',
      'The topic is uncertainty estimation in Bayesian neural networks. The width here is the encoder\'s output per input, not uncertainty over weights.',
    ],

    contrastWith: [
      {
        concept: 'vae',
        note: 'Encoding to a spread is what gives a VAE something to regularize. How wide the spreads end up and how much they overlap is decided by the KL weight during training, which the fixed encoding alone does not address.',
      },
      {
        concept: 'sampleAndDecode',
        note: 'The two are opposite halves of the model: this one turns an input into a mean and a width, the other starts from a mean and a width and turns a random draw into an output.',
      },
      {
        concept: 'pca',
        note: 'Projection onto a principal axis gives each input a single coordinate. A variational encoder gives each input a coordinate plus a width, so neighbouring inputs can share part of the axis.',
      },
    ],
  },
};
