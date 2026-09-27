/**
 * clt 개념 선언.
 *
 * canonical facet 은 `facet:clt` — 눈 1..6 을 무게대로 뽑는 모집단 넷(고른 주사위 · 두 주사위 중 큰 눈 · 한쪽 쏠림 · 양 끝)
 * 가운데 하나에서 눈 n 개를 뽑아 평균 하나를 내기를 400 번 하고, 평균이 떨어진 칸(폭 0.5)을 센다. 위 막대는 모집단의 무게와
 * μ · ±σ, 아래 칸은 평균들과 평균들의 평균 · ±폭이다. 손잡이 둘 — 모집단 · 한 평균에 넣는 수 n(1 · 2 · 6 · 10 · 30).
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 넷)
 *
 * 조각 넷은 각각 한 장면이다 — 표본이 쌓여 모양이 서는 것(`histogramShape`) · 평균과 퍼짐이 무엇을 재는가(`meanAndSpread`) ·
 * 평평한 주사위의 평균이 봉우리 하나로 몰리는 것(`cltBell`) · 비율 하나의 흔들림이 좁아지는 것(`lawOfLargeNumbers`).
 * 이쪽은 **손잡이 둘로 견주는 것**을 맡는다 — 모집단을 바꿔도 같은 일이 일어나는가, 폭이 σ/√n 과 맞는가.
 * 그래서 definition 은 four populations · skewed · two-peaked · σ/√n · standard error 쪽 낱말을 쥐고,
 * 조각들이 쥔 bell · flat die · balance point · running share · ragged bins 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `clt.md` 가 밝힌 것):
 *  - 씨앗 1 로 한 번 뽑은 것이다. 평균 400 개 · n 사다리 · 칸 폭 0.5 · 쏠림과 양 끝의 무게는 예로 정한 값이다.
 *    폭이 n 마다 좁혀지는 것 · 폭이 σ/√n 과 12 % 안인 것 · n 30 에서 봉우리 하나인 것은 씨앗 1..20 모두에서 선다.
 *    "봉우리가 하나로 서는 첫 n" 은 이 뽑기의 값일 뿐이다.
 *  - 뽑기는 되돌려 넣는 서로 무관한 뽑기다. σ/√n 은 그렇게 뽑을 때의 폭이다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다. 뽑기(mulberry32)는 코드 패널 밖에 있다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const cltConcept: FacetConceptSource = {
  id: 'clt',
  label: 'Central Limit Theorem Across Populations (Spread of Means vs σ/√n)',
  canonicalFacet: 'facet:clt',

  surface: {
    definition:
      'Whatever the population — uniform, skewed or two-peaked — the distribution of sample means centres on μ, its width follows σ/√n, and the population\'s own shape fades as n grows.',
    exemplarKeywords: [
      'central limit theorem',
      'sampling distribution of the sample mean',
      'standard error of the mean',
      'sigma over root n',
      'does the population need to be normal',
      'CLT for skewed data',
      'bimodal population averages',
      'mean of sample means equals population mean',
      'how sample size narrows the sampling distribution',
      'four times the sample for half the error',
    ],
  },

  briefing: {
    observable: [
      'Two rows share one horizontal scale from 1 to 6. The upper row is the chosen population: six bars for faces 1..6 with their weights out of 36, a μ line and a μ ± σ frame, headed like "Both ends · n = 10" and "μ 3.50 · σ 2.29". The lower row is eleven bins centred at 1.0, 1.5, … 6.0 that collect the means.',
      'Each round has five steps. Step 1 pulls the first mean\'s n faces out of the bars and adds them — "sum 25 · 25/10 = 2.50" — and sends that mean to its bin. Step 2 raises all eleven bin counts at once for 400 means, with "400 means · peaks 1 · tallest bin 97". Step 3 slides a marker from μ down to the mean of means ("mean of means 3.50 · μ 3.50"). Step 4 brings the ± σ frame down to the ± spread of the means and writes beside it "spread 0.77 · σ/√n = 2.29/√10 = 0.72".',
      'The four populations are Fair die (weights 6 6 6 6 6 6, μ 3.50, σ 1.71), Larger of two (1 3 5 7 9 11, μ 4.47, σ 1.40), Skewed (15 9 6 3 2 1, μ 2.19, σ 1.35) and Both ends (14 3 1 1 3 14, μ 3.50, σ 2.29).',
      'Raising n narrows the spread in every population. For Both ends the spreads for n = 1, 2, 6, 10, 30 are 2.30, 1.61, 0.97, 0.77, 0.42 beside σ 2.29; for the fair die 1.73, 1.20, 0.72, 0.57, 0.31. All twenty combinations stay within 12% of σ/√n.',
      'At n = 30 every population gives a single peak, and the mean of means sits within 0.05 of μ. Both ends at n = 1 shows two peaks, its bins piled at 1.0 (166) and 6.0 (150).',
      'The two readouts under the controls are Peaks and Tallest bin. Peaks counts clusters that stand higher than both neighbours after empty bins are dropped and equal neighbouring counts are merged; the fair die at n = 1 reads 3 peaks, which is the jitter of 400 means rather than a feature of the die.',
      'The draws are one run with seed 1, so the same settings always give the same counts. The first n at which one peak appears (fair die 2, larger of two 1, skewed 1, both ends 10) belongs to this run only; other seeds give other values. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: a four-position "Population" slider (Fair die, Larger of two, Skewed, Both ends — starts on Both ends) and a five-position "Values per mean" slider (1, 2, 6, 10, 30 — starts at 10). Each round plays its five steps and waits for a handle.',
        'The move that makes the idea land is stepping "Values per mean" upward on one population and then switching population at n = 30: the spread frame shrinks toward σ/√n each time, and at the top every population ends in one peak near its own μ.',
        'The code panel, labelled "Bins, mean and spread", starts empty with a "+ Add language" button; the chosen language shows how bins, the mean of means and the spread are computed from the 400 sums. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article states that the central limit theorem does not require a normal population and needs the same narrowing shown for a skewed and a two-peaked source side by side.',
      'A reader needs the standard error σ/√n checked against numbers: the measured spread of 400 means printed beside the formula for each sample size.',
    ],

    avoidWhen: [
      'The distribution in question has no finite variance, or the draws depend on each other. Every draw here is independent, with replacement, from a six-face population.',
      'The article is about confidence intervals, hypothesis tests or t-distributions as procedures. The screen measures the spread of means; it builds no interval and runs no test.',
      'The point is that one running average settles down over time. The screen compares whole batches of 400 means, not a single sequence growing toss by toss.',
    ],

    contrastWith: [
      {
        concept: 'cltBell',
        note: 'That averaging a flat distribution produces one central peak is the core phenomenon. The theorem\'s reach is the further claim that the source shape does not matter and that the width is fixed by σ/√n.',
      },
      {
        concept: 'lawOfLargeNumbers',
        note: 'The law of large numbers says a sample average gets close to the true mean. The central limit theorem goes further and says how the remaining error is distributed and how fast it shrinks.',
      },
      {
        concept: 'histogramShape',
        note: 'A histogram of raw draws approaching its source distribution is about estimating that distribution. The theorem takes the source as given and asks instead how averages drawn from it are distributed.',
      },
      {
        concept: 'meanAndSpread',
        note: 'Mean and standard deviation are defined for one set of values. The theorem uses them twice: μ and σ of the population predict the centre and width of a second distribution, that of the means.',
      },
      {
        concept: 'sgd',
        note: 'A mini-batch gradient is a sample mean, so its noise shrinks with batch size along the σ/√n rule. That is one application; the theorem itself is about averages of any independent draws.',
      },
    ],
  },
};
