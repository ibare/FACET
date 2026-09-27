/**
 * baseRate 개념 선언.
 *
 * canonical facet 은 `facet:baseRate` — 1000 명씩인 두 무리(기저율 1.0% · 50.0%)에 같은 검사(병이면 90% 양성, 아니어도 10% 양성)를
 * 건다. 참 양성과 거짓 양성이 두 더미로 쌓였다가 한 더미로 모인다. 드문 쪽은 9 / 108 = 8.3%, 흔한 쪽은 450 / 500 = 90.0%.
 * 두 무리가 같은 걸음에 함께 간다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `bayes` 는 양성을 **연달아** 받으며 승산이 9 배씩 오르는 것과, 기저율마다 절반을 넘는 양성 수를 견준다. 이쪽은
 * **양성 한 번**의 뜻이 기저율에 따라 갈리는 한 장면 — 참 양성이 거짓 양성에 묻힌다 — 만 쥔다. 그래서 definition 은
 * false positives outnumber · rare · same test · positive predictive value 쪽 낱말을 쥐고, odds · repeated · likelihood ratio ·
 * 절반을 넘는다 를 쓰지 않는다.
 *
 * 전제 (설명 글 `baseRate.md` 가 밝힌 것):
 *  - 기저율 둘 · 검사의 90% · 10% · 무리마다 1000 명은 예로 정한 값이다.
 *  - 수는 기대 도수다 — 무작위로 뽑은 결과가 아니다. 더미 안에서 참 양성이 섞이는 자리는 배치일 뿐이다.
 *  - 문턱을 옮겨 민감도와 헛짚음을 맞바꾸는 이야기는 다루지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const baseRateConcept: FacetConceptSource = {
  id: 'baseRate',
  label: 'Base Rate: A Positive Test for a Rare Condition',
  canonicalFacet: 'facet:baseRate',

  surface: {
    definition:
      'The same test gives a positive result very different meaning in two groups: where the condition is rare, false positives from the many healthy people outnumber the true positives.',
    exemplarKeywords: [
      'base rate fallacy',
      'base rate neglect',
      'positive predictive value',
      'false positive paradox',
      'prevalence',
      'medical screening test accuracy',
      'sensitivity and specificity',
      'most positives are false alarms',
      'natural frequencies',
      'rare disease test',
    ],
  },

  briefing: {
    observable: [
      'Two groups of 1000 people stand side by side, "Rare disease" with "Base rate: 1.0%" and "Common disease" with "Base rate: 50.0%". The start splits them — "Sick: 10 · Not sick: 990" and "Sick: 500 · Not sick: 500" — under "People in each group: 1000. The same test on both."',
      'Testing the sick moves their positives into a pile: "Sick, positive: 9 · missed: 1" on the rare side, "450 · missed: 50" on the common side, each pile marked "True positive".',
      'Testing the not-sick builds a second pile, "False positive": 99 on the rare side (negative 891) and 50 on the common side (negative 450).',
      'The two piles merge into one: "All positive: 108 = 9 + 99" and "All positive: 500 = 450 + 50". On the rare side the nine true positives are mixed into a pile where false positives outnumber them eleven to one.',
      'The last step reads "Sick among positive: 9 / 108 = 8.3%" against "450 / 500 = 90.0%", with "Same test, only the base rate differs." Both groups are drawn to the same scale, so pile sizes compare directly.',
      'The counts are expected frequencies, not a random draw, which is why every number is whole; where the true positives sit inside the merged pile is only an arrangement. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays five steps by itself, both groups moving together, and stops on the two shares.',
        'A Replay button and a playback strip sit below it. After the run, holding the step where the piles merge shows the rare side\'s 9 lost inside 108 while the common side\'s 450 dominate its 500.',
        'The rates and group sizes are fixed, so every count can be quoted.',
      ],
    },

    useWhen: [
      'The article warns that a positive screening result for a rare condition is more likely a false alarm than not, and wants the reason shown as people counted rather than as a formula.',
      'A reader assumes a test that is "90% accurate" means a positive is 90% certain, and the article needs the same test giving 8.3% in one group and 90.0% in the other.',
    ],

    avoidWhen: [
      'The article is about repeat testing or how further positives raise the probability. There is one test per person here.',
      'The subject is tuning a decision threshold or trading sensitivity against false alarms. The test\'s rates are fixed.',
      'The point is sampling variation in real studies. The counts are exact expected frequencies with no randomness.',
    ],

    contrastWith: [
      {
        concept: 'bayes',
        note: 'One positive against a low base rate is still weak evidence. Repeated independent positives multiply the odds each time, which is how a rare condition can still become the likely explanation.',
      },
      {
        concept: 'bayesUpdate',
        note: 'Share among positives is a posterior computed in one step from prior times likelihood. The general update applies the same rule to any hypotheses, repeatedly, with the base rate playing the part of the prior.',
      },
      {
        concept: 'rocImbalance',
        note: 'Class imbalance leaves a classifier\'s ROC curve unchanged while its precision collapses. That collapse is this effect: positive predictive value falls with prevalence even at fixed sensitivity and specificity.',
      },
    ],
  },
};
