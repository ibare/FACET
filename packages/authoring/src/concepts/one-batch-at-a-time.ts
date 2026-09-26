/**
 * oneBatchAtATime 개념 선언.
 *
 * canonical facet 은 `facet:oneBatchAtATime` — 점 여덟에 절편 없는 직선 ŷ = w·x 를 맞추는 두 쪽이 나란히 선다.
 * 점이 둘씩 네 묶음으로 들어올 때마다 미니배치 쪽은 곧바로 w 를 옮기고, 전체 배치 쪽은 점을 모으기만 하다가 마지막
 * 묶음에서 한 번 옮긴다. 한 바퀴 끝에 미니배치는 네 번 · w 1.93 · 손실 0.07, 전체 배치는 한 번 · w 1.03 · 손실 6.22.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `sgd` 는 묶음 크기를 돌려 갱신 수와 비낌이 함께 바뀌는 것을 쥐고, 조각 `noisyPath` 는 한 점의 방향이
 * 비끼는 장면이다. 이쪽은 **같은 한 바퀴에서 몇 번 움직이느냐** 하나다 — 이 데이터에서는 미니배치의 갱신이 매번
 * 손실을 낮춘다. definition 은 full batch waits · once per pass · after each small batch · same pass 를 쥐고,
 * angle · against · zigzag · batch size ladder 를 쓰지 않는다.
 *
 * 전제: 데이터 · 처음 w 0 · η 0.04 는 장난감 값, 모형은 기울기 하나뿐인 직선. 묶음 차례는 [5, 1] · [3, 7] · [0, 6] ·
 * [2, 4] 로 고정했다. 에폭은 하나다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const oneBatchAtATimeConcept: FacetConceptSource = {
  id: 'oneBatchAtATime',
  label: 'Mini-Batch vs Full-Batch Updates in One Pass',
  canonicalFacet: 'facet:oneBatchAtATime',

  surface: {
    definition:
      'Over one pass through the same data, full-batch training waits to see every example and updates once, while mini-batch training updates after each small batch and ends the pass further along.',
    exemplarKeywords: [
      'mini-batch vs batch gradient descent',
      'full-batch gradient descent',
      'how often weights are updated',
      'one update per epoch',
      'updates per pass',
      'online learning',
      'mini-batch',
      'why use mini-batches',
      'training loop',
    ],
  },

  briefing: {
    observable: [
      'A table "Points (x, y)" lists eight points, and the rule `w ← w − η·g · η = 0.04` sits above two panels: "Minibatch — updates after every batch" and "Full batch — updates after all points". Each panel has an "Updates" count, a w marker on a 0–2 axis and a "Loss (all points)" readout, both starting at w 0.00 and 25.85.',
      'The caption opens with "Same data, same starting w. One pass over the points begins." Then each step brings in one batch of two points: "Incoming batch: 1 / 4".',
      'On the first three batches the minibatch side moves right away — w 0.82, 1.77, 1.86, loss 9.09, 0.39, 0.17 — while the full-batch side only collects the points and stays at w 0.00, loss 25.85: "Minibatch updates w right away; full batch only collects the points."',
      'On the fourth batch both move: the minibatch side to w 1.93, loss 0.07 (Updates: 4), and the full-batch side, having now seen all eight points, once with g = −25.66 to w 1.03, loss 6.22 (Updates: 1).',
      'Both sides are always scored on the loss over all eight points, so the two readouts compare directly.',
      'The data, start w 0, η 0.04 and the fixed batch order are hand-picked; the model is a line through the origin with one weight. In this data every minibatch update lowers the loss.',
    ],

    screen: {
      affordances: [
        'The screen plays five steps by itself — the start and four incoming batches — and stops after the single pass.',
        'A Replay button and a playback strip sit below. Dragging back to batch 3 shows the full-batch side still at its starting w after six of eight points.',
        'Everything is fixed, so an article can quote each batch\'s gradient and both final positions exactly.',
      ],
    },

    useWhen: [
      'The article introduces mini-batches and needs the reader to see that the difference is in how often the weights move, with the same data seen by both.',
      'A reader thinks the full-batch update, being exact, must be further along after one pass; after the same eight points it has moved once and sits at a loss of 6.22 against 0.07.',
    ],

    avoidWhen: [
      'The article is about gradient noise or updates that point the wrong way. Every minibatch update here lowers the loss.',
      'The subject is choosing a batch size or running several epochs. There is one batch size of two and one pass.',
      'The point is parallel hardware or memory limits behind batching. Neither appears.',
    ],

    contrastWith: [
      {
        concept: 'sgd',
        note: 'Updating once per batch rather than once per pass is the starting point; how the batch size then trades update count against direction noise over several epochs is the wider question.',
      },
      {
        concept: 'noisyPath',
        note: 'Frequent updates are the gain of small batches; the other side is that each update follows only part of the data and can stray from the full-data direction.',
      },
      {
        concept: 'gradientDescent',
        note: 'Gradient descent names the update rule; full-batch and mini-batch versions apply the same rule and differ only in how much data feeds each gradient.',
      },
    ],
  },
};
