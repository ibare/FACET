/**
 * stopBeforeTurn 개념 선언.
 *
 * canonical facet 은 `facet:stopBeforeTurn` — 무게 둘 선형 모형을 배치 경사 하강(η 0.3)으로 에폭마다 한 번 갱신하며
 * 검증 손실을 잰다. 에폭 4 의 0.033 이 가장 좋고, 에폭 5 · 6 · 7 에서 나아지지 않아 기다림이 1 · 2 · 3 으로 차면
 * 에폭 7 에서 멈추고 쓰는 무게를 에폭 4 의 (0.760, 0.429) 로 되돌린다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `earlyStopping` 이 흔들리는 곡선 위에서 참을성을 돌리는 대비를 맡으므로, 이쪽은 규칙 한 벌의 동사 —
 * **가장 좋던 자리를 기억하고, 못 넘은 에폭을 세고, 차면 멈추고, 그 자리로 돌아간다** — 만 쥔다. definition 은
 * remembers · counts · halts · rolls back · checkpoint 를 독점하고, 완제품의 noisy · too little · train longer 를 쓰지 않는다.
 * 이웃 조각 `trainDownValUp` 과는 가로축이 에폭(학습 시간)이라는 점, 그리고 현상이 아니라 규칙이라는 점으로 갈린다.
 *
 * 전제 (설명 글 `stopBeforeTurn.md`): 모형 y = w1·x1 + w2·x2(치우침 없음) · 시작 (0, 0) · 훈련 넷 · 검증 다섯은 규칙이 한
 * 화면에 드러나도록 고른 장난감 자료. 세로축은 로그 눈금이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const stopBeforeTurnConcept: FacetConceptSource = {
  id: 'stopBeforeTurn',
  label: 'The Early Stopping Rule: Track the Best Epoch, Wait, Roll Back',
  canonicalFacet: 'facet:stopBeforeTurn',

  surface: {
    definition:
      'The early stopping rule remembers the epoch with lowest validation loss, counts later epochs that fail to beat it, halts when that count equals the patience, and rolls back to the best checkpoint.',
    exemplarKeywords: [
      'early stopping algorithm',
      'best checkpoint',
      'patience counter',
      'epochs without improvement',
      'restore best weights',
      'when to stop training',
      'validation loss starts rising',
      'model checkpointing',
      'stopping criterion',
    ],
  },

  briefing: {
    observable: [
      'A plot of "Validation loss (log scale)" over "Epoch" 0 to 7, with two weight readouts w1 · w2 beside it. Epoch 0 is the weights before any update, (0, 0), with validation loss 0.335.',
      'Epochs 1 to 4 each improve — 0.156, 0.074, 0.041, 0.033 — and a "Best" marker follows the curve down. Captions read "Epoch 3: validation loss 0.041 < best 0.074. The marker follows; waiting resets."',
      'At epoch 5 the loss rises to 0.037. The marker stays at epoch 4 and a "Waiting" row starts filling: "Epoch 5: validation loss 0.037 ≥ best 0.033. Waited: 1 / 3", then 0.047 (2 / 3) and 0.059 (3 / 3).',
      'At epoch 7 the caption adds "patience is used up, training stops" and a "Stopped" mark appears. On the final step the "In use" weights travel back along the curve: "Weights in use go back: epoch 7 → epoch 4. w = 0.760 · 0.429, validation loss: 0.033", from w = (0.918, 0.673).',
      'The stopped epoch minus the best epoch equals the patience, 3. The rule stops because the count filled, not because it has seen the loss keep rising.',
      'The model is y = w1·x1 + w2·x2 without bias, starting at (0, 0), with one full-batch gradient step (η 0.3) per epoch on four training points and validation loss averaged over five points; the data is chosen so the rule plays out on one screen. The log scale is there because the rise after epoch 4 is small. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one epoch per step, then one restore step: nine steps in all, ending on the rolled-back weights.',
        'A Replay button and a playback strip sit below it. Dragging back to epoch 5 holds the first step where the marker refuses to move and the first waiting cell fills.',
        'Data, η and patience 3 are fixed, so every loss value and both weight pairs can be quoted to three decimals.',
      ],
    },

    useWhen: [
      'The article introduces early stopping and needs its three moving parts — the best-so-far marker, the waiting count, the roll-back — shown in order on one run.',
      'A reader thinks early stopping keeps the weights from the epoch where training halted; the final step moving the weights from epoch 7 back to epoch 4 corrects that.',
      'The article explains why "strictly lower" matters in the improvement test and wants a caption that prints the ≥ comparison each epoch.',
    ],

    avoidWhen: [
      'The article is about tuning the patience value or about noisy validation curves. Patience is fixed at 3 and the curve here turns once, cleanly.',
      'The subject is overfitting as model complexity grows. The horizontal axis is epochs of one fixed model.',
      'The point is the training loss continuing to fall while validation rises. Only validation loss is drawn.',
    ],

    contrastWith: [
      {
        concept: 'earlyStopping',
        note: 'The rule itself is simple bookkeeping; its behaviour becomes a trade-off once the validation curve has temporary rises and the patience decides whether they end training.',
      },
      {
        concept: 'trainDownValUp',
        note: 'A validation curve that turns upward is the phenomenon; stopping is a procedure that reacts to it along training time, and it acts on the count of bad epochs rather than on the shape of the curve.',
      },
      {
        concept: 'holdOutSome',
        note: 'Early stopping depends on a held-out validation set to watch; holding data out is the prior decision that makes any such watching possible.',
      },
    ],
  },
};
