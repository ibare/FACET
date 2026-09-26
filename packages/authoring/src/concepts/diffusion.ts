/**
 * diffusion 개념 선언.
 *
 * canonical facet 은 `facet:diffusion` — 평면 위의 자료 둘(P [−1.6, 0.4] · Q [1.6, −0.4])만 아는 이상적 예측기로, 같은 잡음
 * x_T 에서 출발한 표본 다섯이 T 번에 나눠 잡음을 걷어낸다. 손잡이는 걷어내는 횟수 T(1 · 2 · 5 · 10 · 20, 처음 5).
 * T 1 은 첫 예측 x̂₀ 을 그대로 내놓아 두 자료 사이의 흐린 섞임에 머물고(닿음 0/5), T 20 은 다섯 모두 자료 하나에 닿는다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `addNoiseThenRemove` 는 원본을 알고 섞었다 한 번에 푸는 전방 과정을, `denoiseStepByStep` 은 순수 잡음에서 한 걸음이
 * 무엇을 하는가(예측 → 일부 덜기 → 새 잡음)를 진다. 이쪽은 **걷어내는 횟수를 돌리면 끝점이 섞임에서 자료로 옮겨 간다**는
 * 대비를 맡는다. 그래서 definition 은 number of passes · few passes = average · more passes = one example 쪽 낱말을 쥐고,
 * 조각들이 쥔 forward process · share · fresh noise · predict-then-subtract 의 한 걸음 셈을 앞세우지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `diffusion.md` 가 밝힌 것):
 *  - 이상적 예측기 — 신경망 대신 자료 둘만 알고 가능성으로 무게를 매긴다. 그래서 끝점이 자료와 똑같은 자리에 설 수 있다.
 *  - 그림 대신 두 성분 점. 일정은 모든 걸음에 같은 β, 마지막 ᾱ_T 를 T 와 무관하게 0.05 로 고정. σ_t² = β, t 1 에서는 새 잡음 없음.
 *  - 잡음은 표본마다 씨앗 있는 생성기 — 시작 x_T 는 T 와 무관하게 같다. 표본 다섯은 이백 가운데 대표 묶음이다
 *    (이백으로 세면 닿음 0 · 9 · 116 · 191 · 199).
 *  - 코드 패널은 걷어냄 한 번(`denoiseStep`)과 거리 읽기(`nearest`)를 IR 에서 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const diffusionConcept: FacetConceptSource = {
  id: 'diffusion',
  label: 'Diffusion Models: How Many Denoising Passes It Takes',
  canonicalFacet: 'facet:diffusion',

  surface: {
    definition:
      'In a diffusion model, the number of passes used to remove noise decides what comes out: one pass returns a blurred average of the training examples, while many small passes let each sample settle on a single example.',
    exemplarKeywords: [
      'diffusion model',
      'DDPM sampling',
      'number of sampling steps',
      'inference steps vs quality',
      'why few-step diffusion is blurry',
      'denoising diffusion probabilistic model',
      'reverse process',
      'stable diffusion steps setting',
      'generative model from noise',
      'blurry average of the data',
    ],
  },

  briefing: {
    observable: [
      'A plane holds two squares, the learned data P and Q, joined by a dashed line, and five numbered samples. A legend reads "Pale dot = prediction x̂₀ · line = path so far · ring = reached a datum", and the header gives "T = 5 passes · β = 0.451" at the default.',
      'A round starts with the five samples at their noise positions ("Start: noise x_T"), which are the same for every T. Each following step removes noise once ("Remove noise: t 5 → 4" and so on down to "t 1 → 0"): each sample\'s pale prediction dot slides along the P–Q line and the sample steps from x_t to x_{t−1}, leaving a trail with as many segments as T.',
      'The last step reads each sample\'s nearest datum and distance and rings those closer than 0.05. At T 5 it says "Reached a datum: 3/5" with samples 1 to 5 at P 0.40, P 0.00, P 1.37, Q 0.00, Q 0.00.',
      'Across the handle the reached count is 0, 0, 3, 4, 5 for T 1, 2, 5, 10, 20, with β 0.950, 0.776, 0.451, 0.259, 0.139. At T 1 the five end points stay on the P–Q line short of both ends — each is a weighted mix of the two, and one of them ends at [0.00, 0.00].',
      'At T 20 all five sit exactly on P or Q (three on P, two on Q). The prediction does not lean one way at every step: at T 5 sample 1 favours Q until the last pass, then flips to P.',
      'The predictor is ideal rather than a trained network: it knows only P and Q and weights them by how likely the current point came from each, which is why end points can land exactly on a datum. Points in the plane stand in for images, the schedule keeps the final ᾱ at 0.05 for every T, and the five samples are a representative group from two hundred fixed ones (counted over two hundred, T 1 to 20 reach 0, 9, 116, 191, 199). The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle, a five-position "Denoising passes T" slider at 1, 2, 5, 10 and 20, starting at 5. Each turn restarts from the same noise; the previous end points travel back to their starting places before the new round plays.',
        'Two readouts under the controls: "Passes done" and "Samples reached".',
        'The move that lands the idea is turning T from 1 to 20: the end points leave the middle of the P–Q line and move out to the two data, with rings appearing one by one.',
        'A code panel labelled "One reverse pass" starts empty with a "+ Add language" button; it holds one denoising pass and the nearest-datum reading in Python, JavaScript, TypeScript, Java, C++ or C#, with the pass lit on each removal step and the reading lit on the last step.',
      ],
    },

    useWhen: [
      'The article explains why a diffusion model removes noise gradually instead of all at once, and needs one pass ending on a blend of the training data set against twenty passes ending on actual examples.',
      'A reader asks what the "steps" setting in a diffusion image generator trades off, and the article wants the reached count climbing with T.',
      'The article describes the reverse process as repeatedly predicting the clean result and stepping toward it, and wants to show that early predictions are mixtures that later passes can revise.',
    ],

    avoidWhen: [
      'The subject is the forward process, noise schedules or the training objective. Nothing is noised or trained on this screen.',
      'The article is about text conditioning, classifier-free guidance, latent diffusion or U-Net architecture. None of these is present.',
      'The reader needs faster samplers such as DDIM or distillation compared with DDPM. Only one sampling rule is shown, at different step counts.',
      'The topic is image quality or novelty of generated images. The ideal predictor can only return its two training points.',
    ],

    contrastWith: [
      {
        concept: 'denoiseStepByStep',
        note: 'A single reverse step predicts the noise, removes part of it and adds a little fresh noise. How many such steps are taken decides whether the result is a blend of the data or one example.',
      },
      {
        concept: 'addNoiseThenRemove',
        note: 'The forward process destroys a known original on a fixed schedule and can be undone exactly when the noise is known. Generation has no original, so it must guess the noise, and the number of passes decides how well those guesses settle.',
      },
      {
        concept: 'vae',
        note: 'Both can return a blend of training examples. A VAE blurs where the spreads it encodes overlap; a diffusion sampler blurs when it removes noise in too few passes to commit to one example.',
      },
      {
        concept: 'modeCollapse',
        note: 'Both concern generating from data with more than one mode. A collapsed generator produces only one mode; a diffusion sampler with enough passes places different samples on different examples.',
      },
    ],
  },
};
