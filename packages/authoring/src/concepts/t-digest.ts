/**
 * tDigest 개념 선언.
 *
 * canonical facet 은 `facet:tDigest` — 완결형이다. 분위 자 위에 뭉치가 폭에
 * 비례해 늘어서고, q=0.99 와 q=0.50 두 질의가 답과 참값을 나란히 적고, 그 아래
 * δ 넷(6·12·24·48)의 값 오차가 꼬리 · 가운데 두 띠로 견주어진다. 재생 묶음과
 * δ 손잡이, 계기 셋(뭉치 · 꼬리 뭉치 · 가장 큰 뭉치)이 딸려 있다.
 *
 * 코드 패널은 없다 — 척도 함수에 `asin`/`sin` 이 필요한데 IR 의 예약 수학
 * 이름에 없어서다 (`irs.ts`). 그래서 screen.affordances 에 적지 않는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 조각 `crowdTheTails` 는 **자리를 어떻게 나누는가** 에서 멈춘다 — 경계가 어디에
 * 떨어지는지까지만 말하고 질의하지 않는다. 이 완제품이 홀로 지는 것은 **그렇게
 * 나눈 값이 무엇인가** 다: 손잡이로 자리 수를 늘렸을 때 꼬리 오차가 가운데보다
 * 훨씬 빠르게 준다는 것. 그래서 definition 의 주어가 "경계의 배치" 가 아니라
 * "질의에 답하는 요약과 그 오차" 이고, keywords 도 p99 · 지연 백분위 · 압축 계수
 * 쪽 어휘만 갖는다 (조각의 구간 나누기 어휘와 겹치지 않게).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const tDigestConcept: FacetConceptSource = {
  id: 'tDigest',
  label: 't-Digest (What the Compression Budget Buys at the Tail)',
  canonicalFacet: 'facet:tDigest',

  surface: {
    definition:
      'A bounded-memory summary that answers quantile queries from bucket means, where raising the compression budget shrinks the error at the extreme quantiles far faster than at the median.',
    exemplarKeywords: [
      't-digest',
      'approximate quantiles',
      'quantile sketch',
      'p99',
      'p999',
      'tail latency percentile',
      'compression parameter',
      'how accurate is the estimated percentile',
      'percentiles without keeping every sample',
      'error at the 99th percentile',
      'monitoring and latency histograms',
      'how many buckets do I need',
    ],
  },

  briefing: {
    observable: [
      'The buckets are drawn along a quantile line with each cell as wide as the share of ranks it covers, so the outer cells are visibly slivers and the central ones are broad, and the same picture carries the count of points inside each cell.',
      'The number inside a cell is omitted once the cell is too narrow to hold it, so the tail cells read as width alone while the wide middle cells state how many points one bucket is standing in for.',
      'Two queries are answered side by side, one near the end at q = 0.99 and one at q = 0.50, and each reports the value answered, the true value, and the gap between them as a percentage.',
      'Each query also drops a line onto the quantile line at the position it asked about, so the answer is tied to the cell it came out of.',
      'Four compression settings are held side by side as two rows of bars, one row for the end query and one for the middle, with the setting currently in force picked out and the other three left faded — the comparison is on screen at once rather than remembered across runs.',
      'Across those four settings the error at q = 0.99 falls from about 45.8% to 1.8% while the middle falls from about 6.5% to 1.0%, so the two rows shorten at visibly different rates.',
      'Changing the setting clears both answers before the new buckets are drawn, so a reading is never shown against buckets it did not come from.',
      'Three counters run along the bottom — the number of buckets, the points in the outermost bucket, and the points in the largest one — and at the highest setting the largest bucket still stands in for fourteen points while the outermost holds one.',
      'Before the first pass the header writes a dash where the bucket count goes rather than a zero.',
      'After the comparison the pass ends and the screen holds its last state, waiting rather than looping.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset, and a speed slider. One pass builds the buckets, asks the two queries, draws the comparison, and then stops.',
        'A segmented slider sets the compression to 6, 12, 24 or 48, starting at 12; choosing a new one rebuilds the buckets and replays the two queries against them.',
        'The way to read the claim is to change the slider and look at the two rows of bars, which keep all four settings visible at once so the two rates of improvement can be compared directly.',
        'Three counters sit beside the controls — buckets, the outermost bucket, the largest bucket — and they are where the cost of the arrangement can be quoted.',
        'The values, the two query positions and the four settings are fixed, so the percentages on screen can be quoted in the text exactly as they appear.',
      ],
    },

    useWhen: [
      'The article quotes a 99th-percentile latency taken from a summary that keeps only a few hundred slots, and the reader has no way to judge what that number is worth. Two answers checked against the true value at once, one at the far end and one at the median, is where the worth can be read off.',
      'The prose treats a larger budget as a uniform gain in accuracy. Holding four budgets side by side shows the end query improving roughly twenty-five fold while the median improves about six, which turns the budget into a choice about where the accuracy should land.',
      'A reader is weighing whether to pay for more slots at all, and the honest answer is that the payment lands unevenly. The largest bucket still standing in for fourteen points at the top setting, next to an outermost bucket holding one, is that unevenness as a quantity.',
    ],

    avoidWhen: [
      'The article needs exact quantiles — a full sort, a selection algorithm, or a median over data small enough to keep. Everything here is answered from bucket means and is expected to be off by some percentage.',
      'The subject is how a summary absorbs points as they arrive, or how two summaries computed on different machines are merged into one. A fixed set of values is summarised here in a single pass.',
      'The point is where the bucket boundaries come from — the scale function that decides which ranks fall together. The arrangement is already in place before anything is asked.',
      'The subject is memory measured in bytes or time measured in operations. What is counted here is buckets and points, and neither converts into either.',
      'The article uses "compression" for shrinking files, or "digest" for a cryptographic hash of a message.',
    ],

    contrastWith: [
      {
        concept: 'crowdTheTails',
        note: 'One settles only where the boundaries fall and stops before anything is asked; this one starts from boundaries already placed and asks what the resulting answers are worth.',
      },
      {
        concept: 'averageTheBuckets',
        note: 'Both make accuracy a consequence of how the range is divided, but that one divides evenly so no single region can distort the estimate, while this divides unevenly on purpose so one region is answered better than the rest.',
      },
      {
        concept: 'countingSort',
        note: 'Both spend slots to answer questions about a collection of numbers, but one lays out a slot per possible value and is exact, while this fixes the number of slots first and accepts an error that depends on where the question is asked.',
      },
    ],
  },
};
