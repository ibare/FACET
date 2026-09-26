/**
 * crossValidation 개념 선언.
 *
 * canonical facet 은 `facet:crossValidation` — 항목 스물(x 하나 · 부류 둘)과 값으로 정한 섞음 여덟을 두고,
 * 손잡이 "Split" 이 한 번 떼기 · 폴드 2 · 5 · 10 · 20 을 고른다. 섞음마다 점수 한 점이 띠에 떨어지고,
 * 판 끝에 가장 낮음 ~ 가장 높음 막대가 선다. 폭은 50 · 15 · 5 · 0 · 0, 섞음마다 배운 횟수는 1 · 2 · 5 · 10 · 20.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `holdOutSome` 은 "맞춘 자료가 아니라 떼어 둔 자료로 잰다" 한 장면, `rotateTheFold` 는 "시험지 자리가 돌아
 * 모두가 한 번씩 시험지가 된다" 한 장면이다. 이쪽은 그 둘을 전제로 삼고 **나누는 법을 돌렸을 때 점수가 섞음마다
 * 얼마나 흩어지는가와 그 값(배운 횟수)** 을 맡는다. 그래서 definition 은 spread · reshuffle · number of folds ·
 * cost in fits 쪽 낱말을 쥐고, 조각들이 독점한 fitted to · never seen · exactly once · takes a turn 을 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `crossValidation.md` 가 밝힌 것):
 *  - 장난감 자료다. 항목 스물은 x 하나와 부류 하나뿐이고, 모형은 두 부류 x 평균의 가운데(가름점) 하나다.
 *  - 섞은 차례 여덟은 값으로 정해 두었다. 손잡이를 바꿔도 같은 여덟을 다시 쓴다.
 *  - 한 번 떼기는 폴드 다섯으로 나눠 첫 폴드 하나만 시험지로 쓴 것으로 본다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다 (`scorePercent` · `scoreSpread`).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const crossValidationConcept: FacetConceptSource = {
  id: 'crossValidation',
  label: 'Hold-out vs k-Fold Cross-Validation (Score Spread Across Reshuffles)',
  canonicalFacet: 'facet:crossValidation',

  surface: {
    definition:
      'How much a validation score swings with the random split: one hold-out set scores reshuffled data anywhere from 50 to 100 percent, while more folds pull the scores together at the price of more training runs.',
    exemplarKeywords: [
      'k-fold cross-validation',
      'hold-out validation vs cross-validation',
      'train/validation split',
      'variance of the validation estimate',
      'lucky split',
      'how many folds should I use',
      '5-fold vs 10-fold',
      'leave-one-out cross-validation',
      'cross_val_score',
      'scikit-learn KFold',
      'repeated cross-validation',
      'computational cost of cross-validation',
    ],
  },

  briefing: {
    observable: [
      'Twenty items stand on an x axis, ten of Class 0 and ten of Class 1, above twenty seats grouped into folds. The model is the simplest possible one: the midpoint between the two class means of x on the learning side, calling an item Class 1 when its x lies above that cut.',
      'A round walks through eight fixed shuffles. For the first shuffle the items take their seats in shuffled order, then a cut is learned for each fold used as the test fold from the other items — shown as ticks on a "Cut of each test fold, on x" line, never as numbers — then each test item is marked right or "Called wrong" and the shuffle\'s score drops as a dot onto a "Score of each shuffle (%)" strip. Shuffles 2 to 8 each take one step; equal scores stack.',
      'The round ends with a bar from lowest to highest and a line such as "Lowest: 50 % · Highest: 100 % · Width: 50". With "Hold out once" the eight scores are 100 100 100 100 50 50 75 75 — width 50. With 2 folds they run 70 to 85 (width 15), with 5 folds 80 to 85 (width 5), and with 10 or 20 folds all eight are 80 (width 0).',
      'Three readouts sit with the controls: "Fits per shuffle" (1, 2, 5, 10, 20 for the five settings), "Lowest score" and "Highest score". Moving to more folds narrows the spread and multiplies the fits.',
      'Hold-out scores only four items, so one item moves the score by 25 points. With 2 or more folds every one of the twenty items sits on the test fold once per shuffle. With 20 folds (leave-one-out) the split no longer depends on the shuffle, which is why all eight scores coincide.',
      'The only items ever called wrong are the six near the boundary (x 4.1, 4.4, 4.6, 5.1, 5.3, 5.7), whatever the shuffle or the split.',
      'The data are a toy set of twenty values with one feature, and the eight shuffles are fixed values rather than drawn at random, so changing the split reuses the same eight. "Hold out once" is taken as five folds with only the first one used for testing. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: a five-position "Split" slider — "Hold out once", "2 folds", "5 folds", "10 folds", "20 folds" — starting at "Hold out once". Each round plays all eight shuffles and then waits for the handle.',
        'On a change of split the seats regroup into the new number of folds and the previous round\'s dots stay behind as hollow circles; a shuffle whose score changes is seen moving from its old place to its new one. Stepping from "Hold out once" to "5 folds" is the move that shows the cloud of scores closing in on 80.',
        'The code panel, labelled "Code", starts empty with a "+ Add language" button; the chosen language shows `scorePercent` (one shuffle\'s score for a given number of folds) and `scoreSpread` (highest minus lowest) and highlights the lines of the current phase. The same meaning is carried across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article argues that a single train/validation split can make a model look far better or worse than it is depending on which items landed in the validation set, and wants eight reshuffles of the same data scored side by side.',
      'A reader is deciding how many folds to use and needs to see both sides of the trade: the scores tighten from a width of 50 to 0 while the number of fits per shuffle climbs from 1 to 20.',
    ],

    avoidWhen: [
      'The article is about hyperparameter search with nested cross-validation or about picking a model by its CV score. The model here has nothing to tune.',
      'The subject is stratified, grouped or time-series splits. Seats are filled purely by the shuffled order, with no attention to class balance or time.',
      'The point is the gap between error on the fitted data and error on unseen data. Every score here is already measured on items outside the learning side.',
    ],

    contrastWith: [
      {
        concept: 'holdOutSome',
        note: 'Setting data aside before fitting is the premise; asking how much the resulting score depends on which data were set aside, and what it costs to average that dependence away, is the next question.',
      },
      {
        concept: 'rotateTheFold',
        note: 'Rotating the test role through the folds is the mechanism for one shuffle. Comparing fold counts across many shuffles is about how stable the resulting estimate is and how many fits it takes.',
      },
      {
        concept: 'trainDownValUp',
        note: 'A validation curve tracks one held-out score as training goes on. Cross-validation asks how far that held-out score itself would move had different items been held out.',
      },
      {
        concept: 'overfitting',
        note: 'Overfitting is what a validation score is meant to catch; how trustworthy that score is, given one split or many, is a separate question about the measurement.',
      },
    ],
  },
};
