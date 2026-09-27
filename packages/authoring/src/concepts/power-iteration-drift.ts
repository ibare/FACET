/**
 * powerIterationDrift 개념 선언.
 *
 * canonical facet 은 `facet:powerIterationDrift` — 행렬 A = [[4, 1], [2, 3]] (고유값 5 · 2) 하나와 시작 벡터 (0, 1) 하나.
 * 걸음마다 A 를 한 번 더 곱하고 길이를 1 로 되돌린다. 방향이 큰 고유값의 방향 45° 쪽으로 한쪽에서만 다가가
 * 틈이 45.00° → 0.06° 로 줄고, 늘어난 배수 |Av| 는 3.162 → 4.998 로 5 에 다가간다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `eigenvectorDirection` 은 곱이 한 번뿐인 정의를, 완제품 `eigen` 은 손잡이로 몰아 보는 **빠르기**(비 |λ₂/λ₁| 가 정한다)를
 * 맡는다. 이쪽은 벡터 하나 · 행렬 하나로 "어디로 가는가 · 왜 그쪽인가" 를 쥔다 — 고유벡터 성분으로 풀면 작은 쪽 몫이
 * 걸음마다 사그라든다. 그래서 definition 은 any starting vector · rescaled · weaker component dies out · stretch
 * approaches λ₁ 을 독점하고, 완제품의 speed · tangent · alternate sides 와 조각 eigenvectorDirection 의 does not turn 을
 * 쓰지 않는다.
 *
 * 전제 (설명 글 `powerIterationDrift.md`):
 *  - 행렬 · 시작 벡터 · 곱하는 횟수(8)는 예로 정한 값이다. 2×2 이고 대칭이 아닌 일반 행렬이다.
 *  - 큰 고유값이 크기로 하나 우세해야 하고(|λ₁| > |λ₂|), 시작 벡터가 큰 쪽 고유벡터의 성분을 가져야 한다.
 *  - 정규화는 길이로 한다. 멈춤 판정은 없다 — 여덟 번 곱하고 멈춘다. 틈 비가 0.400 에 붙는 것은 곧 닿는 것이지 처음부터 정확한 것이 아니다.
 *  - 성분 풀이(b/a 가 걸음마다 2/5 배)는 설명 글의 말이고 화면에는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const powerIterationDriftConcept: FacetConceptSource = {
  id: 'powerIterationDrift',
  label: 'Power Iteration: Repeated Multiplication Leans Toward the Largest Eigenvalue',
  canonicalFacet: 'facet:powerIterationDrift',

  surface: {
    definition:
      'Multiplying any starting vector by the same matrix again and again, rescaling each time, turns it toward the eigenvector of the largest eigenvalue, because the weaker eigen-component dies out and the stretch approaches λ₁.',
    exemplarKeywords: [
      'power method',
      'repeated matrix multiplication',
      'normalize after each multiplication',
      'dominant eigenvector',
      'largest eigenvalue estimate',
      'why power iteration works',
      'eigen-decomposition of the starting vector',
      'iterative method for eigenvectors',
      'A^k v',
    ],
  },

  briefing: {
    observable: [
      'The matrix "A = [4 1 ; 2 3]" and one vector v start the screen. The caption reads "Start: v at 90.00°, λ₁ direction at 45.0°, gap 45.00°", a line at 45° marked "λ₁ = 5" shows the target direction, and a yellow wedge fills the gap between v and that line. A note reads "λ₂ / λ₁ = 2 / 5 = 0.400".',
      'Each step the arrow stretches and turns out to A·v, then shrinks along an arc back to length 1. The first caption reads "Multiplication 1: |Av| = 3.162, scaled back to length 1 — gap 26.57°".',
      'Over eight multiplications the gap shrinks 45.00° → 26.57° → 12.53° → 5.31° → 2.17° → 0.88° → 0.35° → 0.14° → 0.06°. v approaches the 45° line from one side only and never crosses it; the tick marks on the outer arc pile up on that side.',
      'The stretch |Av| rises 3.162 → 4.123 → 4.684 → … → 4.998, the tip of A·v reaching toward a circle of radius 5.',
      'A plot on the right, "Gap to λ₁ direction (log scale)", marks one point per step. The gap ratio reads 0.590, 0.472, 0.424, 0.409, 0.403, 0.401, 0.400, 0.400, settling onto the 0.400 printed beside it, and the points straighten into a line.',
      'The last caption reads "Multiplication 8: |Av| = 4.998 (λ₁ = 5) · gap 0.06° · gap ratio 0.400". There is one matrix, one start and a fixed eight multiplications with no stopping test; the values are chosen examples and are rounded, and the screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays itself, nine steps including the start, about fifteen seconds, and stops after the eighth multiplication.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging through the first three steps shows the big early swings, and dragging through the last three shows the gap ratio sitting on 0.400.',
        'The matrix, the start vector and every number are fixed, so an article can quote the gaps, stretches and ratios exactly.',
      ],
    },

    useWhen: [
      'The article introduces the power method and the reader has to believe that repeated multiplication goes somewhere definite. Watching one vector close in on the λ₁ line from 45° to 0.06° without ever overshooting makes the claim concrete.',
      'The prose explains that the stretch factor itself estimates the largest eigenvalue, and wants numbers creeping from 3.162 up to 4.998 against a known 5.',
      'An article is about to argue that the leftover share of the smaller eigenvector shrinks by λ₂/λ₁ per step, and needs a ratio that visibly settles on 0.400 = 2/5.',
    ],

    avoidWhen: [
      'The subject is PageRank, Markov chain steady states or principal components of data. There is no graph, probability or data here, only one 2×2 matrix.',
      'The article is about a convergence test or tolerance for stopping. The run stops after a fixed eight multiplications.',
      'The subject is the largest eigenvalue being negative or tied in size, where the direction oscillates or stalls. This matrix has one clearly dominant positive eigenvalue.',
    ],

    contrastWith: [
      {
        concept: 'eigen',
        note: 'That the direction heads for the dominant eigenvector, and why, is one claim; exactly how fast, and that the speed is the eigenvalue ratio whatever its sign, is a further claim built on it.',
      },
      {
        concept: 'eigenvectorDirection',
        note: 'An eigenvector is recognised by one multiplication that leaves it on its line; the power method never checks candidates and instead lets repetition carry one arbitrary vector onto the dominant eigen direction.',
      },
      {
        concept: 'gradientStep',
        note: 'Both reach their target by repeating one update, but a gradient step follows the local slope with a chosen step size, while repeated multiplication shrinks the leftover component by a factor fixed by the matrix alone.',
      },
      {
        concept: 'pca',
        note: 'Principal component analysis runs this same iteration on a covariance matrix to find an axis of data; the iteration itself says nothing about data, only about which eigenvalue of a matrix is largest.',
      },
    ],
  },
};
