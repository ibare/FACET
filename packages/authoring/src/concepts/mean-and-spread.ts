/**
 * meanAndSpread 개념 선언.
 *
 * canonical facet 은 `facet:meanAndSpread` — 값 여덟 2 · 4 · 4 · 4 · 5 · 5 · 7 · 9 를 수의 줄에 쌓고, 평균 5 를 받침
 * 자리로 세운다. 편차가 왼쪽(합 −6)과 오른쪽(합 6)으로 맞서 합이 0 이 되고, 이어 편차가 제곱으로 부풀어(합 32)
 * 그 평균이 분산 4, 제곱근이 표준편차 2 다. 평균 ± 표준편차 띠 안에 값 여섯이 든다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `clt` 는 μ · σ 를 두 수로만 쓰고 평균들의 분포를 다룬다. 이쪽은 그 두 수가 **무엇을 재는가** 하나 —
 * 받침(편차 합 0)과 제곱의 평균 — 를 쥔다. 그래서 definition 은 balance point · deviations sum to zero · squared ·
 * variance · standard deviation 쪽 낱말을 쥐고, 표본 · 뽑기 · 분포 · 흔들림 같은 확률 쪽 말을 쓰지 않는다.
 * 이 조각에는 무작위가 없다.
 *
 * 전제 (설명 글 `meanAndSpread.md` 가 밝힌 것):
 *  - 값 여덟은 평균과 분산이 정수로 떨어지게 예로 정한 값이다.
 *  - 분산의 분모는 n 이다 (여덟을 모집단 전부로 본다). 표본으로 보고 n − 1 로 나누면 32 / 7 ≈ 4.57, 표준편차 약 2.14.
 *  - 표준화(평균을 빼고 표준편차로 나누기)는 하지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const meanAndSpreadConcept: FacetConceptSource = {
  id: 'meanAndSpread',
  label: 'Mean as Balance Point, Variance as Average Squared Deviation',
  canonicalFacet: 'facet:meanAndSpread',

  surface: {
    definition:
      'The mean is the one point where deviations on the left and right cancel to zero; variance averages the squared deviations, and its square root, the standard deviation, returns to the values\' units.',
    exemplarKeywords: [
      'arithmetic mean',
      'variance',
      'standard deviation',
      'deviation from the mean',
      'sum of deviations is zero',
      'why square the deviations',
      'mean as center of mass',
      'population variance divide by n',
      'sample variance n minus 1',
      'measures of spread',
    ],
  },

  briefing: {
    observable: [
      'Eight values — "Values: 2  4  4  4  5  5  7  9" — stack as dots on a number line running from −2 to 12, with "n = 8".',
      'The mean step reads "Sum 40 / 8 → mean 5" and sets a fulcrum marked "μ = 5" at 5.',
      'Each value\'s deviation detaches from its dot and lines up under the fulcrum, negatives to the left and positives to the right ("Deviations: value − 5"), each side totalled as "Σ −6" and "Σ 6": "Left sum −6 · right sum 6 · total 0".',
      'Each deviation then swells into a square whose side is its length: "Squared deviations: total 32", and "Farthest value 9: deviation 4 → square 16" — heavier than the three deviations of −1 together, which square to 3.',
      '"Variance = 32 / 8 = 4" appears as a square of area 4, and "Standard deviation √4 = 2" takes its side, marked "σ = 2".',
      'The last step lays a band "μ ± σ = 3 .. 7 · values inside: 6" over the number line; 2 and 9 fall outside it.',
      'The divisor is n because the eight values are treated as the whole population; dividing by n − 1 for a sample would give 32 / 7 ≈ 4.57. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays six steps by itself — values, mean, deviations, squares, variance, standard deviation — and stops.',
        'A Replay button and a playback strip sit below it. After the run, holding the deviation step shows the left and right sums meeting at zero, which is why squaring is needed next.',
        'The eight values are fixed, so every sum and square can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article defines variance and has to justify squaring: the plain deviations always sum to zero around the mean, so they cannot measure spread.',
      'A reader thinks of the mean only as "add and divide" and the article wants it seen as the balance point of the data.',
    ],

    avoidWhen: [
      'The subject is the n versus n − 1 choice for sample variance as an estimation question. The screen divides by n throughout.',
      'The article is about the median, outliers and robust statistics. Only the mean and standard deviation are computed.',
      'The point is standardizing or normalizing features to zero mean and unit variance. Nothing is rescaled here.',
    ],

    contrastWith: [
      {
        concept: 'clt',
        note: 'Mean and standard deviation describe one set of values. The central limit theorem uses the population\'s μ and σ to predict the centre and width of a different distribution, that of sample means.',
      },
      {
        concept: 'rescaleEachBatch',
        note: 'Batch normalization computes a mean and standard deviation only to subtract and divide by them. What those two numbers measure, and why the deviations are squared, comes before that use.',
      },
      {
        concept: 'lawOfLargeNumbers',
        note: 'A mean computed from given values is exact arithmetic. The law of large numbers is about a mean computed from random draws approaching an unknown true value.',
      },
    ],
  },
};
