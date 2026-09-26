/**
 * modeCollapse 개념 선언.
 *
 * canonical facet 은 `facet:modeCollapse` — 진짜 넷이 두 봉우리(−2.2 · −1.8 · 1.8 · 2.2)에 둘씩 있고, 만드는 쪽
 * G(z) = a·z + b(처음 a 0.4 · b 0.3)가 가려내는 쪽과 라운드 마흔을 번갈아 배운다. 걸음은 라운드 0 · 8 · 16 · 24 · 32 · 40
 * 의 모습 여섯이다. 만든 것 넷이 모두 + 쪽으로 쏠리고(쪽별 1|3 → 0|4) 퍼짐이 0.80 → 0.10 으로 좁혀지는 동안, 가려내는 쪽은
 * −2 를 점점 진짜로 친다(D(−2) 0.50 → 0.94). 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `gan` 은 출발 자리를 돌려 몰릴 쪽이 갈리는 대비를, 조각 `twoNetsCompete` 는 갱신 하나하나의 오르내림을 진다.
 * 이쪽은 **결과의 모양** — 두 쪽을 다 낼 수 있는 만드는 쪽이 한 가지만 낸다는 주장 하나다. 손잡이도 V 도 없다.
 * 그래서 definition 은 only one mode · narrowing · abandoned mode scored as real 쪽 낱말을 쥐고, starting offset ·
 * value function · alternating 을 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다): 1 차원 · 가려내는 쪽은 −2 · 0 · 2 가운데의 종 모양 특징 셋 · 배우는 비율 1 · 1 과
 * 처음 무게는 예로 정한 값 · 잡음 넷은 라운드마다 같다 · 이 만드는 쪽은 두 쪽을 다 낼 수 있다(a 2 · b 0 이면 −2 · −1 · 1 · 2)
 * — 몰림은 모형이 모자라서가 아니다 · 이 시작값에서의 결과이며 더 돌리면 반대쪽으로 옮겨 갈 수 있다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const modeCollapseConcept: FacetConceptSource = {
  id: 'modeCollapse',
  label: 'Mode Collapse: The Generator Produces Only One Kind',
  canonicalFacet: 'facet:modeCollapse',

  surface: {
    definition:
      'Mode collapse is a generator, able to cover both modes of a two-mode target, ending up emitting samples from only one mode, bunched tightly, while the abandoned mode is scored ever more real.',
    exemplarKeywords: [
      'mode collapse',
      'GAN produces the same output',
      'lack of diversity in generated samples',
      'generator covers only one mode',
      'multimodal data distribution',
      'partial mode collapse',
      'Helvetica scenario',
      'generated samples all look alike',
      'missing modes',
    ],
  },

  briefing: {
    observable: [
      'One line carries four real points, two on each side (−2.2, −1.8, 1.8, 2.2), and four generated points; above them the discriminator score curve D(x) runs over x from −3 to 3, with "D(−2)" and "D(+2)" printed. Beneath, a "− side" and a "+ side" box each count "real" and "generated". The generator\'s current "G(z) = a·z + b" with a and b is printed.',
      'At the start (a 0.40, b 0.30) the generated points sit at −0.10, 0.10, 0.50, 0.70 — "generated per side (− | +): 1 | 3 · spread: 0.80" — and both scores are 0.50.',
      'By round 8 every generated point is on the + side (0 | 4) at 1.47 to 2.80, and D(−2) has risen to 0.75. By round 16 they have overshot to 2.83–3.52.',
      'From there they close in: spread 0.69 at round 16, 0.53 at 24, 0.20 at 32, and 0.10 at round 40, all four between 2.35 and 2.44 with a down to 0.05.',
      'Meanwhile the discriminator rates the empty − side as more and more real — D(−2) 0.75, 0.85, 0.87, 0.91, 0.94 — and the occupied + side as less, D(+2) ending at 0.35. No generated point moves toward −2.',
      'The real counts stay 2 | 2 throughout. Forty rounds are trained and six are shown (0, 8, 16, 24, 32, 40), so the rise and fall inside each round is not on screen.',
      'This generator can produce both sides — with a 2 and b 0 it would give −2, −1, 1, 2 — so the collapse is not a lack of capacity. The setting is one-dimensional, the discriminator is three bell-shaped features and a sigmoid, the starting weights and learning rates are example values, and trained longer the cluster could move to the other side. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself through six snapshots, rounds 0 to 40 in jumps of 8, and stops.',
        'A Replay button and a playback strip sit below. Dragging back to round 0 and forward to round 40 sets the loose 1 | 3 start against the tight 0 | 4 end.',
        'The data and starting weights are fixed, so each count, spread and score can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article defines mode collapse and needs the plain picture: real data on both sides, generated data on one side only, and the generated points squeezed together.',
      'The reader assumes the generator collapses because it is too simple, and the article wants a generator that could reach both sides but does not.',
      'The article points out that the discriminator does notice the missing side — its score there climbs to 0.94 — yet this pressure does not pull any generated sample across.',
    ],

    avoidWhen: [
      'The subject is how the generator and discriminator take turns and how the objective moves with each update. Only every eighth round is shown and no value function appears.',
      'The article is about which mode a run collapses onto, or how initialisation changes the outcome. There is one fixed start and no handle.',
      'The topic is posterior collapse in VAEs or overfitting. This is a generator ignoring part of the data it is trained against.',
    ],

    contrastWith: [
      {
        concept: 'gan',
        note: 'Collapse onto one mode is the outcome; which mode is taken, and whether a centred start splits instead, depends on where the generator begins.',
      },
      {
        concept: 'twoNetsCompete',
        note: 'Turn-taking updates are the mechanism that produces collapse. Collapse is about what the generator\'s outputs look like after many rounds, not about any single update.',
      },
      {
        concept: 'diffusion',
        note: 'Both are generative models trained on data with more than one mode. Mode collapse leaves one mode unused; a diffusion sampler that runs enough steps places different samples on different training examples.',
      },
    ],
  },
};
