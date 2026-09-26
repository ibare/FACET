/**
 * rescaleEachBatch 개념 선언.
 *
 * canonical facet 은 `facet:rescaleEachBatch` — 한 특징의 값이 넷씩 세 묶음(b1 · b2 · b3)으로 들어온다. 자리도 폭도
 * 제각각이던 묶음이 하나씩 제 평균을 빼 0 에 자리 잡고(폭 그대로), 이어 제 폭으로 나뉘어 좁던 b1 · b3 은 펴지고
 * 넓던 b2 는 오므라든다. 끝에 셋 다 평균 0.00 · 폭 1.00. 묶음 안 차례와 값 모양은 그대로다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `batchnorm` 은 묶음 크기를 돌려 한 값이 누구와 한 묶음이냐에 따라 흩어지는 것을 쥔다. 이쪽은 **공식이
 * 한 묶음에 하는 두 동작 — 자리 맞춤 · 폭 맞춤 — 과 그 결과 묶음들이 모이는 장면** 하나다. definition 은 subtracts
 * its own mean · divides by its own standard deviation · mean zero and unit width · order within each unchanged 를
 * 쥐고, 완제품의 same input · different outputs · shuffles · smaller batches scatter 를 쓰지 않는다.
 *
 * 전제: 값 열둘은 손으로 고른 장난감 값이다. 분산은 모집단 분산(n 으로 나눔), ε 0.00001. γ 1 · β 0 으로 학습되는
 * 되돌림을 뺐고, 추론 때의 이동 평균은 다루지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const rescaleEachBatchConcept: FacetConceptSource = {
  id: 'rescaleEachBatch',
  label: 'Batch Normalization Formula (Center, Then Scale)',
  canonicalFacet: 'facet:rescaleEachBatch',

  surface: {
    definition:
      'Batch normalization subtracts each batch\'s own mean and divides by its own standard deviation, bringing batches with different centres and widths to mean zero and unit width while leaving the order within each unchanged.',
    exemplarKeywords: [
      'batch normalization formula',
      '(x − μ) / √(σ² + ε)',
      'normalize activations',
      'zero mean unit variance',
      'standardization per mini-batch',
      'internal covariate shift',
      'centering and scaling',
      'batch mean and variance',
      'gamma and beta',
    ],
  },

  briefing: {
    observable: [
      'Three rows b1, b2 and b3, each four values on a shared axis from −6 to 6, start "As given: each batch with its own mean and width." — b1 mean 2.30 width 0.45, b2 mean −1.00 width 4.58, b3 mean 6.85 width 0.49. Each row carries "Mean" and "Width" readouts.',
      'Each batch takes two steps. The first shifts it: "Batch b1: subtract its own mean, μ = 2.30", and the four values move together to sit around 0 while "Width σ: 0.45 → 0.45" stays the same.',
      'The second rescales it: "Batch b1: divide by its own width, √(σ² + ε) = 0.45", with "Width σ: 0.45 → 1.00". The narrow b1 and b3 spread out; the wide b2 draws in (4.58 → 1.00).',
      'After seven steps (the start and two per batch) all three rows read "Mean: 0.00" and "Width: 1.00": b1 −0.45 · 0.45 · −1.34 · 1.34, b2 −0.65 · 1.53 · 0.22 · −1.09, b3 −1.32 · 1.32 · −0.51 · 0.51.',
      'Within each batch the smallest value stays smallest and the largest stays largest, and the three batches keep different shapes; only position and width have been matched.',
      'The values are hand-picked; width is the population standard deviation (dividing by n) and ε is 0.00001, so the true width is a hair under 1. The learned γ and β that could undo the rescaling are left out (γ 1, β 0).',
    ],

    screen: {
      affordances: [
        'The screen plays seven steps by itself, one batch at a time, and stops with the three batches aligned.',
        'A Replay button and a playback strip sit below. Stepping between a shift and the following division separates the two moves — one changes only the mean, the other only the width.',
        'All values are fixed, so an article can quote each batch\'s mean, width and final values exactly.',
      ],
    },

    useWhen: [
      'The article introduces the batch normalization formula and wants its two operations — subtracting the mean, then dividing by the spread — shown as two separate moves on real numbers.',
      'The reader thinks normalizing reshapes the data into a standard bell; afterwards the three batches share centre and width but keep their own shapes and orderings.',
    ],

    avoidWhen: [
      'The article is about how batch size or batch composition changes the result for a given value. Each batch here is fixed.',
      'The subject is the learned scale and shift, or running averages used at inference. Both are left out.',
      'The point is normalizing input features once before training. What is shown is per-batch statistics applied batch by batch.',
    ],

    contrastWith: [
      {
        concept: 'batchnorm',
        note: 'Bringing every batch to the same centre and width is what the formula guarantees; that a single value\'s result shifts with whoever shares its batch is the side effect of using batch statistics.',
      },
      {
        concept: 'perParameterStep',
        note: 'Both divide by a measured spread. Batch normalization rescales activation values across a batch; adaptive step sizes rescale each weight\'s update by its gradient history.',
      },
      {
        concept: 'dropRandomUnits',
        note: 'Both act on a layer\'s activations during training; normalization shifts and rescales every value deterministically, while dropout silences a random subset of units.',
      },
    ],
  },
};
