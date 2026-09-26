/**
 * rotateTheFold 개념 선언.
 *
 * canonical facet 은 `facet:rotateTheFold` — 항목 열(부류마다 다섯)이 폴드 다섯에 둘씩 앉아 있고, 시험지 자리가
 * 폴드 1 에서 5 로 한 칸씩 돈다. 자리마다 나머지 여덟으로 가름점(부류 평균의 가운데)을 새로 배우고 — 5.25 · 4.60 ·
 * 5.40 · 4.70 · 5.10 — 시험지 둘을 가린다. 폴드별 맞힘 2 · 1 · 1 · 2 · 2, 합 8/10, 평균 정확도 0.80,
 * 항목마다 시험지에 앉은 횟수는 가장 적게도 가장 많게도 1.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `crossValidation` 은 섞음 여덟 · 나누기 다섯에서 점수가 얼마나 흩어지는지를 본다. 이쪽은 섞음 하나 ·
 * 폴드 다섯 한 판에서 **시험지 역할이 돌아가는 차례와 그 결과 모두가 정확히 한 번씩 재인다** 는 한 동사다.
 * 그래서 definition 은 takes a turn · retrained on the rest · exactly once · pooled 쪽 낱말을 쥐고,
 * spread · reshuffle · cost 는 쓰지 않는다. 형제 `holdOutSome` 의 fitted to · never seen · MSE 도 쓰지 않는다.
 *
 * 전제 (설명 글 `rotateTheFold.md`):
 *  - 항목 열은 장난감 자료다. 폴드 배정도 섞어 나눈 결과를 값으로 적어 두어, 다시 돌려도 같은 폴드가 나온다.
 *  - 모형은 두 부류 x 평균의 가운데 하나다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const rotateTheFoldConcept: FacetConceptSource = {
  id: 'rotateTheFold',
  label: 'Rotating the Test Fold (Every Item Tested Exactly Once)',
  canonicalFacet: 'facet:rotateTheFold',

  surface: {
    definition:
      'In k-fold cross-validation each fold takes one turn as the test set while the model is retrained on the rest, so every item is tested exactly once and the per-fold results are pooled.',
    exemplarKeywords: [
      'k-fold cross-validation step by step',
      'how does k-fold work',
      'each fold used once as validation',
      'retrain on the remaining folds',
      'average accuracy over folds',
      'KFold split',
      'every sample gets tested',
      '5-fold cross-validation',
      'validation fold rotation',
    ],
  },

  briefing: {
    observable: [
      'Ten items, five of Class 0 and five of Class 1, sit in five folds of two. At the start all five folds are on the "Learning" side and the "Test seat" is empty: "Items: 10 · number of folds: 5. The test seat is empty."',
      'Each step moves the test seat one fold along, from Fold 1 to Fold 5, and the fold that leaves the seat goes back to learning. The model learns a new split from the other eight items — the midpoint between the two class means — shown on the x axis as "Split: 5.25", then 4.60, 5.40, 4.70, 5.10. A "Splits so far" trail keeps the earlier ones.',
      'The two items on the test seat are marked right or wrong and the fold\'s count is written under it: "Correct on the test seat: 2/2", then 1/2, 1/2, 2/2, 2/2.',
      'The last step adds them up: "Total correct: 8/10 · mean accuracy: 0.80", and "Times on the test seat per item — fewest: 1 · most: 1" — every item was tested once and none twice.',
      'Taken alone, a single fold would have reported 1/2 or 2/2 depending on which one it was; the rotation replaces that one number with a total over all ten items.',
      'The items are a toy set and the fold assignment is written into the data as the result of a shuffle, so every run uses the same folds. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays itself once, seven steps from the empty test seat to the total, and stops.',
        'A Replay button and a playback strip sit below it. Dragging the strip across steps 1 to 5 shows the split moving each time a different fold is withheld.',
        'The items, folds and model are fixed, so an article can name the fold that scored 1/2 and the split learned without it.',
      ],
    },

    useWhen: [
      'A reader has heard "k-fold" but not how it runs, and the article wants the test role handed from fold to fold, a fresh model learned each time, and the tally that every item was tested exactly once.',
      'The article claims cross-validation wastes no data for testing, and needs a count showing no item left untested and none counted twice.',
    ],

    avoidWhen: [
      'The article is about how much cross-validated scores vary between reshuffles or how many folds to choose. There is one shuffle and one fold count here.',
      'The subject is the final model trained on all the data after validation. No model is trained on all ten items here.',
      'The model is expected to be a neural network or anything with training epochs. Each fit here is one closed-form midpoint.',
    ],

    contrastWith: [
      {
        concept: 'crossValidation',
        note: 'Rotating the test role is the procedure itself. Whether more folds make the estimate steadier, and what extra fits that costs, is a claim about the procedure\'s results over many shuffles.',
      },
      {
        concept: 'holdOutSome',
        note: 'A one-time hold-out tests a fixed few and never the rest. Rotation keeps the rule that tested items are left out of learning, but applies it to each fold in turn.',
      },
      {
        concept: 'decisionBoundary',
        note: 'A decision boundary is where one trained model changes its answer. Here that boundary is relearned for every fold, and its movement is a by-product of which items were withheld.',
      },
    ],
  },
};
