/**
 * twoNetsCompete 개념 선언.
 *
 * canonical facet 은 `facet:twoNetsCompete` — 진짜 셋(2.0 · 2.5 · 3.0, 한 봉우리)과 가짜 셋(잡음 −0.5 · 0 · 0.5 + b) 앞에서
 * 가려내는 쪽 D(x) = σ(w·x + c) 와 만드는 쪽 G(z) = z + b 가 라운드 다섯을 번갈아 한 번씩 배운다. 걸음 하나가 갱신 하나다 —
 * 가려낼 때 V 가 오르고, 만들 때 가짜 셋이 통째로 옮겨 가며 V 가 내린다. 끝에 두 평균 점수가 0.51 로 만나고 가짜의 가운데
 * 2.46 이 진짜의 가운데 2.50 에 다가선다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `gan` 은 출발 자리를 돌려 어느 봉우리로 몰리는가를, 조각 `modeCollapse` 는 두 봉우리 앞에서 한쪽으로 몰리는 결과를
 * 진다. 이쪽은 **한 번의 교대** — 한쪽의 갱신이 다른 쪽이 얻은 것을 되돌린다는 주장 하나다. 진짜는 한 봉우리라 몰림이
 * 끼어들 자리가 없다. 그래서 definition 은 value function · discriminator step raises · generator step lowers · alternate 쪽
 * 낱말을 쥐고, peak · mode · start 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다): 1 차원 · 가려내는 쪽은 로지스틱 하나 · 만드는 쪽은 옮기기만 하는 모형(G(z) = z + b) ·
 * 배우는 비율 0.6 · 2.0 은 예로 정한 값 · 두 쪽 모두 전체 표본으로 한 번씩 · 잡음은 라운드마다 같다 · 만드는 쪽 목표는
 * 포화하지 않는 꼴(평균 log D(G(z))).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const twoNetsCompeteConcept: FacetConceptSource = {
  id: 'twoNetsCompete',
  label: 'Adversarial Training: Discriminator and Generator Take Turns',
  canonicalFacet: 'facet:twoNetsCompete',

  surface: {
    definition:
      'Adversarial training alternates two updates on one value function: the discriminator step raises it by separating real and fake scores, and the generator step lowers it by shifting fakes toward what scores as real.',
    exemplarKeywords: [
      'GAN minimax game',
      'min over G, max over D of V(D, G)',
      'discriminator loss and generator loss',
      'alternating gradient updates',
      'non-saturating generator loss',
      'log D(G(z))',
      'adversarial training loop',
      'discriminator outputs 0.5 at equilibrium',
      'generator vs discriminator',
      'zero-sum game',
    ],
  },

  briefing: {
    observable: [
      'The top of the screen holds two boxes, "Discriminator" with w and c and "Generator" with b. Below them the curve D(x) runs over x from −1 to 4, with three real points (2.0, 2.5, 3.0) and three fakes whose positions are printed. "Real" and "Fake" give the mean score D assigns to each group, and a "V" readout gives the value function.',
      'At the start w, c and b are 0, the fakes sit at −0.50, 0.00, 0.50, both mean scores are 0.50 and V is −1.39 ("Before learning — score gap: 0.00").',
      'Every step is a single update. On a discriminator step only w and c change and V goes up: round 1 takes w to 0.75, the real mean score to 0.86 and V to −0.85 ("The discriminator learns — score gap: 0.36"). On the following generator step only b changes, the three fakes slide together to 0.25, 0.75, 1.25, the fake mean score rises to 0.63 and V drops to −1.17 ("The generator learns — fakes moved: 0.75").',
      'This rise-and-fall repeats for five rounds. The gap the discriminator opens shrinks each round (0.36, 0.24, 0.12, 0.07, 0.03) and the generator\'s moves shrink too (0.75, 0.59, 0.43, 0.38, 0.32).',
      'After round 5 b is 2.46, the fakes sit at 1.96, 2.46, 2.96, both mean scores read 0.51, and the caption ends "Real center: 2.50 · fake center: 2.46".',
      'In round 5 the printed V stays at −1.34 across the discriminator step; the computed value still rises, only below the second decimal.',
      'The model is one-dimensional: the discriminator is a single logistic unit, the generator only shifts its three fixed noise values by b, both learn from all samples at once with rates 0.6 and 2.0, and the generator maximises mean log D(G(z)). The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one update per step for five rounds, eleven steps with the start, and stops.',
        'A Replay button and a playback strip sit below. Dragging back and forth across one discriminator step and the generator step after it shows V go up and come back down.',
        'The data, noise and learning rates are fixed, so every w, c, b, score and V can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces the GAN objective as a minimax game and needs the reader to watch one update push V up and the very next push it back down.',
      'A reader asks what "the generator fools the discriminator" means numerically, and the article wants the fake scores climbing toward the real ones until both read 0.51.',
      'The article explains why a GAN\'s losses do not fall steadily like an ordinary training curve: one player\'s progress is exactly what the other player undoes.',
    ],

    avoidWhen: [
      'The subject is mode collapse or a target with several peaks. The real data here is one cluster.',
      'The article is about GAN architectures, image synthesis or training tricks such as spectral normalisation. The two players are a logistic unit and a shift.',
      'The reader needs to see which way a whole run ends depending on initialisation. There is one fixed start and no handle.',
    ],

    contrastWith: [
      {
        concept: 'gan',
        note: 'The alternation is the mechanism in every GAN. Where a whole run ends, and whether it collapses onto one peak, also depends on the target\'s shape and on where the generator started.',
      },
      {
        concept: 'modeCollapse',
        note: 'Alternating updates describe each round; mode collapse describes a common end state after many rounds when the target has several peaks and the generator settles on one.',
      },
      {
        concept: 'logisticRegression',
        note: 'The discriminator here is a logistic regression, but its training data is not fixed: half of it is generated by an opponent that moves after every update.',
      },
      {
        concept: 'policyGradient',
        note: 'Both nudge a producer of outputs toward higher score. A policy gradient climbs against a fixed reward; a generator climbs against a scorer that is simultaneously being trained to push its score back down.',
      },
    ],
  },
};
