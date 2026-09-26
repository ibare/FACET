/**
 * localMinimum 개념 선언.
 *
 * canonical facet 은 `facet:localMinimum` — 바닥이 둘인 장난감 곡선 L = w⁴ − 2w² + 0.5w 에서 w 1.4 · η 0.05 로 출발한
 * 경사 하강이 갱신 일곱 번 만에 얕은 바닥(w 0.94, L −0.52)에 주저앉는다. 움직임과 |g| 가 줄어 멈춤 규약(|g| < 0.1)에
 * 걸리고, 언덕(L 0.03) 너머 가장 낮은 자리(w −1.06, L −1.51)는 끝까지 닿지 않는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `gradientDescent` 는 같은 곡선에서 η 와 출발을 돌려 어느 바닥에 서는지를 견준다. 이쪽은 **한 번의 하강이
 * 기울기 0 에 닿아 멈춘 곳이 가장 낮은 곳이 아니라는 장면** 하나다. definition 은 comes to rest · slope near zero ·
 * hill · never reached 를 쥐고, 완제품의 starting point · learning rate together 와 `learningRateTooBig` 의
 * opposite side · farther 를 쓰지 않는다.
 *
 * 전제: 곡선 · 처음 w 1.4 · η 0.05 는 손으로 고른 값이다. 멈춤 문턱 0.1 은 규약이다. 가장 낮은 자리는 −2 ~ 2 를
 * 0.01 간격으로 훑어 찾은 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const localMinimumConcept: FacetConceptSource = {
  id: 'localMinimum',
  label: 'Local Minimum (Stopping Where the Slope Vanishes)',
  canonicalFacet: 'facet:localMinimum',

  surface: {
    definition:
      'Gradient descent comes to rest wherever the slope shrinks toward zero, which can be a shallow valley whose loss is well above a deeper minimum lying beyond a hill it never climbs.',
    exemplarKeywords: [
      'local minimum',
      'local vs global minimum',
      'stuck in a local minimum',
      'zero gradient does not mean best',
      'stationary point',
      'non-convex loss landscape',
      'why training gets stuck',
      'greedy descent',
      'suboptimal solution',
      'stopping criterion on the gradient',
    ],
  },

  briefing: {
    observable: [
      'A curve with two valleys. The start reads "Start: w 1.40, slope g 5.88.", with the dot high on the right wall and a tangent drawn at its place.',
      'Each update slides the dot down: "Update 1: moved 0.29, now |g| 1.49." An arc on the axis below shows each move, and the moves shrink 0.29 · 0.07 · 0.04 · 0.02 · 0.01 · 0.01 · 0.01 while the tangent flattens.',
      'The seventh update ends it: "Update 7: |g| 0.08 < 0.1, so the updates stop." The dot rests at w 0.94, L −0.52.',
      'A dashed ring marked "lowest point" sits at w −1.06, L −1.51 in the left valley from the first step to the last; the dot never goes near it. A "hill" mark at L 0.03 lies between the two valleys.',
      'The final caption reads "Beyond the hill (L 0.03), the lowest point: L −1.51, gap 1.00." A "ΔL" readout shows the height still above the lowest point, falling from 2.14 to 1.00.',
      'Every update lowers the loss; nothing goes wrong along the way. The curve, the start 1.4, η 0.05 and the stop at |g| below 0.1 are chosen values.',
    ],

    screen: {
      affordances: [
        'The screen plays eight steps by itself — the start and seven updates — and stops at the shallow valley.',
        'A Replay button and a playback strip sit below. Holding the last step keeps the resting dot and the untouched lowest-point ring in view together.',
        'The start, the rate and the curve are fixed, so an article can quote every move, |g| and the final gap of 1.00 exactly.',
      ],
    },

    useWhen: [
      'The article claims that when the gradient reaches zero training has found the best weights, and needs a run whose every update was correct yet stops 1.00 above the lowest value.',
      'The reader asks why a model can stop improving while a better solution exists, and the article wants the plainest case of a slope-following method with no reason to go uphill.',
    ],

    avoidWhen: [
      'The article compares several starts, learning rates or restarts. There is one run from one place.',
      'The subject is saddle points or plateaus in high dimensions. The curve has one weight and a real valley.',
      'The point is a method that escapes, such as momentum or noise. Only plain gradient descent runs here.',
    ],

    contrastWith: [
      {
        concept: 'gradientDescent',
        note: 'Settling in the nearer valley is one outcome; which valley a descent ends in depends on the learning rate and the start together, and a different pair can reach the deeper one.',
      },
      {
        concept: 'learningRateTooBig',
        note: 'Both miss the best value, but a local minimum is a descent that comes to rest too early, while an oversized rate is one that never comes to rest.',
      },
      {
        concept: 'carryVelocity',
        note: 'Plain descent stops where the slope stops pushing; carrying earlier movement is what lets a weight keep going through a stretch where the slope gives nothing.',
      },
    ],
  },
};
