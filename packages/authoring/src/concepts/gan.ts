/**
 * gan 개념 선언.
 *
 * canonical facet 은 `facet:gan` — 진짜 넷이 한 줄 위 두 봉우리(−2.6 · −2.0 · 2.0 · 2.6)에 둘씩 있고, 만드는 쪽
 * G(z) = a·z + b 와 가려내는 쪽(종 모양 특징 셋 + 시그모이드)이 라운드 16 을 번갈아 배운다. 손잡이는 만드는 쪽의 처음 b
 * (−0.6 ~ 0.6 일곱 자리, 처음 0.4). 치우친 출발이면 가짜 넷이 그쪽 봉우리로 몰려 좁혀지고, 가운데 셋이면 둘씩 갈린다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `twoNetsCompete` 는 한 봉우리 앞에서 두 갱신이 V 를 올리고 내리는 교대를, `modeCollapse` 는 손잡이 없이 한 출발에서
 * 만든 것이 한쪽으로 몰려 좁혀지는 결과를 진다. 이쪽은 **출발 자리를 돌리면 몰릴 봉우리가 갈린다**는 대비를 맡는다.
 * 그래서 definition 은 starting point · which mode · 가운데 출발이면 갈린다는 쪽 낱말을 쥐고, 조각들이 쥔 value function ·
 * alternating raise/lower · 퍼짐이 좁혀지는 과정 자체를 앞세우지 않는다. `mode collapse` 라는 말은 이 화면 제목이 쓰므로
 * exemplarKeywords 에 두되 definition 의 중심에 두지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `gan.md` 가 밝힌 것):
 *  - 1 차원 · 가려내는 쪽은 −2.3 · 0 · 2.3 가운데의 종 모양 특징 셋 · 만드는 쪽은 a·z + b 하나 · 처음 a 0.26 ·
 *    배우는 비율 2 · 2 는 예로 정한 값. 잡음 넷은 라운드마다 같고 무작위는 없다.
 *  - 대칭이 정확한 이 작은 모형에서는 가운데 띠가 둘로 갈린다. 실제 GAN 은 가운데서 출발해도 한쪽으로 기우는 일이 잦다.
 *  - 갈린 경우 바깥 가짜는 진짜 바깥 끝 2.6 을 지나친다 (±4.19 ~ 4.29).
 *  - 걸음은 두 라운드마다 한 라운드만 보인다 (걸음 열일곱). 코드 패널은 라운드 하나를 IR 에서 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const ganConcept: FacetConceptSource = {
  id: 'gan',
  label: 'GAN: Where the Generator Starts Decides Which Mode It Collapses To',
  canonicalFacet: 'facet:gan',

  surface: {
    definition:
      'In a GAN trained on two equal peaks, the generator\'s starting offset decides the outcome: an off-centre start drives every sample onto the nearer peak, while a centred start splits them between both.',
    exemplarKeywords: [
      'generative adversarial network',
      'GAN training dynamics',
      'mode collapse',
      'sensitivity to initialization',
      'which mode does the generator pick',
      'bimodal target distribution',
      'GAN instability',
      'different runs give different results',
      'discriminator score curve D(x)',
      'generator G(z) = a·z + b',
    ],
  },

  briefing: {
    observable: [
      'At the top a curve D(x) over x from −5 to 5 gives the discriminator\'s "real" score, with its values printed over the two peak centres, "D(−2.3)" and "D(2.3)"; the higher one is emphasised. Below, four real points (−2.6, −2.0, 2.0, 2.6) and four fakes sit on two lines split by a dashed 0, with "Left: n" and "Right: n" counts.',
      'A trace labelled "Fakes by round" stacks one row of fake positions per shown generator step, from "Start" downward, so the path of the four fakes over training stays visible. The bottom line reads a, b, "Spread" (largest fake minus smallest) and the discriminator weights v and c.',
      'Sixteen rounds are trained and every second one is shown, as a discriminator step ("Round 1 generator step passes, then the discriminator learns") and then a generator step ("The generator learns: fakes move along the curve"). At the default start b 0.4 all four fakes are right of 0 from the first shown round.',
      'With b 0.4 or 0.6 the fakes are pulled toward the right peak, overshoot it to a mean near 3.6–3.8 around round 8, then come back and narrow; at round 16 b 0.4 ends at b 2.71, spread 0.12, "End: every fake is right of 0". Negative starts mirror this on the left.',
      'In each collapsed case the discriminator ends by scoring the empty peak as real — D 0.91 to 0.92 there — while the peak holding the fakes drops to 0.35.',
      'With b −0.2, 0 or 0.2 the fakes split two and two, ending with "End: fakes on both sides of 0", the outer fakes past the real data at about ±4.2 and the two peak scores near 0.70 each. The ±0.2 starts first lean one way and then come back to split.',
      'The real data never changes and has two points on each side, so which peak wins is set by the start, not by the data. The model is one-dimensional, the discriminator is three bell-shaped features and a sigmoid, the generator is a·z + b with a starting at 0.26, the four noise values are the same every round, and there is no randomness. In a symmetric setup this small the centred starts split; real GANs often tip to one side even from the centre. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle, a seven-position "Starting place b" slider from −0.6 to 0.6, starting at 0.4. Each turn retrains the sixteen rounds from the same starting weights.',
        'Two readouts under the controls: "Fakes left of 0" and "Fakes right of 0".',
        'The move that lands the idea is sweeping b from −0.6 to 0.6: the end place of the fakes moves from the left peak to both sides to the right peak, and the peak the discriminator favours moves to the opposite side.',
        'A code panel labelled "One round: discriminator, then generator" starts empty with a "+ Add language" button; it holds one round in Python, JavaScript, TypeScript, Java, C++ or C#, lighting the lines that update v and c on discriminator steps and the lines that update a and b on generator steps.',
      ],
    },

    useWhen: [
      'The article says mode collapse is not caused by the data being lopsided and needs the case where both peaks are equal and the side the generator lands on still changes with nothing but its starting offset.',
      'The reader asks why two GAN training runs on the same data can end up producing different things, and the article wants the handle that moves the outcome from one peak to the other.',
      'The article describes the chase after collapse — the discriminator favouring whichever peak is left empty — and wants the end scores of 0.91 against 0.35 beside the collapsed fakes.',
    ],

    avoidWhen: [
      'The subject is the alternating minimax updates themselves and the value function rising and falling. No value function is shown here.',
      'The article is about fixes for mode collapse such as minibatch discrimination, Wasserstein loss or unrolled GANs. None is applied.',
      'The reader needs image-generating GANs, convolutional generators or conditional GANs. Everything here is four numbers on one line.',
      'The article compares GANs with VAEs or diffusion models. Only this adversarial pair is on screen.',
    ],

    contrastWith: [
      {
        concept: 'modeCollapse',
        note: 'Mode collapse is the outcome: a generator that could cover two peaks settles on one and narrows. What this adds is that, with equal peaks, the side is decided by where the generator started, and a centred start need not collapse at all.',
      },
      {
        concept: 'twoNetsCompete',
        note: 'Alternating updates, each undoing part of the other\'s gain, are the mechanism. Across a whole run, and depending on the start, that mechanism can end in collapse onto one peak or in a split.',
      },
      {
        concept: 'policyGradient',
        note: 'Both move a generator of outputs along a gradient toward higher score. In policy gradient the score comes from a fixed reward; in a GAN the scorer is itself trained against the generator, so the target keeps shifting.',
      },
      {
        concept: 'kmeans',
        note: 'Both are iterative procedures whose end state depends on where they start. In k-means the start decides which points group together; in a GAN it decides which peak of the data the generator ends up imitating.',
      },
    ],
  },
};
