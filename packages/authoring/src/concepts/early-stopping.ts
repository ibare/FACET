/**
 * earlyStopping 개념 선언.
 *
 * canonical facet 은 `facet:earlyStopping` — 특징 여덟 선형 모형을 훈련 열 점 위에서 한 점씩 SGD 로 배우며 에폭마다
 * 검증 스무 점의 손실을 잰다. 검증 곡선은 에폭 6 · 8 · 10 에서 한 번씩 오르며 내려가 에폭 14 의 0.440 이 바닥이다.
 * 손잡이 하나 — 참을성(1 · 2 · 3 · 5 · 8) — 를 돌리면 멈춘 에폭 6 · 11 · 17 · 19 · 22, 되돌아간 에폭 5 · 9 · 14 · 14 · 14.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 하나)
 *
 * 조각 `stopBeforeTurn` 은 규칙 자체 — 가장 좋던 에폭 기억 · 기다림 셈 · 되돌림 — 을 곧게 내려가다 오르는 곡선 하나에서
 * 보인다. 이쪽은 **흔들리는 곡선 위에서 참을성을 돌리는 대비**를 맡는다: 작으면 일시적 오름에 속아 이른 멈춤, 크면 같은
 * 바닥을 더 늦게. 그래서 definition 은 patience · noisy · premature · same minimum · longer 를 쥐고, 조각의
 * remembers · counts · restores · checkpoint 를 쓰지 않는다.
 *
 * 전제 (설명 글 `earlyStopping.md`):
 *  - 자료는 장난감이다. 특징 다섯은 참 무게가 0 이라 잡음을 외우는 자리다. 에폭마다 훈련 점을 도는 차례는 값으로 정해 두어
 *    참을성을 바꿔도 검증 곡선이 같다.
 *  - 나아짐은 엄격히 작을 때만. 이 자료에서 동률은 없다(가장 가까운 차 0.0027).
 *  - 코드 패널은 IR 셋(`earlyStop` · `sgdEpoch` · `valLoss`)을 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const earlyStoppingConcept: FacetConceptSource = {
  id: 'earlyStopping',
  label: 'Early Stopping: Choosing the Patience',
  canonicalFacet: 'facet:earlyStopping',

  surface: {
    definition:
      'Setting early-stopping patience on a noisy validation curve: too little patience quits at a temporary bump and keeps worse weights, while larger values reach the same minimum but train longer.',
    exemplarKeywords: [
      'early stopping patience',
      'Keras EarlyStopping callback',
      'restore_best_weights',
      'noisy validation loss',
      'stopped too early',
      'how many epochs to wait',
      'validation plateau',
      'training budget vs model quality',
      'min_delta',
      'regularization by stopping training',
    ],
  },

  briefing: {
    observable: [
      'The stage plots validation loss against epoch, drawn point by point from epoch 0. Epoch 0\'s value, 2.908, sits off the top of the axis as a number; the rest range from 0.440 to 1.355. The axes are fixed to the longest run so the curve keeps its place when the handle turns.',
      'A "best" dot with a dashed level line marks the best epoch so far; it moves only when a new loss is strictly lower. Below the epoch axis a row of "waiting" cells, as many as the patience, fills one cell per epoch that fails to improve. When the last cell fills a "stop" line appears and the curve is cut there.',
      'On the way down the curve rises once each at epochs 6, 8 and 10 before reaching 0.440 at epoch 14. Status lines read "Epoch 11 · Validation loss: 0.520 · Best epoch: 9 · 0.485 · Patience: 3".',
      'The final step is the restore: a diamond marking the weights in use runs back along the curve to the best mark, and eight bars w1 … w8 jump from the stopped epoch\'s values to the best epoch\'s. The line reads "Weights in use: epoch 14 (restored)".',
      'Across the handle: patience 1 stops at epoch 6 and returns to epoch 5 (0.626); patience 2 stops at 11 and returns to 9 (0.485); patience 3, 5 and 8 all return to epoch 14 (0.440) and differ only in stopping at 17, 19 and 22. The stopped epoch always exceeds the best epoch by the patience.',
      'Readouts under the controls show "Best epoch" and "Stopped epoch" (0 until the stop).',
      'The data is a toy set: an eight-feature linear model without bias, trained point by point with SGD (η 0.08, weights starting at 0) on ten training points and scored on twenty validation points; five features had a true weight of 0. The visiting order of the training points is fixed per epoch, so the validation curve is identical for every patience. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle, "Patience", with 1 · 2 · 3 · 5 · 8 (starts at 3). Turning it redraws the curve from epoch 0; a round is the stopped epoch plus two steps.',
        'The move that makes the idea land is going from patience 1 to 3: the curve that was cut at the first bump extends to epoch 17 and the best mark drops from epoch 5 to 14. Going on to 8 only lengthens the curve; the mark stays at 14.',
        'The code panel, labelled "Early stopping", starts empty with an add-language button; the chosen language shows `earlyStop`, `sgdEpoch` and `valLoss`, lighting the start, improve, wait, stop and restore lines as the steps pass. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article recommends a patience value, or explains why patience 1 is risky, and needs a curve that wobbles so the cost of stopping at the first rise is visible.',
      'A reader wonders whether a larger patience ever hurts; here it reaches the same best weights and only spends more epochs, which frames patience as a compute trade-off.',
      'The article explains restore_best_weights and wants the weights in use visibly jumping back from the stopping point to the earlier minimum.',
    ],

    avoidWhen: [
      'The article needs the training loss beside the validation loss. Only validation loss is plotted.',
      'The subject is learning-rate schedules, reduce-on-plateau, or checkpoint averaging. The only action taken here is stopping and restoring.',
      'The point is overfitting as model complexity grows. The model is fixed; only training time varies.',
    ],

    contrastWith: [
      {
        concept: 'stopBeforeTurn',
        note: 'The stopping rule — remember the best, count non-improvements, roll back — is fixed; what patience value to feed it matters only when validation loss does not fall smoothly.',
      },
      {
        concept: 'trainDownValUp',
        note: 'A validation minimum along model complexity is chosen by picking a model; a validation minimum along training time is chosen by deciding when to stop, which needs a rule robust to noise.',
      },
      {
        concept: 'weightPenalty',
        note: 'Stopping early limits how far optimization travels from the starting weights without changing the loss; a penalty changes the loss so that the optimum itself has smaller weights.',
      },
      {
        concept: 'sgd',
        note: 'Stochastic updates are one reason a validation curve wobbles from epoch to epoch; early stopping has to decide how much of that wobble to tolerate.',
      },
    ],
  },
};
