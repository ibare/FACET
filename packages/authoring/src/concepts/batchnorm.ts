/**
 * batchnorm 개념 선언.
 *
 * canonical facet 은 `facet:batchnorm` — 값 열여섯 가운데 4.6 하나를 지켜보며, 같은 열여섯을 여덟 번 다르게 섞어 묶을
 * 때 4.6 이 맞춘 자리 줄 어디에 떨어지는지 쌓는다. 손잡이 "묶음 크기"(2 · 4 · 8 · 16, 처음 4)를 돌리면 점 무더기의
 * 꼴이 바뀐다 — 2 는 −1.00 · 1.00 두 자리에만, 4 · 8 은 전체로 맞춘 자리 0.05 둘레에 흩어지고, 16 은 한 자리에
 * 포갠다. 평균 차 0.99 · 0.75 · 0.41 · 0.00.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 하나)
 *
 * 조각 `rescaleEachBatch` 는 묶음마다 제 평균을 빼고 제 폭으로 나눠 세 묶음이 한 자리 · 한 폭으로 모이는 장면이다.
 * 이쪽은 그 뒷면 — **한 값의 입장에서는 누구와 한 묶음이냐에 따라 맞춘 자리가 흔들린다** — 를 쥔다. definition 은
 * same input · different outputs · which examples share its batch · scatter more with smaller batches 를 쥐고,
 * 조각의 subtracts its own mean · divides by its own standard deviation · mean zero and unit width · order kept 를
 * 쓰지 않는다.
 *
 * 전제 (설명 글 `batchnorm.md`):
 *  - γ 1 · β 0 으로 학습되는 되돌림을 뺐다. 분산은 모집단 분산, ε 0.00001.
 *  - 지켜보는 값 4.6 과 섞음 여덟은 고른 것이다. "모든 값이 그렇다" 가 아니다 — 7.8 을 지켜보면 묶음 4 · 8 이 붙는다.
 *  - 추론 때의 이동 평균은 다루지 않는다. 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const batchnormConcept: FacetConceptSource = {
  id: 'batchnorm',
  label: 'Batch Normalization Depends on Who Shares the Batch',
  canonicalFacet: 'facet:batchnorm',

  surface: {
    definition:
      'Because batch normalization rescales a value with the statistics of whichever mini-batch it lands in, the same input gets different outputs across shuffles, scattering more as batches get smaller.',
    exemplarKeywords: [
      'batch normalization',
      'BatchNorm',
      'Ioffe and Szegedy',
      'batch statistics',
      'small batch size problem',
      'batch dependence',
      'noise from mini-batch statistics',
      'regularizing effect of batch norm',
      'batch norm with batch size 2',
      'nn.BatchNorm1d',
    ],
  },

  briefing: {
    observable: [
      'Two rows: "Original values" holds sixteen numbers with 4.6 marked, and "Scaled positions" runs from −2 to 2 with a dotted line at "Whole-set position 0.05" — where 4.6 lands when all sixteen form one batch. Eight slots, "Shuffle 1" to "Shuffle 8", wait for results.',
      'Each shuffle takes two steps. First the values batched with 4.6 light up in the top row and a μ mark stands at their mean with a σ bracket: "Shuffle 1: the batch holding the tracked value has 4 values. The μ mark is its mean." Then 4.6 drops to its rescaled place and leaves a dot: "Shuffle 1: divided by the batch spread σ, it lands at −0.22."',
      'At the default batch size 4 the eight drops land at −0.22 · 0.62 · −1.30 · −1.36 · 0.23 · 0.84 · 1.42 · 0.14, and the round ends "Mean gap of the eight from the whole-set position 0.05: 0.75". A round is 17 steps: the start and eight shuffles of two steps each.',
      'Across the handle the mean gap is 0.99 · 0.75 · 0.41 · 0.00 for batch sizes 2 · 4 · 8 · 16. At 2 every drop lands at −1.00 or 1.00 — three and five — because a pair always rescales to ±1, keeping only which of the two is larger. At 16 every batch is the whole set, so all eight dots stack on 0.05.',
      'Two readouts, "Dropped points" and "Batches formed", count through the round. μ and σ are shown as marks, not numbers.',
      'The learned scale and shift are left out (γ 1, β 0); variance divides by n and ε is 0.00001. The tracked value and the eight shuffles are chosen — tracking 7.8 instead gives gaps 0.53 · 0.30 · 0.30 · 0.00, with sizes 4 and 8 tied. Inference-time running averages are not part of this screen.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle, "Batch size", with 2 · 4 · 8 · 16 (starts at 4). Turning it clears the pile of dots and replays the same eight shuffles cut into the new size.',
        'The move that makes the idea land is stepping from 16 down to 2: a single stack on the whole-set line spreads into a scatter and then splits into two piles at −1 and +1.',
        'The code panel, labelled "Rescale one value within its batch", starts empty with an add-language button; the chosen language shows `bnValue`, lighting the batch-gathering lines on the first step of a shuffle and the rescaling line on the second. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why batch normalization behaves badly with very small batches and needs to show the output of one fixed input changing with its batch-mates.',
      'The reader treats batch normalization as a fixed per-feature transform; the same 4.6 lands anywhere from −1.36 to 1.42 depending only on which values it was batched with.',
      'The article discusses the noise batch statistics inject during training as a side effect, and wants that noise made visible for a single value.',
    ],

    avoidWhen: [
      'The subject is how batch normalization computes the mean and spread and brings a batch to one centre and width. The steps of the formula are shown only as marks.',
      'The article is about layer normalization, group normalization or inference with running statistics. None of these appear.',
      'The point is batch size as a lever on gradient updates. No training happens here.',
    ],

    contrastWith: [
      {
        concept: 'rescaleEachBatch',
        note: 'Rescaling by each batch\'s own mean and spread gives every batch the same centre and width; the price is that any single value\'s result now depends on the other members of its batch.',
      },
      {
        concept: 'sgd',
        note: 'Both depend on the batch, but mini-batch size in optimization decides which examples shape a weight update, while in batch normalization it decides the statistics a value is rescaled with.',
      },
      {
        concept: 'dropout',
        note: 'Both add training-time randomness to activations; dropout injects it on purpose by removing units, whereas batch normalization picks it up as a by-product of which examples share a batch.',
      },
    ],
  },
};
