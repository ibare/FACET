/**
 * bayesUpdate 개념 선언.
 *
 * canonical facet 은 `facet:bayesUpdate` — 두 주머니(흰 3 · 검 1 / 흰 1 · 검 3)에 반반 나눠 둔 믿음을, 뽑은 공 흰 · 흰 · 검 · 흰
 * 하나마다 두 박자로 고친다. 믿음 × 가능도로 합이 1 에 못 미치는 무게가 되고(곱한다), 그 합으로 나눠 다시 합 1 인 믿음이
 * 된다(나눈다). 흰 공이 많은 주머니 쪽 믿음은 50.0% → 75.0% → 90.0% → 75.0% → 90.0%. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `bayes` 는 검사 · 기저율 · 승산 × 가능도 비와 "절반을 넘는 양성 수" 를 손잡이로 견준다. 이쪽은 그 밑의 한 장면 —
 * **곱하고 나눠 사후가 다음 사전이 되는 두 박자** — 를 가장 작은 가설 둘로 쥔다. 그래서 definition 은 prior · likelihood ·
 * normalize · posterior · two hypotheses · each observation 쪽 낱말을 쥐고, 검사 · 병 · 기저율 · 승산을 쓰지 않는다.
 * `conditionalNarrowing` 은 결과를 세는 쪽이라 가설과 가능도가 없다.
 *
 * 전제 (설명 글 `bayesUpdate.md` 가 밝힌 것):
 *  - 공 수 · 반반인 사전 · 뽑은 차례는 예로 정한 값이다. 뽑은 공은 도로 넣어 가능도가 뽑기마다 같다.
 *  - 모든 값은 정확한 분수로 셈한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bayesUpdateConcept: FacetConceptSource = {
  id: 'bayesUpdate',
  label: 'Bayesian Updating: Multiply by Likelihood, Then Normalize',
  canonicalFacet: 'facet:bayesUpdate',

  surface: {
    definition:
      'Belief split between two hypotheses is revised per observation in two moves: multiply each prior by the likelihood of what was seen, then divide by the total so the posterior sums to one.',
    exemplarKeywords: [
      'Bayesian updating',
      'prior and posterior',
      'likelihood',
      'normalizing constant',
      'posterior becomes the next prior',
      'sequential Bayesian inference',
      'which urn is it',
      'belief revision with evidence',
      'Bayes rule step by step',
    ],
  },

  briefing: {
    observable: [
      'Two bars stand for the hypotheses, "White-heavy bag" and "Black-heavy bag". The start reads "Prior, before any draw: 1/2 (50.0%) · 1/2 (50.0%)".',
      'Each draw takes two steps. The multiply step names the ball ("Draw 1: white ball"), shows "Likelihood 3/4" and "Likelihood 1/4" on the two bags, and writes "1/2 × 3/4 = 3/8" and "1/2 × 1/4 = 1/8" under "Belief × likelihood"; both parts shrink and the bar falls short of 1 — "the weights sum to 1/2".',
      'The normalize step reads "Divide each weight by the sum 1/2", the bar stretches back to full length, and "The belief adds up to 1 again: 3/4 (75.0%) · 1/4 (25.0%)" appears under "Posterior".',
      'The draws are white, white, black, white. The white-heavy share goes 50.0% → 75.0% → 90.0% → 75.0% → 90.0%; the black ball brings it back exactly to where it stood after the first white.',
      'A row labelled "Where the split has stood" keeps a mark for every posterior, and a "Draws" row numbers the balls seen so far. Weights before dividing are shown only as fractions, such as 9/16, since not all of them end in one decimal place.',
      'Balls are returned after each draw, so each bag\'s likelihood stays the same; the bag contents, the even prior and the draw order are example values. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays nine steps by itself — the prior, then a multiply step and a normalize step for each of four draws — and stops.',
        'A Replay button and a playback strip sit below it. After the run, stepping between a multiply step and the normalize step after it isolates what dividing by the sum does: the split point moves, the total returns to 1.',
        'The bags and draws are fixed, so every fraction can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces Bayes\' rule as a procedure and needs the two moves — weight by likelihood, then rescale to one — shown separately rather than folded into one formula.',
      'A reader asks why the order of evidence does not matter in the end, and the article wants a black ball seen cancelling a white one exactly.',
    ],

    avoidWhen: [
      'The article is about medical tests, false positives or the base-rate fallacy. There is no test and no population here, only two bags.',
      'The subject is continuous priors, conjugate distributions or Bayesian estimation of a parameter. There are exactly two discrete hypotheses.',
      'The point is choosing a prior or arguing about subjective belief. The prior is fixed at one half each.',
    ],

    contrastWith: [
      {
        concept: 'bayes',
        note: 'Multiply-then-normalize is the update rule. In odds form the normalizing step drops out and each piece of evidence becomes a single multiplication, which makes the effect of the starting base rate easy to count.',
      },
      {
        concept: 'conditionalNarrowing',
        note: 'Conditioning on an event removes outcomes and recounts what is left. Bayesian updating conditions on evidence to reweight hypotheses, which needs the likelihood of that evidence under each one.',
      },
      {
        concept: 'baseRate',
        note: 'Starting from an even prior hides how much the prior matters. With a lopsided prior, the same likelihoods leave a positive result far less convincing.',
      },
    ],
  },
};
