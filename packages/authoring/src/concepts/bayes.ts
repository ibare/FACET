/**
 * bayes 개념 선언.
 *
 * canonical facet 은 `facet:bayes` — 1000 명 가운데 기저율만큼 병인 사람이 있고, 검사는 병이면 90% · 아니어도 10% 양성이다.
 * 양성이 연달아 나올 때마다 두 박자 — 곱해(병 쪽 × 90%, 병 아님 쪽 × 10%) 막대가 줄고, 나눠 다시 1 이 된다. 승산
 * `병 : 병 아님` 은 정수 쌍으로 뜨고 병 쪽만 × 9 된다. 손잡이 둘 — 기저율(0.1% · 1% · 2% · 5% · 20% · 50%) · 연달아 양성(0..3).
 * 끝 걸음은 병일 몫의 자취와 50% 선을 나란히 두고 절반을 넘는 첫 양성 수를 적는다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 각각 한 장면이다 — 조건이 분모를 바꾼다(`conditionalNarrowing`) · 곱하고 나누는 두 박자(`bayesUpdate`) ·
 * 양성 한 번이 기저율에 따라 다른 뜻이 된다(`baseRate`). 이쪽은 **손잡이 둘로 견주는 것** — 양성마다 승산이 기저율과
 * 무관하게 같은 배수로 오르고, 그래서 기저율이 몇 번의 양성이 필요한지를 정한다 — 을 맡는다. 그래서 definition 은
 * odds · likelihood ratio · repeated positives · how many positives · pass one half 쪽 낱말을 쥐고, 조각들이 쥔
 * false positives outnumber · denominator · prior/posterior per observation · two hypotheses 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `bayes.md` 가 밝힌 것):
 *  - 검사의 90% · 10% 와 기저율 여섯은 예로 정한 값이다. 90% 는 민감도, 10% 는 거짓 양성 비율(1 − 특이도).
 *  - 검사끼리 서로 무관하다고 둔다 — 같은 사람을 다시 검사해도 앞 결과에 끌리지 않는다. 실제 검사에서는 흔히 깨진다.
 *  - 1000 명은 기대 도수다. 승산 `90 : 990` 은 같은 비를 기약하지 않은 것이지 사람 수가 아니다.
 *  - "절반을 넘는다" 는 엄격한 비교다 — 50% 기저율의 500 : 500 은 넘지 않은 것으로 센다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bayesConcept: FacetConceptSource = {
  id: 'bayes',
  label: 'Bayes\' Theorem in Odds Form (Repeated Positives and Base Rates)',
  canonicalFacet: 'facet:bayes',

  surface: {
    definition:
      'Each positive result multiplies the odds of disease by the same likelihood ratio at every base rate, so the base rate alone decides how many repeated positives it takes to pass one half.',
    exemplarKeywords: [
      'Bayes\' theorem',
      'odds form of Bayes\' rule',
      'likelihood ratio',
      'posterior odds = prior odds × likelihood ratio',
      'prior probability',
      'repeat testing',
      'second positive test',
      'why doctors order a confirmatory test',
      'how many positive tests to be sure',
      'posterior probability',
    ],
  },

  briefing: {
    observable: [
      'A single share bar is split into sick (left) and not sick (right), adding to 1. Above it "Odds (sick : not sick)" shows a pair of whole numbers, and a "50%" line marks the halfway point. Below, "Sick share after each positive" collects one point per positive against 0%, 50% and 100%.',
      'Each positive takes two steps. The multiply step — "Positive #1: sick side × 90%, not-sick side × 10%" — shrinks both parts, the not-sick side far more, leaving a gap at the right; the odds become "90 : 990" with "from 10 : 990, sick side × 9". The divide step — "Divide so the two add up to 1 — sick share: 8.3%" — stretches the parts back to the full bar and adds a point to the trail.',
      'With the default 1% base rate and 3 positives, the sick share goes 1.0% → 8.3% → 45.0% → 88.0%, the odds 10 : 990 → 90 : 990 → 810 : 990 → 7290 : 990, and the last step reads "First positive that passes half: 3".',
      'Across base rates the pattern repeats with a different start: 0.1% gives 0.1% → 0.9% → 7.5% → 42.2% and "Within 3 positives it does not pass half"; 2% and 5% pass at 2; 20% passes at 1 (20.0% → 69.2%); 50% passes at 1, since 500 : 500 at the start counts as exactly half, not past it.',
      'The two readouts under the controls are "Odds factor", stepping 1 · 9 · 81 · 729 whatever the base rate, and "Sick among positives (‰)". The odds are never reduced — 90 : 990 is not shown as 1 : 11 — so the not-sick number stays fixed while only the sick number is multiplied by 9.',
      'The 1000 people are expected frequencies, the test rates and base rates are example values, and repeated tests are assumed independent of each other, which real retests often are not. The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: a six-position "Base rate" slider (0.1%, 1%, 2%, 5%, 20%, 50% — starts at 1%) and a four-position "Positives in a row" slider (0 to 3 — starts at 3). Each round plays through its positives and waits for a handle.',
        'The move that makes the idea land is keeping three positives and stepping the base rate down: the odds factor stays 1 · 9 · 81 · 729 every time, while the positive that first passes 50% moves from 1 to 2 to 3 and then out of reach.',
        'The code panel, labelled "Sick share after k positives", starts empty with a "+ Add language" button; the chosen language shows the whole-number odds and the search for the first positive past half. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article presents Bayes\' theorem in odds form — posterior odds equal prior odds times the likelihood ratio — and wants the ratio seen as a constant multiplier independent of the starting point.',
      'A reader asks why a second or third positive test is ordered for a rare condition, and the article needs the number of positives required tied directly to the base rate.',
    ],

    avoidWhen: [
      'The retests are correlated, for example the same sample run again. The model assumes each positive is independent evidence.',
      'The article is about negative results, test thresholds or trading sensitivity against specificity. Only positives are shown and the test rates are fixed.',
      'The subject is Bayesian statistics with continuous parameters or prior distributions. There are only two states, sick and not sick.',
    ],

    contrastWith: [
      {
        concept: 'baseRate',
        note: 'The base-rate effect is about what a single positive means. Repeated independent positives multiply the odds each time, so a low prior can be overcome, at the cost of more tests.',
      },
      {
        concept: 'bayesUpdate',
        note: 'Multiplying by likelihoods and renormalizing is the general update for any hypotheses. Writing it as odds removes the renormalization and turns each piece of evidence into one fixed factor.',
      },
      {
        concept: 'conditionalNarrowing',
        note: 'Conditioning on an event recounts the outcomes that remain. Each positive result is such a condition, applied again and again, and the odds track what survives each time.',
      },
      {
        concept: 'rocImbalance',
        note: 'Precision falling under class imbalance is the single-positive base-rate effect seen from the classifier\'s side. Chaining independent tests is a way around it that a single threshold cannot offer.',
      },
    ],
  },
};
