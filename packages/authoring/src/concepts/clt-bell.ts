/**
 * cltBell 개념 선언.
 *
 * canonical facet 은 `facet:cltBell` — 고른 주사위 하나의 눈(평평한 여섯 막대)에서 시작해, 한 평균에 넣는 주사위 수 n 을
 * 1 → 2 → 6 → 10 → 30 으로 늘릴 때마다 평균 400 개를 새로 뽑아 0.5 폭 칸 열하나에 점으로 쌓는다. 평균들이 3.5 로 몰려
 * 봉우리 하나가 되고 평균 ± 표준편차 막대가 좁혀진다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `clt` 는 모집단 넷과 σ/√n 을 견준다. 이쪽은 **한 모집단(평평한 주사위)에서 모양이 바뀌는 한 장면** —
 * 평평한 것이 종이 된다 — 만 쥔다. 그래서 definition 은 flat · fair die · bell · crowd toward the centre 쪽 낱말을 쥐고,
 * 완제품의 skewed · two-peaked · σ/√n · standard error 를 쓰지 않는다. 표본이 하나씩 떨어져 쌓이는 것(`histogramShape`)
 * 이나 비율 하나의 흔들림(`lawOfLargeNumbers`)과도 가른다 — 여기서는 무리가 걸음마다 통째로 새로 나온다.
 *
 * 전제 (설명 글 `cltBell.md` 가 밝힌 것):
 *  - 씨앗 1 로 뽑은 한 번의 뽑기다. 평균 400 개 · n 수열 · 칸 폭 0.5 는 예로 정한 값이다.
 *  - 정규분포 곡선을 겹쳐 그리지 않는다. 종 모양은 센 칸이 스스로 보인다.
 *  - 평균들의 표준편차는 400 으로 나눠 셈했다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const cltBellConcept: FacetConceptSource = {
  id: 'cltBell',
  label: 'Averages of a Flat Die Form a Bell',
  canonicalFacet: 'facet:cltBell',

  surface: {
    definition:
      'A single fair die is flat, yet averages of several dice crowd toward 3.5 into one bell-shaped peak that grows taller and narrower as more dice go into each average.',
    exemplarKeywords: [
      'bell curve from dice',
      'averages look normal',
      'normal approximation',
      'why the bell curve appears everywhere',
      'uniform distribution to normal distribution',
      'rolling many dice and averaging',
      'distribution of the average of n dice',
      'extremes cancel out in an average',
      'central limit theorem intuition',
    ],
  },

  briefing: {
    observable: [
      'The start shows one die: six bars of equal height over faces 1..6, captioned "One die: faces 1 … 6, each with chance 1 / 6", and "No means yet." A ladder of the n values 1 · 2 · 6 · 10 · 30 stands beside it.',
      'Each later step sets how many dice go into each mean — n = 1, 2, 6, 10, 30 — and draws a fresh crowd of 400 means as dots in eleven bins centred at 1.0, 1.5, … 6.0, captioned like "Dice per mean: 10 · Means: 400".',
      'At n = 1 the means are just die faces, so the five half-way bins stay empty and the other six are spread fairly evenly (82 · 67 · 55 · 79 · 55 · 62).',
      'From n = 2 on a single peak stands, and the dots crowd toward the middle. At n = 30, 222 of the 400 means land in the 3.5 bin.',
      'A stats line reads "Mean of means · SD of means · Tallest bin", and an orange "mean ± SD" bar sits beneath the dots. The SD of means narrows 1.73 → 1.20 → 0.72 → 0.57 → 0.31 while the mean of means stays near 3.5 (3.36 at n = 1, 3.49 at n = 30).',
      'Each crowd is drawn anew. Dots appear to move between steps because the old and new crowds are paired in order of value — it shows the shape changing, not the same means travelling.',
      'This is one run with seed 1; other seeds give slightly different counts but the same crowding and narrowing. No normal curve is drawn over the bins. The screen does not footnote either point.',
    ],

    screen: {
      affordances: [
        'The screen plays six steps by itself — the single die, then one crowd for each n — and stops at n = 30.',
        'A Replay button and a playback strip sit below it. After the run, dragging back between n = 1 and n = 2 shows the flat spread turning into a single peak in one step.',
        'The seed and values are fixed, so an article can quote the bin counts and SDs exactly.',
      ],
    },

    useWhen: [
      'The article claims that averages come out bell-shaped even when single outcomes are not, and wants that seen on the plainest flat source there is.',
      'A reader wonders why so many measured quantities look normal, and the article explains it as many small independent effects averaging out.',
    ],

    avoidWhen: [
      'The article compares several source distributions or checks the σ/√n formula across sample sizes. Only the fair die is shown, and no formula is printed.',
      'The subject is the normal distribution itself — its density formula, z-scores or the 68-95-99.7 rule. No curve or table is drawn.',
      'The point is a single sample becoming more accurate one draw at a time. Every step replaces the whole crowd of 400 means.',
    ],

    contrastWith: [
      {
        concept: 'clt',
        note: 'Averages of a flat die becoming a bell is one instance. The theorem claims the same for any finite-variance source and fixes the width at σ/√n.',
      },
      {
        concept: 'histogramShape',
        note: 'A histogram of single draws converges to the source distribution itself. Averaging changes the target: the histogram of means converges to a bell even when the source is flat.',
      },
      {
        concept: 'lawOfLargeNumbers',
        note: 'That an average lands near the true mean is the law of large numbers. The bell is a statement about the shape of the scatter that remains around that mean.',
      },
      {
        concept: 'pascalTriangle',
        note: 'Binomial coefficients along a row of Pascal\'s triangle already rise and fall in a bell. It is the same counting effect: middle totals can be reached in far more ways than extreme ones.',
      },
    ],
  },
};
