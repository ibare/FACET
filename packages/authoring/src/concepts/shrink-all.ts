/**
 * shrinkAll 개념 선언.
 *
 * canonical facet 은 `facet:shrinkAll` — 무게 둘(a = 1.60 · 0.40)을 가로 · 세로 변으로 삼은 네모가 원점 모서리를
 * 붙박은 채 L2 벌점(η 0.3 · λ 0.5) 아래 갱신 다섯 번 동안 같은 꼴로 오그라든다. 처음 대비 남은 비율은 두 무게가
 * 걸음마다 같은 수(0.85 → 0.68)이고 w1 / w2 는 내내 4.00, w2 는 0.27 에서 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `weightPenalty` 가 L1 · L2 를 맞바꾸고 λ 를 돌리므로, 이쪽은 L2 갱신 한 가지의 동사 — **무게에 비례한 몫이
 * 빠져 같은 비율로 오그라든다** — 만 쥔다. definition 은 proportional share · same fraction · ratio unchanged 를 독점하고,
 * 형제 `pushToZero` 의 fixed amount · stick · exactly zero, 완제품의 lasso · λ grows 를 쓰지 않는다.
 *
 * 전제 (설명 글 `shrinkAll.md`): 데이터 손실 ½·Σ(w − a)² 는 특징이 직교하고 크기 1 인 선형 회귀로 줄인 모형,
 * a · η · λ 는 고른 값. 갱신 5 에서 멈추는 자리는 끝이 아니다 — 더 돌리면 조금 더 줄되 0 에는 닿지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const shrinkAllConcept: FacetConceptSource = {
  id: 'shrinkAll',
  label: 'L2 Weight Decay Shrinks Every Weight by the Same Ratio',
  canonicalFacet: 'facet:shrinkAll',

  surface: {
    definition:
      'L2 weight decay removes from each weight a share proportional to that weight, so large and small weights shrink by the same fraction, their ratio stays unchanged, and none ever reaches zero.',
    exemplarKeywords: [
      'L2 regularization',
      'weight decay',
      'ridge regression shrinkage',
      'Tikhonov regularization',
      'multiplicative shrinkage',
      'proportional to the weight',
      'why L2 does not give sparse weights',
      'weight_decay in PyTorch optimizer',
      'shrink toward zero but never reach it',
    ],
  },

  briefing: {
    observable: [
      'A rectangle has w1 as its width and w2 as its height, with the origin corner pinned. A dashed line runs from the origin to the start corner a = (1.60, 0.40), and the free corner slides along it toward the origin. The update rule "w ← w − η·(w − a) − η·λ·w" and "η = 0.3 · λ = 0.5" stand above.',
      'A table beside it has three columns: "Weight now", "L2 share η·λ·w" and "Left of start w / a". On update 1 the shares are 0.240 for w1 and 0.060 for w2 — the larger weight loses more.',
      'An L-shaped strip peels off the rectangle each update: thick on the w1 side, thin on the w2 side, so the rectangle keeps its shape as it shrinks. The strip is the total change of the update, which also includes the pull back toward a; it equals the L2 share only on update 1.',
      '"Left of start w / a" reads the same number for both weights at every step: 1.00, 0.85, 0.77, 0.72, 0.70, 0.68. A label "w1 / w2: 4.00" never changes.',
      'Neither weight reaches zero: after five updates w1 = 1.09 and w2 = 0.27. Because the share shrinks with the weight, the corner slows as it nears the origin.',
      'The data loss ½·Σ(w − a)² stands for linear regression with orthogonal unit-scale features; a, η and λ are chosen values. Update 5 is where playback stops, not where the weights settle. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one update per step, six steps including the start, and stops after update 5.',
        'A Replay button and a playback strip sit below. Scrubbing between steps shows the w / a column staying equal across both rows while the shares differ by a factor of four.',
        'Every value is fixed, so 0.85, 4.00 and the final 0.27 can be quoted exactly.',
      ],
    },

    useWhen: [
      'A reader expects weight decay to wipe out small weights and needs to see the smaller one lose only a proportionally small amount and survive.',
      'The article describes L2 as shrinking the whole weight vector toward the origin without changing its direction, and wants the ratio 4.00 held fixed on screen.',
      'The article connects the (λ/2)·Σw² term to the update w ← w − η·λ·w and wants the per-weight share next to the weight it came from.',
    ],

    avoidWhen: [
      'The article needs weights driven to exactly zero or sparse solutions. That never happens here.',
      'The subject is decoupled weight decay in AdamW versus L2 inside Adam. The update here is plain gradient descent.',
      'The point is how the result changes with λ or against L1. One penalty at one strength is shown.',
    ],

    contrastWith: [
      {
        concept: 'pushToZero',
        note: 'L2 takes a fraction of each weight, so a small weight only loses a little and never crosses zero; L1 takes the same amount from every weight, so small ones are eliminated.',
      },
      {
        concept: 'weightPenalty',
        note: 'Equal-ratio shrinkage is one behaviour of one penalty; asking which penalty to use and how strong turns it into a choice between keeping every feature and discarding some.',
      },
      {
        concept: 'rescaleEachBatch',
        note: 'Weight decay rescales parameters and persists across training; normalization rescales activations of each batch and learns nothing about weight size.',
      },
    ],
  },
};
