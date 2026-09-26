/**
 * pushToZero 개념 선언.
 *
 * canonical facet 은 `facet:pushToZero` — 무게 여섯이 벌점 없이 맞춘 자리 a 에서 출발해 L1 벌점(η 0.4 · λ 0.30) 아래
 * 갱신 여섯 번을 한다. 갱신마다 살아 있는 무게는 크기와 상관없이 같은 폭 0.12 로 0 쪽으로 끌리고, w6 · w5 · w4 가
 * 갱신 1 · 2 · 4 에 0 에 닿아 거기 붙는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `weightPenalty` 가 L1 과 L2 를 맞바꾸고 λ 를 돌리는 대비를 맡으므로, 이쪽은 L1 갱신 한 가지의 동사 —
 * **같은 폭으로 끌고, 0 에서 멈추고, 붙어 있는다** — 만 쥔다. definition 에 L2 · ridge · λ 를 올린다는 말을 넣지 않고
 * fixed amount · regardless of size · stick · soft thresholding 을 독점한다. 형제 `shrinkAll` 의 proportional · ratio 도 쓰지 않는다.
 *
 * 전제 (설명 글 `pushToZero.md`): 데이터 손실 ½·Σ(w − a)² 는 특징이 직교하고 크기 1 인 선형 회귀로 줄인 모형,
 * 시작 무게 a 와 η · λ 는 고른 값이다. 끌기가 0 을 건너지 않는 것은 L1 의 0 에서의 부분 기울기 규약(soft-threshold)이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pushToZeroConcept: FacetConceptSource = {
  id: 'pushToZero',
  label: 'L1 Pulls Small Weights to Exactly Zero',
  canonicalFacet: 'facet:pushToZero',

  surface: {
    definition:
      'Each L1-penalized update drags every nonzero weight toward zero by one fixed amount regardless of its size, so small weights land exactly on zero and stick there: soft thresholding.',
    exemplarKeywords: [
      'L1 penalty',
      'lasso sparsity',
      'soft thresholding',
      'proximal gradient step',
      'subgradient of |w| at zero',
      'why L1 gives exact zeros',
      'constant pull toward zero',
      'sparse weights',
      'zeroed-out coefficients',
      'ISTA',
    ],
  },

  briefing: {
    observable: [
      'Six rows, w1 … w6, hang on either side of a central wall at 0. A tick marks each "fit without penalty (a)"; the weights start there: 1.10 · −0.70 · 0.45 · −0.26 · 0.18 · −0.08. The top line reads "L1 pull per update: 0.12".',
      'Each update first lets the data nudge a weight back toward a, then a strip, "L1 pull this update", drags it toward the wall. An "L1 pull" column lists each row\'s pull: every live row shows the same 0.12.',
      'Small weights run out of room: "Reached 0 this update: w6" on update 1, w5 on update 2, w4 on update 4. A weight that reaches the wall turns into a square and stops there instead of crossing to the other sign.',
      'On later updates the data lifts the stuck weights slightly and L1 presses them straight back: "Pressed back at 0 by L1: w4 0.10 · w5 0.07 · w6 0.03". Their pull is smaller than 0.12 because it only has to cancel the lift.',
      'A badge counts "Weights at 0", which only ever rises: 0, 1, 2, 2, 3, 3, 3 across updates 0 to 6. The large weights w1 · w2 · w3 are pulled too but stay nonzero, ending at 0.81 · −0.41 · 0.16 after update 6.',
      'The data loss is ½·Σ(w − a)², a linear regression with orthogonal unit-scale features reduced so each weight is computed alone; starting at a, η = 0.4 and λ = 0.30 are chosen values. The large weights have not reached their final resting place when the six updates end. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one update per step, seven steps including update 0, and stops after update 6.',
        'A Replay button and a playback strip sit below it. Dragging back to update 1 holds the moment all six rows carry equal pulls while w6, the smallest, hits the wall.',
        'Weights, η and λ are fixed, so the pull 0.12 and the order w6, w5, w4 can be quoted exactly.',
      ],
    },

    useWhen: [
      'A reader asks why L1 makes weights exactly zero instead of merely small; watching a fixed-size pull meet a weight smaller than it, and stop at the wall, is the answer.',
      'The article explains soft thresholding or the proximal step for lasso and wants the rule "shift by ηλ, clamp at zero" happening on actual numbers.',
      'The article says a zeroed weight stays zeroed and needs to show why: the data lifts it a little and the penalty cancels that lift every update.',
    ],

    avoidWhen: [
      'The comparison between L1 and L2, or the effect of turning λ up, is the point. Only one penalty at one strength is shown.',
      'The article is about pruning a trained network by magnitude. Nothing here is cut after training; zeros arise inside each update.',
      'The subject is quantization or rounding weights to low precision. The zeros here are produced by a penalty, not by numeric format.',
    ],

    contrastWith: [
      {
        concept: 'shrinkAll',
        note: 'L1 subtracts a constant, so the weight\'s own size decides whether it survives; L2 subtracts a share of the weight, so every weight survives and only the scale changes.',
      },
      {
        concept: 'weightPenalty',
        note: 'The fixed-width pull explains one L1 update; how many weights end at zero depends on the penalty\'s strength and on choosing L1 over L2 at all.',
      },
      {
        concept: 'dropRandomUnits',
        note: 'A zero produced by L1 is permanent and chosen by the weight\'s size; units silenced by dropout are chosen at random and come back on the next pass.',
      },
    ],
  },
};
