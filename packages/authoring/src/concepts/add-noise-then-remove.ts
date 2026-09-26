/**
 * addNoiseThenRemove 개념 선언.
 *
 * canonical facet 은 `facet:addNoiseThenRemove` — 원본 다섯 칸 x₀ [0.8, 0.4, −0.2, −0.6, 0.2] 에 한 번 뽑은 잡음 ε 를
 * t 1..5 에서 x_t = √ᾱ_t · x₀ + √(1 − ᾱ_t) · ε 로 섞는다. 원본의 몫이 1.00 → 0.19 로 줄고 잡음의 몫이 0.00 → 0.98 로 늘며,
 * 두 몫의 제곱 합은 늘 1.00 이다. 끝 걸음에서 섞인 ε 를 덜고 √ᾱ 로 나누어 다섯 칸이 한 번에 원본으로 돌아온다.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `diffusion` 은 걷어내는 횟수를 돌려 끝점이 섞임에서 자료로 옮겨 가는 대비를, 조각 `denoiseStepByStep` 은 원본 없이
 * 잡음에서 여러 걸음 걷어내는 생성을 진다. 이쪽은 **원본을 아는 전방 과정** — 몫이 어떻게 옮겨 가는가와, 잡음을 알면
 * 한 번에 풀린다는 셈이다. 그래서 definition 은 forward process · √ᾱ · shares · squares sum to one · known noise ·
 * one step 쪽 낱말을 쥐고, sampling · passes · predict · fresh noise 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다): 칸 다섯 · 일정 다섯 걸음(β 0.1 · 0.2 · 0.4 · 0.6 · 0.8)은 예로 정한 값이다 — 실제는
 * 수백에서 천 걸음 · 모든 t 에 같은 ε 하나를 쓴 것은 닫힌 꼴 그대로 보이기 위한 고정이다 · 실제 되돌림에서는 ε 를 모르고
 * 학습된 모형이 맞힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const addNoiseThenRemoveConcept: FacetConceptSource = {
  id: 'addNoiseThenRemove',
  label: 'Forward Diffusion: Mixing in Noise, and Undoing It When the Noise Is Known',
  canonicalFacet: 'facet:addNoiseThenRemove',

  surface: {
    definition:
      'The forward diffusion process mixes an original with Gaussian noise so the original\'s share √ᾱ shrinks and the noise share √(1−ᾱ) grows, squares summing to one; knowing the noise, one subtraction and division recovers the original.',
    exemplarKeywords: [
      'forward diffusion process',
      'noise schedule',
      'alpha bar',
      'q(x_t | x_0) closed form',
      'variance-preserving noising',
      'sqrt(alpha_bar) x0 + sqrt(1 - alpha_bar) epsilon',
      'what the diffusion model is trained to predict',
      'epsilon prediction target',
      'adding noise to training images',
      'signal-to-noise ratio over time',
    ],
  },

  briefing: {
    observable: [
      'One part of the screen is a quarter-circle gauge: the horizontal axis is the "original share", the vertical axis the "noise share", and a dot sits on a dashed arc of radius 1 with both shares printed. A header prints t, the two shares squared and summed, and ᾱ.',
      'The other part holds five cell columns over a zero line. Each column has a solid tick at the original value x₀ [0.80, 0.40, −0.20, −0.60, 0.20] and a dashed tick at the noise value ε [0.3, −1.1, 0.7, 0.5, −0.9] (legend "x₀ original" and "ε noise"), and a bar stacked from the original\'s part and the noise\'s part gives the current cell value.',
      'At t 0 the shares are 1.00 and 0.00 ("1.00² + 0.00² = 1.00 · ᾱ = 1.000") and the cells are the original.',
      'With each t the dot slides along the arc, leaving earlier dots behind: the original share falls and the noise share rises — 0.95 / 0.32 at t 1, 0.85 / 0.53, 0.66 / 0.75, 0.42 / 0.91, and 0.19 / 0.98 at t 5 with ᾱ 0.035 — and each header still sums the squares to 1.00.',
      'The five cells are pulled from the original ticks toward the noise ticks in step with the shares; at t 5 they read [0.44, −1.01, 0.65, 0.38, −0.85]. Every t is computed directly from x₀ with the same ε, not by adding more noise to the previous step.',
      'The last step removes the known noise and rescales in one move — "Remove noise ε × 0.98 · divide by 0.19" — and the gauge dot returns to 1.00 and 0.00 and all five cells return to [0.80, 0.40, −0.20, −0.60, 0.20], with "largest gap from the original: 3.3e-16", which is floating-point error.',
      'Five cells and five noise levels (β 0.1, 0.2, 0.4, 0.6, 0.8) are example values; real schedules run to hundreds or a thousand levels. One fixed ε is reused at every t so the closed form shows directly, and the undoing assumes ε is known, which a real model has to predict. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself: the original, five mixing steps, then one undo step, seven steps in all, and stops.',
        'A Replay button and a playback strip sit below. Dragging between t 5 and the undo step shows the whole recovery happening in one move rather than by retracing t 4, 3, 2, 1.',
        'The original, the noise and the schedule are fixed, so every share, ᾱ and cell value can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces the forward process of a diffusion model and needs the reader to see ᾱ turn into two shares whose squares always sum to one while the original fades.',
      'A reader asks what a diffusion model is actually trained to predict, and the article wants to show that if the mixed-in noise were known the original would come back in a single exact calculation.',
      'The article explains that any noise level can be reached from the original in one jump, which is how training samples a random t.',
    ],

    avoidWhen: [
      'The subject is generating new data from pure noise. Here the original is known from the start and nothing is generated.',
      'The article is about the reverse sampling loop, step counts or sampler choice. The only undoing here is a single step with the true noise.',
      'The topic is adding noise for data augmentation or differential privacy. The mixing here follows a diffusion schedule for a generative model.',
      'The reader needs how the noise schedule is designed or compared (linear against cosine). One example schedule is shown.',
    ],

    contrastWith: [
      {
        concept: 'denoiseStepByStep',
        note: 'Undoing a known mixture is exact and takes one step. Generation starts without an original, so each step has to guess the noise and can remove only part of it before guessing again.',
      },
      {
        concept: 'diffusion',
        note: 'The forward process is fixed and needs no model; what a diffusion model learns is to reverse it without knowing the noise, and how many passes that reversal takes changes what it produces.',
      },
    ],
  },
};
