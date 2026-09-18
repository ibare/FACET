/**
 * mispredictionPenalty 개념 선언.
 *
 * canonical facet 은 `facet:mispredictionPenalty` — 분기 열두 개를 언제나 T 로 짐작하며
 * 판정이 3 단계째에 나는 얕은 파이프라인과 10 단계째에 나는 깊은 파이프라인에 똑같이
 * 흘린다. 틀린 짐작 둘마다 판정 단계 − 1 개(2 와 9)를 버리고, 버린 박자가 파이프라인별
 * 더미에 쌓인다. 끝에서 얕은 쪽 16 사이클, 깊은 쪽 30 사이클. 손잡이는 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 마주 보는 짝으로 갈랐다. staticPrediction 은 틀림 한 번의 값을 고정하고 틀림의 수를
 * 바꾸며, 이쪽은 틀림의 수를 고정하고 한 번의 값을 바꾼다. definition 에서 규칙 어휘
 * (`rule` · `fixed` · `compared`) 와 방향 어휘 (`target` · `lower address` · `loop`) 를
 * 쓰지 않고, `wastes` · `fetched behind` · `misses` · `deeper pipeline` 을 독점한다.
 *
 * ── 이웃 묶음과
 *
 * controlHazard · branchFlush 가 가장 붙는다 (같이 "판정이 늦으면 버리는 것이 많다").
 * 그쪽은 파이프라인 칸 안에서 무엇이 비워지는가를 말하고, 이쪽은 그것을 박자 셈으로 바꿔
 * 깊이에 대한 값으로 말한다. 그래서 definition 에 `flush` · `hazard` 를 쓰지 않고,
 * controlHazard definition 의 `stage` · `decides` · `taken branch` · `cost` 도 피했다 —
 * 저쪽은 탄 분기마다 치르는 단계 수, 이쪽은 틀린 짐작이 한 판 동안 깊이에 비례해 쌓는 낭비다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const mispredictionPenaltyConcept: FacetConceptSource = {
  id: 'mispredictionPenalty',
  label: 'Branch Misprediction Penalty (Cycles Lost per Wrong Guess)',
  canonicalFacet: 'facet:mispredictionPenalty',

  surface: {
    definition:
      'A wrong branch guess wastes every cycle spent on instructions fetched behind it until the outcome is known, so the same number of misses drains far more cycles from a deeper pipeline.',
    exemplarKeywords: [
      'branch misprediction penalty',
      'cost of a mispredicted branch',
      'wasted cycles',
      'cycles lost per miss',
      'deep pipeline',
      'pipeline depth versus prediction accuracy',
      'why long pipelines need good branch predictors',
      'Pentium 4 pipeline',
      'resolve stage',
      'penalty equals stages before resolution',
      'misprediction cost adds up',
    ],
  },

  briefing: {
    observable: [
      'Two pipelines are drawn with only the cells up to the stage where a branch is decided: three cells for the shallow one, ten for the deep one, so the length is the lateness.',
      'Above them a row of twelve guesses, all T, is paired with a row of actual outcomes; two of the twelve are N.',
      'Each branch slides in from the left with the work fetched behind it in a single file until the branch stands in the deciding cell.',
      'On a correct guess nothing leaves the pipelines. On a wrong one the cells behind the branch drop out and fall onto a pile on the right: two from the shallow pipeline, nine from the deep one.',
      'The piles are scaled from the start to the height they will reach, 4 wasted for the shallow pipeline and 18 for the deep one, from the same two wrong guesses.',
      'The closing captions give the totals: the shallow pipeline takes 16 cycles for the twelve branches and the deep one 30.',
    ],

    screen: {
      affordances: [
        'The screen plays all twelve branches and the totals on its own and then stops.',
        'A Replay button and a playback strip sit underneath; dragging the strip to one of the two wrong guesses is how a reader can hold the moment the discarded cells fall from both pipelines at once.',
        'The outcomes, the constant guess and the two deciding stages are fixed, so an article can quote the per-miss costs of 2 and 9 and the totals.',
      ],
    },

    useWhen: [
      'The article argues that a longer pipeline raises the stakes of every wrong guess, and the reader should see the same two misses cost four cycles in one design and eighteen in another.',
      'The prose gives the formula for the cost of a miss — the number of stages before the branch is decided — and the reader needs to see where each of those cycles comes from.',
      'The article motivates spending hardware on better prediction, and the reader has to feel that a small miss rate still adds up once each miss is multiplied by the depth.',
    ],

    avoidWhen: [
      'The subject is how to guess better — which rule or predictor to use. The guess here is one constant and never changes.',
      'The article walks through the pipeline stages one instruction at a time or explains what each stage does. The stages are unnamed cells here.',
      'The subject is stalls caused by data dependencies between instructions, or forwarding.',
      'The article uses "penalty" for a cache miss, a page fault, or a loss term in machine learning.',
    ],

    contrastWith: [
      {
        concept: 'staticPrediction',
        note: 'This claims the harm of a miss grows with how late the pipeline learns the outcome; the other claims the choice of guess decides how many misses occur and on which branches.',
      },
      {
        concept: 'controlHazard',
        note: 'The hazard is that the pipeline must fetch before a branch is decided; the penalty is what that costs in cycles when the fetch went the wrong way, summed over a run.',
      },
      {
        concept: 'branchFlush',
        note: 'Discarding the wrongly fetched instructions is the mechanism; the penalty is its price, counted as cycles and compared across pipeline depths.',
      },
      {
        concept: 'unpredictableBranch',
        note: 'That concerns why some misses cannot be avoided by any predictor; this concerns what each of those unavoidable misses costs.',
      },
    ],
  },
};
