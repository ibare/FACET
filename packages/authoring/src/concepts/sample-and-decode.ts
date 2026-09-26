/**
 * sampleAndDecode 개념 선언.
 *
 * canonical facet 은 `facet:sampleAndDecode` — 인코더가 이미 내놓은 분포(잠재 차원 둘, μ [0.40, −0.60] · σ [0.50, 0.30])에서
 * 출발한다. 뽑기 세 번마다 ε 가 σ 배로 줄어 z 를 μ 에서 떼어 놓고(z = μ + σ·ε), 그 z 가 디코더를 지나 칸 넷으로 펼쳐진다.
 * 앞선 뽑기의 z 와 출력은 남아, 끝에 세 출력의 칸별 가장 큰 차(0.45 · 0.34 · 0.38)가 뜬다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `vae` 는 KL 무게로 학습의 줄다리기를, 조각 `encodeToDistribution` 은 입력 → 분포를 진다. 이쪽은 **분포 → 출력**
 * 한 방향 — 입력도 인코더도 학습도 없다. 그래서 definition 은 draw · noise · reparameterization · decoder · 뽑을 때마다 다른
 * 출력 쪽 낱말을 쥐고, KL weight · encoder · log-variance · interval 을 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다): 디코더 무게는 예로 정한 값 · 잠재 차원 둘 · 출력 칸 넷 · ε 는 표준 정규에서 뽑아 둔 값을
 * 데이터로 준다 (재생할 때마다 새로 뽑지 않는다).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const sampleAndDecodeConcept: FacetConceptSource = {
  id: 'sampleAndDecode',
  label: 'Sampling a Latent Code and Decoding It (Reparameterization)',
  canonicalFacet: 'facet:sampleAndDecode',

  surface: {
    definition:
      'Generating from a VAE draws standard-normal noise, scales it by σ and adds μ to get a code z, then decodes z; each draw from the same distribution lands elsewhere and yields a different output.',
    exemplarKeywords: [
      'reparameterization trick',
      'z = μ + σ ⊙ ε',
      'sampling from the latent space',
      'VAE decoder',
      'generating new samples with a VAE',
      'why sample instead of using the mean',
      'stochastic latent code',
      'backpropagating through a random sample',
      'same input, different outputs',
      'latent noise epsilon',
    ],
  },

  briefing: {
    observable: [
      'The screen starts from a distribution with two latent dimensions — "μ = [0.40, −0.60]" labelled center and "σ = [0.50, 0.30]" labelled spread — drawn on a z₁ / z₂ plane, next to a decoder box marked σ(W·z + b) with four output cells numbered 0 to 3. "Only the center and spread so far. Nothing drawn yet."',
      'Each draw takes two steps. First an arrow for ε reaches out from the center and shrinks by σ, placing z on the plane, where a ring around μ marks the spread (a draw beyond one σ lands outside it): "ε = [0.6, −1.2]    σ·ε = [0.30, −0.36]    z = μ + σ·ε = [0.70, −0.96]". Then the decoder spreads that z into four cells: "σ(W·z + b) = [0.80, 0.13, 0.20, 0.87]".',
      'The second draw ε [−1.4, 0.3] lands z at [−0.30, −0.51] and decodes to [0.35, 0.27, 0.65, 0.73]; the third, ε [0.2, 1.8], lands at [0.50, −0.06] and decodes to [0.73, 0.47, 0.27, 0.53].',
      'Earlier draws stay on the plane and earlier outputs stay in their rows, numbered 1 to 3, so the three can be compared. After the last decode the caption reads "Largest cell difference between outputs: 1↔2 0.45 · 1↔3 0.34 · 2↔3 0.38".',
      'The σ in the decoder box is the sigmoid, while σ = [0.50, 0.30] is the spread; the screen uses the same letter for both. The decoder weights are fixed example values, and the three ε are drawn once and supplied as data, so every replay shows the same three draws. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, two steps per draw for three draws, seven steps with the start, and stops.',
        'A Replay button and a playback strip sit below. Dragging between a draw step and its decode step separates where the noise put z from what the decoder made of it.',
        'The distribution, the noise values and the decoder are fixed, so each z and each cell value can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces the reparameterization trick and needs z = μ + σ·ε worked through with real numbers: how large a nudge each noise draw becomes once scaled by the spread.',
      'The reader asks how a VAE produces new things rather than copies, and the article wants three draws from one distribution giving three visibly different outputs.',
      'The article explains that the spread sets how far a generated code can wander from the mean, and wants every nudge printed as noise times σ — −1.4 on the first dimension becomes −0.70, 1.8 on the second becomes 0.54.',
    ],

    avoidWhen: [
      'The subject is how an encoder turns an input into a mean and a spread. There is no input or encoder here; the distribution is given.',
      'The article is about the VAE loss, KL weight or training. Nothing is trained; the decoder is fixed.',
      'The topic is sampling tokens from a language model\'s probability distribution. The randomness here is continuous noise added to a latent vector, not a choice among discrete options.',
      'The reader needs realistic generated images. The output is four numbers between 0 and 1.',
    ],

    contrastWith: [
      {
        concept: 'encodeToDistribution',
        note: 'Encoding produces the mean and width for an input; sampling takes a mean and width as given and turns a random draw into an output. One direction leads into the latent space, the other leads out of it.',
      },
      {
        concept: 'vae',
        note: 'Decoding a random draw is useful only if codes near the mean decode to something coherent; whether they do is what the KL weight trades against reconstruction sharpness during training.',
      },
      {
        concept: 'temperatureSampling',
        note: 'Both put randomness into generation. Temperature reshapes a distribution over discrete tokens before one is chosen; here continuous noise is scaled by a learned spread and added to a code before decoding.',
      },
      {
        concept: 'denoiseStepByStep',
        note: 'Both turn random noise into an output. A VAE decoder does it in a single pass from a code near a mean; reverse diffusion reaches its output by removing predicted noise over several steps.',
      },
    ],
  },
};
