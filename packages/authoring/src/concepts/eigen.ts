/**
 * eigen 개념 선언.
 *
 * canonical facet 은 `facet:eigen` — 두 고유값 λ₁ = 10 (고정) · λ₂ (손잡이) 와 두 고유 방향 (1, 1) · (−1, 1) 에서
 * 대칭 정수 행렬 A 를 짓고, 길이 1 의 화살표에 A 를 곱 열 번 거듭 곱한다. 곱마다 45° 줄과의 틈과 tan(틈) 의 비를
 * 로그 눈금에 찍는다. 손잡이 둘 — 작은 고유값 λ₂(−8 … 8, 0 없음, 처음 4) · 출발 방향 넷(처음 (0, 1)).
 *
 * ── 묶음 안에서의 자리 (완제품 둘 + 조각 넷 가운데 고유값 쪽)
 *
 * 조각 둘은 각각 한 장면이다 — 곱해도 돌지 않는 방향이 있다(`eigenvectorDirection`, 여러 벡터에 한 번씩) ·
 * 거듭 곱하면 큰 고유값 쪽으로 쏠리고 그 까닭은 작은 쪽 성분이 사그라들기 때문이다(`powerIterationDrift`, 벡터 하나 ·
 * 행렬 하나). 이쪽은 그 쏠림을 **손잡이로 몰아 빠르기를 무엇이 정하는가**를 맡는다. 그래서 definition 은
 * speed · ratio |λ₂/λ₁| · tangent · alternate sides 를 쥐고, 조각들이 독점한 does not turn · own line ·
 * component shrinks · stretch factor approaches λ₁ 을 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `eigen.md` 가 밝힌 것):
 *  - λ₁ = 10 · 고유 방향 둘 · 출발 넷 · λ₂ 여덟은 예로 정한 값이다. A 는 두 고유값에서 지은 대칭 정수 행렬이다.
 *  - 대칭일 때 정확하다 — 고유 방향이 직교해 곱마다 tan(틈) 이 정확히 |λ₂| ÷ λ₁ 배가 된다. 대칭이 아니면 그 비에 곧 붙을 뿐이다.
 *  - "1° 안" 은 이 화면이 정한 문턱이다. 출발이 작은 쪽 고유 방향 위에 정확히 있으면 쏠리지 않는다 — 실제 셈에서는 반올림 한 번이면 깨질 균형.
 *  - 수는 반올림해 보인다 (늘어난 배수 10.00 은 10 에 다가간 값). 한 행렬 · 출발 넷의 사례가 일반을 증명하지 않는다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const eigenConcept: FacetConceptSource = {
  id: 'eigen',
  label: 'Power Iteration Speed and the Eigenvalue Ratio',
  canonicalFacet: 'facet:eigen',

  surface: {
    definition:
      'The speed of power iteration is set by the eigenvalue ratio |λ₂/λ₁|: for a symmetric matrix each product shrinks the tangent of the angle to the dominant eigenvector by exactly that factor.',
    exemplarKeywords: [
      'power iteration',
      'power method convergence rate',
      'spectral gap',
      'ratio of the two largest eigenvalues',
      'linear convergence',
      'dominant eigenvalue',
      'symmetric matrix orthogonal eigenvectors',
      'negative eigenvalue oscillation',
      'why is power iteration slow',
      'eigenvalues and eigenvectors',
    ],
  },

  briefing: {
    observable: [
      'On the left a coordinate plane holds the matrix, two fixed eigen lines at 45° and 135° tagged "λ₁ = 10" and "λ₂ = 4", and a unit arrow v. With the defaults A = [7 3 ; 3 7] and v starts at (0, 1), 90°, with "gap 45.00°".',
      'Each product the tip of v runs in a straight line out to w = A v, then shrinks back along its own direction to length 1, leaving a mark at the tip. The readout names the step — "Product 1 of 10 · v (0.39, 0.92) · 66.8° · w (3.00, 7.00) · stretched ×7.62 · gap 21.80° · tan ratio 0.400".',
      'On the right, "tan(gap) after each product · log scale" plots one point per product against "product k", with a dotted line at 1°. Every tan ratio reads 0.400, beside the fixed "compare |λ₂| ÷ λ₁ = 0.400", so the points fall on a straight line.',
      'In the default run the gap goes 45.00° → 21.80° → 9.09° → 3.66° → 1.47° → 0.59°, and from product 5 the readout adds "within 1° since product 5". The stretch climbs to "×10.00", which is 10 approached and rounded.',
      'With λ₂ = −4 the gap, the tan ratios and the product that first falls within 1° are all the same as with 4, but v lands on alternate sides of the 45° line (23.2° → 54.1° → 41.3° → 46.5° …); the points are coloured "above the 45° line (y > x)" or "below the 45° line (y < x)" and the Line crossings counter reaches 10.',
      'With |λ₂| = 8 and start (0, 1) the gap is still 6.13° after ten products and no product falls within 1°; with |λ₂| = 2 it falls within 1° at product 3.',
      'Starting at (1, 1) the gap is 0.00° from the start; starting at (−1, 1) it stays at 90.00° for all ten products, and with a negative λ₂ the arrow flips between 135° and 315° on its own line. Neither start shows a tan ratio ("no tan ratio at this gap").',
      'Three counters sit under the controls: Products (up to 10), Line crossings, and Within 1° (products after which the gap was under 1°). The default run ends at 10, 0, 6.',
      'λ₁ = 10, the two eigen directions, the four starts and the eight values of λ₂ are chosen examples, and the matrix is built from them to be symmetric; that is why each ratio is exact rather than only approached. The 1° mark is a threshold this screen sets. Numbers are rounded. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two segmented sliders: "Smaller eigenvalue λ₂" with −8, −6, −4, −2, 2, 4, 6, 8 (starting at 4) and "Start direction" with (1, 1), (0, 1), (−4, 7), (−1, 1) (starting at (0, 1)). Moving either restarts the round of ten products; one round takes about fifteen seconds.',
        'The move that makes the idea land is stepping λ₂ through 2, 4, 6, 8 with the start left at (0, 1): the tan ratio follows |λ₂| ÷ 10 each time and the product that first falls within 1° moves from 3 to 5 to 8 to none. Flipping λ₂ to its negative keeps every one of those numbers and only changes the side.',
        'The code panel, labelled "Power iteration", starts empty with a "+ Add language" button; the chosen language shows one function that normalises, multiplies and records the first product within the threshold, highlighting the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article says power iteration "converges to the dominant eigenvector" and needs to say how fast: stepping the smaller eigenvalue while the larger stays at 10 shows each product cutting the tangent by exactly |λ₂|/λ₁, so a ratio near 1 means many products.',
      'A reader wonders what a negative second eigenvalue does to the iteration. The same magnitude with the opposite sign gives identical gaps and speed, with the direction hopping across the target line each time.',
      'The prose explains why a starting vector must have some component along the dominant eigenvector, and wants the case where the start sits exactly on the other eigenvector and the gap never moves from 90°.',
    ],

    avoidWhen: [
      'The subject is finding eigenvalues by solving the characteristic polynomial or a full eigen-decomposition algorithm such as QR iteration. Only the repeated product of one 2×2 matrix is on screen.',
      'The article is about PageRank, Markov chains or a covariance matrix of real data. The matrix here is a small symmetric one built from two chosen eigenvalues, with no graph or data behind it.',
      'The point is a non-symmetric matrix or complex eigenvalues. Every matrix on this screen is symmetric with two real eigenvalues.',
    ],

    contrastWith: [
      {
        concept: 'powerIterationDrift',
        note: 'That repeated multiplication leans toward the largest eigenvalue, and why, is the premise; the question here is how fast, and the answer is one number, the ratio of the two eigenvalues, which on a symmetric matrix is exact at every product.',
      },
      {
        concept: 'eigenvectorDirection',
        note: 'An eigenvector is defined by a single product that does not turn it; the rate at which other directions are pulled onto it under repeated products is a separate fact that depends on how the eigenvalues compare.',
      },
      {
        concept: 'pca',
        note: 'Principal component analysis uses power iteration on a covariance matrix to find an axis of data; the convergence rate studied here belongs to the iteration itself, whatever matrix it is run on.',
      },
    ],
  },
};
