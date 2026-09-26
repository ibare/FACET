/**
 * gradientDescent 개념 선언.
 *
 * canonical facet 은 `facet:gradientDescent` — 바닥이 둘인 장난감 곡선 L = w⁴ − 2w² + 0.5w 위에서 w ← w − η·g 를
 * 되풀이한다. 손잡이 둘(학습률 η 여섯 칸 · 출발 w₀ 1.6 / 1.4)을 돌리면 점이 곡선 위를 호로 다시 뛰고, 끝 걸음에
 * 깊은 바닥 · 얕은 바닥 · 못 멈춤(두 자리를 오감) · 곡선 밖 가운데 하나로 끝난다. 출발만 바꿔 끝이 달라지는 η 가
 * 0.15 · 0.2 · 0.35 셋이라 "어느 바닥인지는 η 와 출발이 함께 정한다" 가 주장이다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * 조각 `localMinimum` 은 한 값으로 얕은 바닥에 주저앉는 장면, `learningRateTooBig` 은 한 그릇에서 바닥을 건너 갈수록
 * 멀어지는 장면이다. 이쪽은 **두 손잡이의 조합이 바닥을 고르는 것**을 쥔다. 그래서 definition 은 starting point ·
 * together decide · which of two minima · fail to settle 를 쥐고, 조각들이 독점한 hill it never crosses · shallow
 * valley higher than · opposite side · farther and higher 를 쓰지 않는다.
 *
 * 전제 (설명 글 `gradientDescent.md`):
 *  - 곡선은 바닥 둘과 언덕 하나를 가진 장난감 다항식이다. 출발 둘과 η 여섯은 끝난 모양이 고루 나오도록 고른 값이다.
 *  - 멈춤은 규약이다 — 갱신 앞 |g| < 0.01 에서 멈춤 · 갱신 60 번 상한 · |w| > 100 이면 곡선 밖.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const gradientDescentConcept: FacetConceptSource = {
  id: 'gradientDescent',
  label: 'Gradient Descent (Learning Rate and Start Pick the Minimum)',
  canonicalFacet: 'facet:gradientDescent',

  surface: {
    definition:
      'On a non-convex loss with two minima, the learning rate and the starting point together decide which minimum gradient descent settles in, and too large a rate keeps it from settling at all.',
    exemplarKeywords: [
      'gradient descent',
      'w ← w − η·g',
      'learning rate',
      'initialization',
      'starting point matters',
      'non-convex optimization',
      'global vs local minimum',
      'sensitivity to initial weights',
      'step size tuning',
      'convergence criterion',
      'optimizer basics',
    ],
  },

  briefing: {
    observable: [
      'One cross-section of the curve L = w⁴ − 2w² + 0.5w for w from −2 to 2, marked "deep valley" (w −1.06, L −1.51), "shallow valley" (w 0.93, L −0.52) and "hump" (w 0.13) between them. The header shows `w ← w − η·g` with the current η and w₀.',
      'Step 0 shows the start ("Start · slope g = 10.48" at the default). Each later step is one update: the dot jumps along an arc from its old place to its new one rather than rolling along the curve, and the caption reads "Update t · slope g = … · new w = …". A jump that goes over the hump stays highlighted.',
      'A final step reports where it stood: "Settled in the deep valley · |g| = 0.006 < 0.01" at the default η 0.15 · start 1.6, reached in 10 updates (12 steps counting the start and the final step), with the first update already landing past the hump at w 0.03.',
      'From start 1.6, η 0.02 and 0.1 settle in the shallow valley, 0.15 and 0.2 cross the hump on the first update and settle in the deep one, 0.25 swings between −0.77 and −1.21 without stopping within 60 updates, and 0.35 leaves the window in three updates (w −519.63), shown by an edge arrow with only w written.',
      'From start 1.4, every η up to 0.2 settles in the shallow valley; 0.25 swings between the same two places as before and 0.35 swings between 0.76 and 1.03. Only at η 0.15, 0.2 and 0.35 does changing the start alone change the outcome.',
      'Two readouts count "Updates" and "Hump crossings" for the round: 10 and 1 at the default, 3 and 3 at η 0.35.',
      'The curve is a toy polynomial with one weight; the two starts and six rates were picked so every outcome appears. Stopping is a rule — |g| below 0.01 before an update, at most 60 updates, |w| above 100 counts as off the curve. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Learning rate η" with 0.02 · 0.1 · 0.15 · 0.2 · 0.25 · 0.35 (starts at 0.15) and "Start w₀" with 1.6 · 1.4 (starts at 1.6). Turning either restarts the round from the start point; changing the start slides the dot along the curve to the new place first.',
        'The move that makes the idea land is holding η at 0.15 or 0.2 and flipping the start between 1.6 and 1.4: the same rate ends in the deep valley from one start and the shallow valley from the other.',
        'The code panel, labelled "Gradient descent", starts empty with an add-language button; the chosen language shows `descend`, which writes each new w into a list and returns the number of updates. Update steps light the gradient-and-move lines, the final step the stop, off-the-curve or limit return. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article says gradient descent finds "the" minimum and needs a case where the same curve and the same rule end in different valleys depending on where the run starts and how big the rate is.',
      'A reader believes a larger learning rate reliably reaches a deeper minimum; from start 1.4 every rate up to 0.2 stays in the shallow valley, while from 1.6 the same 0.15 reaches the deep one.',
      'The article is choosing a learning rate and wants the whole ladder in one place — settling in either valley, swinging between two points for 60 updates, and leaving the curve.',
    ],

    avoidWhen: [
      'The subject is fitting a line to data or the loss surface of a real model with many weights. There is one weight and a hand-built curve, and no data.',
      'The article is about mini-batches, momentum or adaptive optimizers. Every update here uses the exact gradient of one fixed curve.',
      'The point is how the gradient itself is computed through a network. The gradient here is the derivative of a written formula.',
    ],

    contrastWith: [
      {
        concept: 'localMinimum',
        note: 'Stopping in a valley that is not the lowest follows from following the slope alone; which valley a run ends in, and how that depends on the rate and the start together, is the broader question.',
      },
      {
        concept: 'learningRateTooBig',
        note: 'A rate large enough to make each step overshoot farther is one end of the ladder; below that end, the rate still decides which valley is reached rather than only whether one is.',
      },
      {
        concept: 'linearRegression',
        note: 'Fitting a line gives gradient descent a single bowl, where the rate changes only how fast or whether it arrives; with two valleys the rate and start also change where it arrives.',
      },
      {
        concept: 'momentum',
        note: 'Plain gradient descent moves by the current slope only; momentum adds part of the previous movement, which changes whether flat stretches and minima are passed.',
      },
      {
        concept: 'backprop',
        note: 'Backpropagation produces the gradient of a network\'s loss; gradient descent is the rule that turns a gradient into a weight change, whatever produced it.',
      },
    ],
  },
};
