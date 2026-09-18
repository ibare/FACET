/**
 * unpredictableBranch 개념 선언.
 *
 * canonical facet 은 `facet:unpredictableBranch` — 동전을 던져 한 번 뽑아 고정한 결과 열여섯
 * 번(T 여덟 · N 여덟)을 2비트 카운터와 이력 표(이력 2 · 1비트 칸)가 나란히 짐작하는 한 장면이다.
 * 맞힌 비율이 선 둘로 그려져 처음엔 정반대 끝에서 출렁이다가 절반 점선 언저리로 모인다.
 * 끝은 카운터 8/16, 이력 표 9/16. 손잡이는 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 주어를 **예측기가 아니라 분기**로 세웠다. branchHistoryTable 은 예측기의 길이를 고르는 일,
 * patternFromHistory 는 예측기가 기억하는 내용이고, 이쪽은 분기의 결과가 우연이라는 성질 —
 * 그래서 어떤 예측기를 두어도 같은 곳에 닿는다는 주장이다.
 *
 *   이 definition 은 'chance' · 'random' · 'independent' · 'one in two' · 'any predictor' 를
 *   갖고, 'counter' · 'doubles' · 'period' · 'length'(완제품 몫), 'alternating' · 'pair' ·
 *   'followed' · 'entry'(조각 몫)를 쓰지 않는다.
 *
 * 화면에는 카운터와 이력 표가 둘 다 있지만, 그것은 "어떤 예측기든" 을 두 표본으로 보인
 * 것이라 definition 이 그 이름을 부를 까닭이 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const unpredictableBranchConcept: FacetConceptSource = {
  id: 'unpredictableBranch',
  label: 'Unpredictable Branch (No Better Than a Coin)',
  canonicalFacet: 'facet:unpredictableBranch',

  surface: {
    definition:
      'A branch decided by chance, such as a comparison on random input, holds any predictor near one right guess in two, since nothing in earlier outcomes says anything about an independent next one.',
    exemplarKeywords: [
      'unpredictable branch',
      'data-dependent branch',
      'branch on random data',
      'coin flip branch',
      '50 percent prediction accuracy',
      'why sorting the array makes the loop faster',
      'branch misprediction on random input',
      'branchless code',
      'conditional move instead of a branch',
      'hard-to-predict branches',
      'entropy of branch outcomes',
    ],
  },

  briefing: {
    observable: [
      'The chart\'s horizontal axis is the branch number and its vertical axis the fraction guessed right so far, from 0 to 1, with a dashed line marked half across the middle.',
      'Two lines advance one point per branch — one for a 2-bit counter, one for a history table keyed by the last two outcomes — each with a name tag that follows its pen and reads its running score as right guesses over branches so far.',
      'Under the chart the outcome letter for each branch, T or N, appears as that branch lands.',
      'The two lines start at opposite extremes: on the first branch the counter misses and begins at 0 while the table hits and begins at 1.',
      'Early points swing widely because one guess moves the fraction a lot; as the branches accumulate each guess weighs less and both lines settle around the dashed half line.',
      'The caption at the top reports each branch — its outcome and what each predictor guessed — and the last one reads the totals: counter 8/16, history table 9/16, half is 8.',
    ],

    screen: {
      affordances: [
        'The screen plays all sixteen branches on its own and stops with both totals in the caption.',
        'A Replay button and a playback strip sit underneath. Dragging the strip back to the first few branches is how a reader can hold the moment the two lines are farthest apart, before they converge.',
        'The sixteen outcomes were drawn once by coin toss and fixed — eight taken, eight not taken — so an article can quote the two final scores exactly; the screen itself uses no randomness.',
      ],
    },

    useWhen: [
      'The article explains why a loop over unsorted data runs slower than the same loop over sorted data, and the reader needs to see that the processor\'s guessing, not the comparison, is what degrades.',
      'The reader assumes a smarter predictor will eventually learn anything. Two predictors that remember different things arriving at the same place is the evidence that the limit belongs to the branch, not the hardware.',
      'The text argues for removing a branch altogether — a conditional move, a lookup, arithmetic masking — and needs the justification that no amount of prediction can rescue it.',
      'The article has to convey why early results mislead: after the first branch one predictor stands at 0 and the other at 1, after three they still read 1/3 and 2/3, and only the accumulated line shows where it really sits.',
    ],

    avoidWhen: [
      'The article is about how a history table is sized or indexed. Both predictors here have fixed settings and are only scored.',
      'The subject is how a 2-bit counter moves between its states. Only its guesses are shown, not its internal state.',
      'The point is the cost of a misprediction in cycles or the pipeline flush that follows. The screen counts right guesses, not time.',
      'The article is about random number generation, hardware entropy sources, or statistics of coin tosses in themselves.',
      'The subject is speculative execution as a security issue, such as Spectre. Nothing here is about what a wrong guess leaks.',
    ],

    contrastWith: [
      {
        concept: 'branchHistoryTable',
        note: 'That one treats the amount of recorded past as a design choice with a best value for a regular branch; this one holds that when outcomes are independent every amount is equally useless, so the limit lies in the branch, not the predictor.',
      },
      {
        concept: 'patternFromHistory',
        note: 'Opposite ends of the same assumption: there each outcome is fixed by the two before it, here none is fixed by anything before it, and the same kind of memory goes from perfect to worthless.',
      },
      {
        concept: 'staticPrediction',
        note: 'A fixed guess that never learns already reaches about half on a coin-toss branch; this is the case where learning adds nothing over that baseline.',
      },
      {
        concept: 'mispredictionPenalty',
        note: 'That is the price of one wrong guess; this is how often the price is paid when guessing cannot improve, which together make a random branch expensive.',
      },
    ],
  },
};
