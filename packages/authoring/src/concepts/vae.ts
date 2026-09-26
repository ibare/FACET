/**
 * vae 개념 선언.
 *
 * canonical facet 은 `facet:vae` — 입력 셋(A · B · C, 칸 넷)을 잠재 차원 하나에 담는 작은 VAE 가 400 판을 배우고,
 * 50 판마다 한 번씩 잠재 축 위의 띠 μ ± σ 셋과 되돌린 칸 넷을 보인다. 손잡이 KL 무게 β(0 · 0.5 · 1 · 2, 처음 1)를
 * 돌리면 같은 처음 무게 · 같은 씨앗에서 다시 배운다. β 가 오를수록 띠가 넓어지며 가운데로 모이고, 되돌린 칸이 흐려진다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `encodeToDistribution` 은 인코더가 입력을 점이 아니라 폭으로 담는 한 장면, `sampleAndDecode` 는 분포에서 z 를 뽑아
 * 디코더로 되돌리는 한 장면이다. 이쪽은 **학습의 손실 두 항 사이의 줄다리기**를 맡는다 — β 를 돌리면 무엇이 갈리는가.
 * 그래서 definition 은 KL weight · reconstruction · trade-off 쪽 낱말을 쥐고, 조각들이 쥔 mean head · log-variance ·
 * draw · reparameterization 을 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `vae.md` 가 밝힌 것):
 *  - 입력 셋 · 칸 넷 · 잠재 차원 하나. 인코더는 선형 머리 둘, 디코더는 칸마다 시그모이드 하나. 기울기는 손으로 푼 식.
 *  - 한 판에 입력 셋의 기울기를 모아 한 번 고친다 (배우는 비율 0.1). 400 판에서 멈춘다.
 *  - 학습 중 ε 는 씨앗 있는 생성기에서 온다 — 같은 β 면 같은 화면. 보이는 값은 뽑기 없이 z = μ 로 셈한다.
 *  - 코드 패널은 한 판의 학습을 IR 에서 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const vaeConcept: FacetConceptSource = {
  id: 'vae',
  label: 'VAE: Trading Reconstruction for a Smooth Latent Space (KL Weight β)',
  canonicalFacet: 'facet:vae',

  surface: {
    definition:
      'In a variational autoencoder, raising the weight β on the KL term pulls encoded inputs toward a standard normal, widening and overlapping them, at the cost of blurrier reconstructions and higher reconstruction error.',
    exemplarKeywords: [
      'variational autoencoder',
      'VAE loss',
      'ELBO',
      'KL divergence term',
      'β-VAE',
      'reconstruction loss vs KL loss',
      'why are VAE outputs blurry',
      'regularizing the latent space',
      'latent space regularization',
      'posterior pulled toward the prior',
      'autoencoder vs variational autoencoder',
      'KL annealing',
    ],
  },

  briefing: {
    observable: [
      'The upper half shows three inputs A [1, 1, 0, 0], B [0, 1, 1, 0] and C [0, 0, 1, 1] as bands μ ± σ on a latent axis from −6 to 6, each labelled with its μ and σ; the bands are also drawn on one shared axis where the stretch two neighbours share is shaded. The lower half pairs each input\'s four cells with its "Decoded" cells, the decoder\'s output for z = μ, darker meaning closer to 1.',
      'A run shows nine snapshots, epoch 0 and then every 50 epochs up to 400. Beside them the screen reads "Reconstruction error", "KL", "Mean σ" and "Spread of μ", and a caption says either "Neighbouring spreads overlap. Overlapping pairs: n" or "Every neighbouring spread stands apart. Narrowest gap: g".',
      'At the default β 1, epoch 400 reads μ 1.39 · 0.28 · −1.06 and σ 0.58 · 0.47 · 0.66 for A · B · C, reconstruction error 0.15, KL 0.76, narrowest gap 0.07 with no overlapping pair.',
      'At β 0 the bands shrink almost to points (σ 0.18 to 0.29) and spread far apart (spread of μ 8.45); the decoded cells nearly match the inputs, reconstruction error 0.03, while KL is 6.92.',
      'At β 2 the bands swell (σ 0.72 to 0.83) and crowd the middle (spread of μ 1.75); both neighbouring pairs overlap, decoded B blurs to 0.37 · 0.82 · 0.63 · 0.18, reconstruction error rises to 0.31 and KL falls to 0.33. β 0.5 sits between: error 0.09, KL 1.18.',
      'The order along the axis is C, B, A from left to right at every β, so turning the handle moves and swells the same three bands rather than flipping them.',
      'Only at β 0 do the numbers move one way from snapshot to snapshot (mean σ falls, spread of μ grows). At β 0.5, 1 and 2 the noise drawn during training makes them wobble; at β 1 the overlapping-pair count goes 2 · 2 · 1 · 1 · 0 · 2 · 1 · 1 · 0 across the nine snapshots.',
      'The model is deliberately tiny: three inputs, four cells, one latent dimension, two linear heads for μ and log σ², one sigmoid per output cell, 400 epochs at learning rate 0.1 with the training noise from a seeded generator, and the displayed values computed at z = μ without sampling. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle, a four-position "KL weight β" slider at 0, 0.5, 1 and 2, starting at 1. Each turn retrains from the same starting weights and seed, and the previous run\'s bands slide to their new starting place before the new run plays.',
        'Two readouts under the controls: "Epoch" and "Overlapping pairs".',
        'The move that lands the idea is stepping β from 0 to 2 and comparing epoch 400: the bands widen and converge, the gaps turn negative, and the decoded cells lose their pattern while KL drops.',
        'A code panel labelled "One epoch of training" starts empty with a "+ Add language" button; it holds encode, sample, decode, gradient and update for one epoch in Python, JavaScript, TypeScript, Java, C++ or C#, and β touches only the two gradient lines for μ and log σ².',
      ],
    },

    useWhen: [
      'The article explains the two terms of the VAE loss and needs to show what each one pulls on: with the KL weight at 0 the codes become far-apart points and the reconstruction is sharp, and raising it buys an overlapping, centred latent space with blurrier outputs.',
      'A reader asks why VAE samples look blurry compared with the inputs, and the article wants the moment where overlapping spreads force the decoder to return a middle-ground pattern.',
      'The subject is β-VAE or tuning the KL weight, and the reader needs a concrete sense of what larger β costs and what it gains.',
    ],

    avoidWhen: [
      'The article is about how a VAE generates new data by sampling the latent space. Every value on this screen is taken at z = μ; no fresh sample is drawn and decoded.',
      'The subject is image-scale VAEs, convolutional encoders or disentangled factors across many latent dimensions. There is one latent dimension and three four-cell inputs.',
      'The point is the evidence lower bound derivation or variational inference in general. The screen shows the effect of the weight, not the derivation of the loss.',
      'The reader needs a VAE compared against GANs or diffusion models on sample quality. Only this one model is trained here.',
    ],

    contrastWith: [
      {
        concept: 'encodeToDistribution',
        note: 'That an encoder outputs a mean and a width for each input is the premise; how wide those widths end up, and how much they overlap, is what the KL weight decides during training.',
      },
      {
        concept: 'sampleAndDecode',
        note: 'Drawing a code and decoding it is how a trained VAE produces output. The KL weight governs whether codes drawn between the training inputs decode to anything sensible, at the price of sharpness on the inputs themselves.',
      },
      {
        concept: 'diffusion',
        note: 'Both are generative models that land on a blend when they cannot tell training examples apart. A VAE packs each input into a distribution in one pass and blurs where the distributions overlap; a diffusion model recovers from noise over repeated passes.',
      },
      {
        concept: 'pca',
        note: 'Both compress inputs onto fewer axes. A principal axis gives each input one exact coordinate chosen for spread; a VAE gives each input a mean and a width, and trains the widths toward a fixed prior.',
      },
    ],
  },
};
