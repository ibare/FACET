/**
 * gradientStep 개념 선언.
 *
 * canonical facet 은 `facet:gradientStep` — f(x, y) = x² + 3y² 의 점 (2, 1) 에서 ∇f = (4, 6) 을 재고, 뒤집어 −∇f,
 * 학습률 η = 0.1 배로 줄여 걸음 (−0.4, −0.6), 점이 (1.6, 0.4) 로 옮겨 가 함숫값이 7.00 → 3.04 로 내려간다. 걸음은 한 번뿐이다.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `gradient` 는 ∇f 를 재어 방향 기울기와 견줄 뿐 점을 옮기지 않는다. 이쪽은 **−η∇f 한 줄로 한 번의 갱신이 정해진다**는
 * 한 장면이다. 그래서 definition 은 one update · negative gradient · learning rate · moves the point · lowers 를 쥐고,
 * 방향을 돌려 잰다 · 코사인 · 붙든다 같은 말을 넣지 않는다. 되풀이 · 넘침 · 얕은 바닥은 ml 쪽 개념
 * (`gradientDescent` · `learningRateTooBig` · `localMinimum`) 의 말이라 이쪽 definition 에 두지 않는다.
 *
 * 전제 (설명 글 `gradientStep.md` 가 밝힌 것):
 *  - 함수 · 출발점 · 학습률은 예로 정한 값이다. ∇f 는 거듭제곱 규칙으로 셈한다.
 *  - −∇f 가 내리막이라는 것은 매끄러운 함수에서 걸음이 충분히 작을 때 성립한다. 여기서 η = 0.1 이 그만큼 작다.
 *  - 걸음은 바닥 (0, 0) 을 곧장 겨누지 않는다 (걸음 −123.7° · 바닥 쪽 −153.4°) — 설명 글이 말하고 화면은 말하지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const gradientStepConcept: FacetConceptSource = {
  id: 'gradientStep',
  label: 'One Gradient Descent Step (−η∇f)',
  canonicalFacet: 'facet:gradientStep',

  surface: {
    definition:
      'A single gradient-descent update moves a point by the negative gradient scaled by the learning rate, so the direction comes from the local slope, the length from η times its size, and the function value drops.',
    exemplarKeywords: [
      'gradient descent update rule',
      'x ← x − η∇f(x)',
      'one step of gradient descent',
      'learning rate η',
      'negative gradient direction',
      'step size',
      'parameter update',
      'descent direction',
      'how gradient descent moves a point',
    ],
  },

  briefing: {
    observable: [
      'A plane shows the point "Start at (2, 1) · f = 7.00" for f(x, y) = x² + 3y², and a column at the right labelled "Height f" has a marker at 7.00.',
      '"Uphill here: ∇f = (4.00, 6.00) · length 7.21" — an arrow grows out of the point. "Turn it around: −∇f = (−4.00, −6.00)" — the tip swings through the point to the opposite side, the old ∇f left as a dashed line.',
      '"Shrink by learning rate η = 0.1: step (−0.40, −0.60) · length 0.72" — the tip is pulled in toward the point, the unshrunk −∇f left dashed to show the factor of ten.',
      '"Take the step: (2, 1) → (1.60, 0.40)" — the point slides along the step arrow; plane and arrows share one scale, so the arrow\'s length is the distance moved. Then "f: 7.00 → 3.04 · down by 3.96" as the column marker drops and a bracket marks the drop. Six steps in all, counting the opening.',
      'There is exactly one update, and it does not cross the minimum (both new coordinates stay positive). The step does not aim straight at the minimum at (0, 0), because the gradient only knows the local slope — the screen does not say this. The function, start and η are chosen examples; −∇f lowers the value for smooth functions when the step is small enough, which η = 0.1 is here.',
    ],

    screen: {
      affordances: [
        'The screen plays its six steps by itself and stops after the new height is shown.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging the strip across the turn-around and shrink steps shows the arrow flipping and then being cut to a tenth.',
        'The function, the start and η are fixed, so every vector, length and height can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article writes down the update x ← x − η∇f and wants each part of it made visible in order: measure the gradient, flip it, scale it by η, move, and check the lower value.',
      'A reader is unsure what the learning rate multiplies, and the article needs a case where η turns a gradient of length 7.21 into a step of length 0.72.',
    ],

    avoidWhen: [
      'The article is about gradient descent converging over many iterations, or about which minimum it ends in. Only one update is taken.',
      'The subject is a learning rate that is too large and overshoots, or getting stuck in a shallow minimum. The single step here stays safely on one side.',
      'The article is about stochastic or mini-batch gradients, momentum or adaptive optimisers. The gradient here is exact and the update plain.',
    ],

    contrastWith: [
      {
        concept: 'gradientDescent',
        note: 'Gradient descent is the repeated procedure whose outcome depends on the learning rate and start; one update is the unit it repeats, with its direction and length set by −η∇f.',
      },
      {
        concept: 'learningRateTooBig',
        note: 'A learning rate that is too large makes each update overshoot and the loss rise; with a small enough rate a single update lowers the value, as the local slope predicts.',
      },
      {
        concept: 'localMinimum',
        note: 'Where descent eventually stops is a question about the whole landscape; one update only uses the slope at the current point and knows nothing of distant valleys.',
      },
      {
        concept: 'gradientSteepest',
        note: 'Which way is steepest is a fact about one point; a descent update acts on it, going the opposite way by a chosen fraction of the gradient.',
      },
      {
        concept: 'powerIterationDrift',
        note: 'Both are a fixed update rule that, applied again and again, closes in on a target. A descent update lowers a function value by following the local slope, while a power-iteration update turns a vector toward the dominant eigenvector.',
      },
    ],
  },
};
