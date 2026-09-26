/**
 * rocImbalance 개념 선언.
 *
 * canonical facet 은 `facet:rocImbalance` — 양성 점수 열 개와 음성 점수 열 개. 손잡이 "Negatives ×" 가 음성 열을
 * ×1 · ×4 · ×10 으로 겹치고, 곁 손잡이 "Threshold" 가 0.7 · 0.5 · 0.3 을 고른다. 한 판 여섯 걸음 — 부름 · 비율 ·
 * AUC · 정밀도 · 정확도. 음성 배수를 올려도 곡선 · 문턱의 점 · AUC 75 % 는 제자리이고, 정밀도는 문턱 0.7 에서
 * 67 · 33 · 17 % 로 무너진다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `fourBoxes` 는 "틀림이 두 가지 칸으로 갈린다" 한 장면, `thresholdSlides` 는 "문턱을 내리면 두 비율이 함께 밀려
 * 오른다" 한 장면이다. 이쪽은 둘을 한 판에 잇고 **음성 수를 부풀렸을 때 어느 수가 버티고 어느 수가 무너지는가** 를
 * 맡는다. 주인공은 음성 배수이고 문턱은 곁 손잡이다. 그래서 definition 은 imbalance · multiplying negatives ·
 * unchanged · precision collapses 쪽 낱말을 쥐고, 조각들이 독점한 crosses · one step · never falls ·
 * missed · false alarm · two kinds 를 쓰지 않는다.
 *
 * 전제 (설명 글 `rocImbalance.md`):
 *  - 음성 더미는 음성 점수 열을 같은 점수로 겹친 것이다 — 분포는 그대로, 수만 는다. 실제 데이터에서는 음성이 늘면
 *    점수 모양도 조금씩 달라진다.
 *  - 점수 스무 개는 장난감 값이다. 백분율은 반올림 정수.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다 (`confusion` · `aucPercent`).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const rocImbalanceConcept: FacetConceptSource = {
  id: 'rocImbalance',
  label: 'ROC and AUC Under Class Imbalance (Unmoved Curve, Collapsing Precision)',
  canonicalFacet: 'facet:rocImbalance',

  surface: {
    definition:
      'Multiplying the negatives in an imbalanced dataset leaves the ROC curve, its operating point and the AUC unchanged, while precision collapses and accuracy drifts toward the rate on the majority class.',
    exemplarKeywords: [
      'class imbalance',
      'ROC curve',
      'AUC is misleading on imbalanced data',
      'ROC vs precision-recall curve',
      'precision drops when negatives increase',
      'confusion matrix',
      'accuracy paradox',
      'rare positive class',
      'roc_auc_score',
      'scikit-learn roc_curve',
      'fraud detection evaluation',
      'base rate',
    ],
  },

  briefing: {
    observable: [
      'Ten positives and ten negatives stand on a score line. With the "Negatives ×" handle at ×4 or ×10 the negative list is stacked that many times at the same scores: "Positives 10 · negatives 40 — the negative list ×4".',
      'A threshold line appears and every item scoring at or above it is called positive and falls into one of four cells — True positive, Missed, False alarm, True negative: "Called positive: score ≥ 0.7 — TP 4 · FN 6 · FP 2 · TN 8".',
      'The rates step writes "TPR = TP / P = 4 / 10 → 40 % · FPR = FP / N = 2 / 10 → 20 %" and places the curve and this threshold\'s point on an ROC plane (FPR across, TPR up). The next step fills the area under the curve: "AUC 75 % — area under the curve: the share of pairs where the positive scores higher".',
      'Precision and accuracy follow: "Precision = TP / (TP + FP) = 4 / 6 → 67 %", "Accuracy = (TP + TN) / all = 12 / 20 → 60 %". Four readouts — "False positives (FP)", "AUC %", "Precision %", "Accuracy %" — carry the round\'s values.',
      'Raising the negatives from ×1 to ×4 to ×10 at threshold 0.7 swells the false-alarm and true-negative cells by the same factor (FP 2, 8, 20), yet FPR stays 20 %, TPR stays 40 %, and the new point lands exactly on the faint ring left by the previous round. The curve and AUC 75 % do not move. Precision falls 67 → 33 → 17 %.',
      'Accuracy is pulled toward the negative-side hit rate: at threshold 0.7 it rises 60 → 72 → 76 %, at 0.3 it falls 65 → 50 → 45 %. At 0.5 and 0.3 precision also falls, 64 → 30 → 15 % and 60 → 27 → 13 %.',
      'Moving the threshold slides the point along the unchanged curve: (FPR, TPR) = (20, 40), (40, 70), (60, 90) % at 0.7, 0.5, 0.3.',
      'The larger negative piles are copies of the same ten scores, so the score distribution stays fixed while only the count grows; real data would shift a little as negatives accumulate. The twenty scores are toy values and all percentages are rounded to whole numbers. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Negatives ×" (×1, ×4, ×10, starting at ×1) and "Threshold" (0.7, 0.5, 0.3, starting at 0.7). Each round plays its six steps and waits for a handle.',
        'The move that makes the idea land is stepping "Negatives ×" upward at a fixed threshold: the ROC point settles on its own old ring while the precision readout sinks. The threshold handle is secondary; it moves the point along the curve.',
        'The code panel, labelled "Counting the four cells", starts empty with a "+ Add language" button; the chosen language shows `confusion` (counts the four cells and returns precision) and `aucPercent` (pair counting), highlighting the lines of the current step. The same meaning is carried across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article warns that a high AUC says little about how trustworthy positive calls are once negatives vastly outnumber positives, and needs an ROC point that stays put while precision drops from 67 % to 17 %.',
      'A reader wonders why accuracy looks good on a rare-positive problem; the screen shows accuracy drifting with the negative count, up at one threshold and down at another.',
    ],

    avoidWhen: [
      'The article is about fixing imbalance by resampling, class weights or SMOTE. The data are only multiplied here; nothing is rebalanced.',
      'The subject is choosing the best threshold or a cost-sensitive decision rule. Only three thresholds are offered and no costs are attached.',
      'The article needs a precision-recall curve drawn. Precision appears as a single readout per round, not as a curve.',
    ],

    contrastWith: [
      {
        concept: 'fourBoxes',
        note: 'The four outcome cells are the raw counts. Which ratios of those counts hold still and which collapse when one class grows is a claim about metrics built on them.',
      },
      {
        concept: 'thresholdSlides',
        note: 'Lowering the threshold is how the ROC curve is traced for a fixed dataset. Changing the class ratio leaves that trace unchanged, which is exactly why it cannot reveal the damage to precision.',
      },
      {
        concept: 'logisticRegression',
        note: 'A probabilistic classifier leaves the cut-off to the user and trades misses for false alarms. That trade is judged differently depending on how rare positives are, which the ROC curve alone does not register.',
      },
    ],
  },
};
