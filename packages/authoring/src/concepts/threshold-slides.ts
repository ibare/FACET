/**
 * thresholdSlides 개념 선언.
 *
 * canonical facet 은 `facet:thresholdSlides` — 항목 열(참 양성 다섯 · 참 음성 다섯)에 점수가 매겨져 있고, 문턱이
 * 서로 다른 점수 아홉을 큰 것부터 하나씩 밟는다. 넘은 항목이 참 양성이면 TPR 이, 참 음성이면 FPR 이 오르고,
 * 같은 점수 0.64 의 e · f 는 한 걸음에 함께 넘어 점이 비스듬히 밀린다. 자취가 계단 꼴 곡선으로 남는다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `rocImbalance` 는 음성 수를 부풀려도 곡선은 버티고 정밀도가 무너진다는 대비를, 형제 `fourBoxes` 는 점수도
 * 문턱도 없이 틀림이 두 칸으로 갈린다는 것을 말한다. 이쪽은 **문턱을 내리는 한 동작이 두 비율을 어떻게 밀어
 * 올리는가** 하나다. 그래서 definition 은 lowering · crosses · one step · never falls · staircase 쪽 낱말을
 * 쥐고, imbalance · precision · AUC 는 쓰지 않는다 (화면에 AUC 표시도 없다).
 *
 * 전제 (설명 글 `thresholdSlides.md`): 항목 열과 점수는 장난감 값이다. 점수 ≥ 문턱이면 양성이라 부르고,
 * 동률은 쪼개지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const thresholdSlidesConcept: FacetConceptSource = {
  id: 'thresholdSlides',
  label: 'Lowering the Score Threshold (TPR and FPR Rise Together)',
  canonicalFacet: 'facet:thresholdSlides',

  surface: {
    definition:
      'Lowering a score threshold one score at a time: each item that crosses raises the true positive rate or the false positive rate, neither ever falls, and the path traced is a staircase.',
    exemplarKeywords: [
      'decision threshold',
      'lowering the classification threshold',
      'true positive rate vs false positive rate',
      'sensitivity vs specificity trade-off',
      'how the ROC curve is drawn',
      'recall goes up but so do false positives',
      'tied scores in ROC',
      'operating point',
      'predict_proba threshold',
    ],
  },

  briefing: {
    observable: [
      'Ten items, a to j, sit on a score line from 0.93 down to 0.17, coloured by "True class:" — five "Truly positive", five "Truly negative". Two lanes read "Called negative" and "Called positive". At the start the threshold is above every score: "Nothing is called positive yet."',
      'On the right is a plane with "False positive rate (FPR) →" across and "True positive rate (TPR) ↑" up, both from 0.00 to 1.00, with readouts "TPR = TP / P = … " and "FPR = FP / N = …".',
      'Each step lowers the threshold to the next distinct score and the items there cross into "Called positive": "Threshold: 0.93 · Crossed: a · Only true positives crossed: TPR rises, FPR stays." When c crosses at 0.78 the caption turns to "Only true negatives crossed: FPR rises, TPR stays."',
      'Items e and f share the score 0.64 and cross together: "They share a score and cross together: TPR and FPR rise in one step." — the point moves diagonally, up and right at once.',
      'Because the threshold only goes down, no item ever crosses back and neither rate ever decreases. The trail left on the plane is the ROC curve as a staircase, each riser made by a true positive and each tread by a true negative.',
      'At the lowest score, 0.17, "The threshold is at the lowest score: every item is called positive." and both rates reach 1.00. Nine thresholds plus the starting frame make ten steps.',
      'The ten items and their scores are toy values chosen for the demonstration. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays itself once, stepping the threshold down through every distinct score, and stops.',
        'A Replay button and a playback strip sit below it. Dragging the strip back to the 0.64 step holds the one diagonal move where two items cross together.',
        'The scores and true classes are fixed, so an article can name each item and the rate it pushed.',
      ],
    },

    useWhen: [
      'A reader thinks lowering the threshold simply catches more positives, and the article needs the same move shown dragging true negatives across as well, so both rates climb.',
      'The article explains where an ROC curve comes from and wants it built step by step from one threshold sweep, including what a tie in scores does to the curve.',
    ],

    avoidWhen: [
      'The article is about how class imbalance affects ROC, AUC or precision. The class ratio is fixed at five and five here, and no precision is shown.',
      'The subject is how the classifier produced its scores. The scores are given; no model is trained.',
      'The reader is meant to pick an optimal threshold. The threshold sweeps through every score by itself and no value is recommended.',
    ],

    contrastWith: [
      {
        concept: 'rocImbalance',
        note: 'Sweeping the threshold builds the curve for one dataset. That the curve survives a change in the class ratio while precision does not is a separate claim about what the curve can and cannot report.',
      },
      {
        concept: 'fourBoxes',
        note: 'Sorting fixed predictions into four cells needs no scores. Moving the threshold is what shifts items between those cells, turning misses into hits and true negatives into false alarms.',
      },
      {
        concept: 'logisticRegression',
        note: 'Learning a probability and then choosing a cut-off is a whole classifier. Sliding the cut-off across given scores isolates just the trade in rates that the choice implies.',
      },
      {
        concept: 'decisionBoundary',
        note: 'A decision boundary is where one fixed cut-off falls in the input space. Here the cut-off is on the score axis and it is the cut-off itself that moves.',
      },
    ],
  },
};
