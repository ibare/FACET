/**
 * denoiseStepByStep 개념 선언.
 *
 * canonical facet 은 `facet:denoiseStepByStep` — 배운 자료가 네 칸 그림 둘(P [1, 1, −1, −1] · Q [−1, 1, 1, −1])뿐인
 * 이상적 예측기로, 순수 잡음 x₅ [0.90, −0.30, 0.40, −1.20] 에서 t 5 → 1 을 걷어낸다. t 하나에 두 걸음 — 잡음 ε̂ 과 그 뜻의
 * 깨끗한 그림 x̂₀(P · Q 의 무게 섞임)을 맞히는 걸음, 맞힌 잡음의 일부만 덜고 작은 새 잡음을 얹어 x_{t−1} 로 내려서는 걸음.
 * x̂₀ 의 무게가 P 0.58 → 0.65 → 0.82 → 1.00 으로 기울고 x₀ 가 P 에 닿는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `diffusion` 은 걷어내는 횟수를 돌려 끝이 섞임이냐 자료냐가 갈리는 대비를, 조각 `addNoiseThenRemove` 는 원본을 알고
 * 섞었다 한 번에 푸는 전방 과정을 진다. 이쪽은 **한 걸음의 내용** — 예측하고, 일부만 덜고, 새 잡음을 얹는다는 것과 그
 * 사이 예측이 섞임에서 한 그림으로 선다는 것이다. 그래서 definition 은 predict the noise · remove part · fresh noise ·
 * estimate sharpens 쪽 낱말을 쥐고, number of passes · forward · share · known noise 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다): 칸 넷 · 다섯 걸음 · 자료 둘 · 잡음 일정(β 0.05 · 0.15 · 0.3 · 0.5 · 0.7)과 뽑힌 잡음은
 * 예로 정한 값 · 예측기는 자료 둘만 아는 이상적 예측기라 끝이 자료 하나와 똑같다 — 실제 신경망은 배운 그림을 그대로
 * 되풀이하지 않고 비슷한 새 그림을 낸다 · σ_t² = β_t 를 골랐다 · t 1 에서는 새 잡음을 얹지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const denoiseStepByStepConcept: FacetConceptSource = {
  id: 'denoiseStepByStep',
  label: 'Reverse Diffusion: One Denoising Step at a Time',
  canonicalFacet: 'facet:denoiseStepByStep',

  surface: {
    definition:
      'Each reverse diffusion step predicts the noise in the current sample and the clean image it implies, subtracts only part of that noise, then adds smaller fresh noise; the clean estimate sharpens from a mix toward one learned example.',
    exemplarKeywords: [
      'reverse diffusion step',
      'ancestral sampling',
      'DDPM sampling loop',
      'predicted noise epsilon-hat',
      'predicted x0',
      'noise prediction network',
      'why add noise back during sampling',
      'x_{t-1} from x_t',
      'denoising from pure noise',
      'generation step by step',
    ],
  },

  briefing: {
    observable: [
      'At the top a staircase x₅ · x₄ · x₃ · x₂ · x₁ · x₀ gains one step each time noise is removed. In the middle each of the four cells has its own number line with P and Q marked: a dot for the current x_t and a diamond for the predicted clean value x̂₀, with the predicted noise ε̂ printed beside them. At the bottom a "Weight" band splits x̂₀ between P and Q, next to small pictures of x̂₀ and of the two learned pictures.',
      'It starts from pure noise, x₅ = [0.90, −0.30, 0.40, −1.20] ("Start from pure noise · t 5").',
      'Each t takes two steps. The predict step ("t 5: guess the noise ε̂ and the clean picture x̂₀ it implies") fills ε̂ [0.89, −0.62, 0.47, −0.95] and x̂₀ [0.16, 1.00, −0.16, −1.00], with weights P 0.58 · Q 0.42 — the first guess is a blend of the two learned pictures.',
      'The removal step ("t 5 → 4: remove part of the guessed noise, add fresh noise · σ 0.84") pulls each dot toward the mean μ left after removing part of the noise, [0.45, 0.28, 0.11, −0.92], and then kicks it by the fresh noise to x₄ = [0.62, −0.14, 0.19, −0.59]. The sample moves only part of the way toward x̂₀.',
      'Step by step the weights lean to P — 0.58, 0.65, 0.82, then 1.00 at t 2 and t 1 — and the fresh-noise size falls, σ 0.84, 0.71, 0.55, 0.39. The printed 1.00 · 0.00 is rounded; the computed Q weight never reaches zero.',
      'At t 1 no fresh noise is added ("t 1 → 0: remove the guessed noise, no fresh noise"), and x₀ lands on [1.00, 1.00, −1.00, −1.00], "distance P 0.00 · Q 2.83".',
      'The predictor is ideal rather than a trained network: it knows only P and Q and weights them by how likely the current x_t came from each, which is why the end matches P exactly; a real network produces a new picture similar to what it learned. Four cells, five steps, the schedule and every drawn noise value are fixed examples. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, a predict step and a removal step for each t from 5 down to 1, eleven steps with the start, and stops.',
        'A Replay button and a playback strip sit below. Dragging between a predict step and the removal step after it separates what the model guessed from how far the sample actually moved.',
        'The noise, the data and the schedule are fixed, so every ε̂, x̂₀, weight, mean and σ can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article walks through one iteration of the DDPM sampling loop and needs each quantity — ε̂, x̂₀, the mean, σ and the new sample — shown with numbers in the order they are computed.',
      'A reader asks why sampling adds noise back in after removing it, and the article wants the step where part of the guessed noise comes out and a smaller fresh draw goes in.',
      'The article claims the model\'s idea of the final picture starts vague and firms up, and wants the P / Q weight moving from 0.58 to 1.00 as the steps go by.',
    ],

    avoidWhen: [
      'The subject is the forward process of mixing noise into a known image. There is no original here; the start is pure noise.',
      'The article is about how many sampling steps to use or the quality trade-off of fewer steps. The count is fixed at five.',
      'The topic is training the noise predictor or the loss it minimises. The predictor here is computed exactly, not learned.',
      'The reader needs guidance, conditioning or text-to-image generation. Nothing steers the sample except the two learned pictures.',
    ],

    contrastWith: [
      {
        concept: 'addNoiseThenRemove',
        note: 'With a known original and known noise the mixture can be undone in one exact step. Sampling has neither, so each step removes only part of a guessed noise and leaves the rest to later steps.',
      },
      {
        concept: 'diffusion',
        note: 'One step\'s content is predict, remove part, add fresh noise. Running more or fewer of those steps is a separate choice that decides whether the result settles on an example or stays a blend.',
      },
      {
        concept: 'sampleAndDecode',
        note: 'Both turn random noise into an output. A VAE decoder maps one code to an output in a single pass; reverse diffusion refines the same sample over several steps, revising its guess each time.',
      },
    ],
  },
};
