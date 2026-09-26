/**
 * fourBoxes 개념 선언.
 *
 * canonical facet 은 `facet:fourBoxes` — 항목 열둘이 차례로 "Actual?" 과 "Predicted?" 두 갈림을 거쳐 네 칸
 * (TP · FN · FP · TN) 가운데 하나에 떨어진다. 끝에 TP 4 · FN 2 · FP 1 · TN 5, 맞음 9 · 틀림 3 (FP 1 + FN 2),
 * 정확도 0.75.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `rocImbalance` 는 네 칸에서 나온 비율들이 음성 수를 따라 버티거나 무너지는 것을, 형제 `thresholdSlides` 는
 * 문턱을 내릴 때 두 비율이 오르는 것을 말한다. 이쪽은 점수도 문턱도 없이 **"틀렸다" 가 두 가지로 갈린다** 는
 * 한 질문이다. 그래서 definition 은 actual · predicted · four cells · missed · false alarm · one accuracy
 * merges 쪽 낱말을 쥐고, threshold · rate · curve · imbalance 는 쓰지 않는다.
 *
 * 전제 (설명 글 `fourBoxes.md`): 항목과 예측은 네 칸의 수가 서로 다르게 나오도록 고른 장난감 값이다.
 * 예측은 이미 매겨진 것으로 둔다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const fourBoxesConcept: FacetConceptSource = {
  id: 'fourBoxes',
  label: 'Confusion Matrix Cells (Two Kinds of Wrong)',
  canonicalFacet: 'facet:fourBoxes',

  surface: {
    definition:
      'Splitting each prediction by its actual class and then by its predicted class gives four cells, so wrong answers divide into missed positives and false alarms that a single accuracy figure merges.',
    exemplarKeywords: [
      'confusion matrix',
      'true positive false positive true negative false negative',
      'TP FP TN FN',
      'type I and type II errors',
      'false alarm vs miss',
      'false negative in medical diagnosis',
      'why accuracy is not enough',
      'binary classification outcomes',
      'confusion_matrix',
    ],
  },

  briefing: {
    observable: [
      'Twelve items, m1 to m12, wait in a row ("Items waiting: 12") above a fork. The first question is "Actual?" (positive or negative), and each side then splits again on "Predicted?".',
      'The four ends are boxes with counts starting at 0: "TP · true positive", "FN · miss", "FP · false alarm", "TN · true negative".',
      'One item drops per step and exactly one box grows by one: "m3 — actual: negative · predicted: positive → FP · false alarm", "m4 — actual: positive · predicted: negative → FN · miss".',
      'After the twelfth item the boxes read TP 4, FN 2, FP 1, TN 5, and the caption sums them: "Right: 9 (TP + TN) · Wrong: 3 (FP: 1 + FN: 2) · Accuracy: 0.75".',
      'The three wrong answers do not sit in one pile: two are misses and one is a false alarm, in different boxes, and the one accuracy figure folds them together.',
      'The predictions are given, with no scores and no threshold, and the twelve items are toy values chosen so that the four counts all differ. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays itself once, one item per step for thirteen steps including the empty start, and stops.',
        'A Replay button and a playback strip sit below it. Dragging the strip to the step where m3 or m4 drops holds the moment a wrong answer goes into its own box.',
        'The items and predictions are fixed, so an article can name the item that became the single false alarm.',
      ],
    },

    useWhen: [
      'The article insists that "the model was wrong" hides two different mistakes — a positive called negative and a negative called positive — and needs them landing in separate boxes.',
      'A reader is meeting the confusion matrix for the first time and needs to see where each of TP, FN, FP and TN comes from, item by item, before any rate is defined.',
    ],

    avoidWhen: [
      'The article is about ROC curves, thresholds or precision and recall as rates. Nothing here has a score or a threshold, and only accuracy is computed.',
      'The subject is multi-class confusion matrices. There are two classes and four boxes.',
      'The reader is meant to change the predictions and watch items move between boxes. The predictions are fixed.',
    ],

    contrastWith: [
      {
        concept: 'thresholdSlides',
        note: 'The four outcomes exist once predictions are fixed. A score threshold is one way those predictions are made, and moving it is what shifts items from one outcome to another.',
      },
      {
        concept: 'rocImbalance',
        note: 'The cells are counts. Rates built from them divide by different totals, and that choice decides which rates hold steady when one class becomes much larger.',
      },
      {
        concept: 'logisticRegression',
        note: 'A trained classifier produces the predictions; the four outcomes are how any set of binary predictions is scored against the truth, whatever produced it.',
      },
    ],
  },
};
