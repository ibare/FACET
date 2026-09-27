/**
 * eigenvectorDirection 개념 선언.
 *
 * canonical facet 은 `facet:eigenvectorDirection` — 행렬 A = [[5, −1], [2, 2]] 를 일곱 벡터에 **한 번씩** 곱한다.
 * 벡터는 각이 오르는 차례(0° → 135°)로 훑고, 걸음마다 v 에서 Av 까지 돈 각이 호와 장부의 막대로 쌓인다.
 * 다섯은 돌고, (1, 1) · (1, 2) 둘만 돈 각 0.0° 로 제 직선 위에서 4 배 · 3 배 늘어난다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `eigen` 은 거듭 곱할 때 쏠리는 빠르기를, 조각 `powerIterationDrift` 는 벡터 하나를 거듭 곱해 쏠리는 까닭을 맡는다.
 * 이쪽은 **곱이 한 번뿐**이고 주장은 "곱해도 돌지 않는 방향이 있고 그 배수가 고유값이다" 하나 — 고유벡터의 정의 그 자체다.
 * 그래서 definition 은 does not turn · own line · only stretched · Av = λv 를 독점하고, repeated · converge · dominant ·
 * ratio 같은 되풀이 쪽 낱말을 쓰지 않는다.
 *
 * 전제 (설명 글 `eigenvectorDirection.md`):
 *  - 행렬과 일곱 벡터는 예로 고른 것이다. 대칭이 아닌 행렬이고 실수 고유값 둘(4 · 3)이 모두 양수라 뒤집히는 고유벡터가 없다.
 *  - (2, 3) 이 반대쪽으로 조금 도는 것은 이 행렬에서 그렇다는 것이지 일반 법칙이 아니다.
 *  - "제 직선 위" 는 외적이 0 인지로 판정한다 (자료가 정수라 정확히 0). 각은 소수 첫째 · 배수는 소수 둘째로 반올림해 보인다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const eigenvectorDirectionConcept: FacetConceptSource = {
  id: 'eigenvectorDirection',
  label: 'Eigenvectors: Directions a Matrix Does Not Turn',
  canonicalFacet: 'facet:eigenvectorDirection',

  surface: {
    definition:
      'An eigenvector is a direction a matrix does not turn: one multiplication leaves it on its own line, only stretched by the eigenvalue λ in Av = λv, while vectors in other directions rotate.',
    exemplarKeywords: [
      'eigenvector',
      'eigenvalue',
      'Av = λv',
      'what is an eigenvector',
      'geometric meaning of eigenvectors',
      'direction unchanged by a matrix',
      'invariant direction of a linear transformation',
      'scaling factor along an eigenvector',
      'cross product zero means parallel',
      'eigenvectors intuition',
    ],
  },

  briefing: {
    observable: [
      'The matrix "A = [5 −1 ; 2 2]" sits beside a plane, and a ledger on the right lists seven vectors in order of angle: (1, 0), (2, 1), (1, 1), (2, 3), (1, 2), (0, 1), (−1, 1). The opening caption reads "Multiply each vector by A once · vectors: 7"; no eigen direction is drawn yet.',
      'Each step takes one vector: the original v stays in place while a copy turns and stretches into Av, and an arc marks the turn. The caption reads, for example, "v (1, 0) → Av (5, 2) · turned: 21.8° · length: ×5.39", and the ledger fills a Turned bar and a Length bar for that row.',
      '(1, 1) goes to (4, 4) with "turned: 0.0°", the caption shows "v × Av = 0" and "λ = 4", and only at that step is its line drawn across the plane in yellow. (1, 2) does the same with Av = (3, 6) and "λ = 3".',
      'The other five turn: 21.8°, 7.1°, 26.6° and 45.0° counter-clockwise for (1, 0), (2, 1), (0, 1) and (−1, 1), and (2, 3), lying between the two eigen lines, turns the other way by −1.3°.',
      'The run ends with "Turned: 5 · On its own line: 2" and the ledger showing all seven rows at once.',
      'Every vector is multiplied exactly once; nothing is multiplied a second time. The matrix and the seven vectors are chosen examples, the matrix is not symmetric, and its two eigenvalues are both positive so no eigenvector is flipped. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays itself, one vector per step, eight steps including the opening, about fifteen seconds, and stops on the final tally.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging back and forth across steps 2 to 4 sets (2, 1) turning, (1, 1) staying on its line, and (2, 3) turning the other way side by side.',
        'The matrix and vectors are fixed, so an article can quote every angle, length and eigenvalue exactly as it appears.',
      ],
    },

    useWhen: [
      'The article is introducing Av = λv and the reader needs to see first that most vectors are turned by a matrix, so that the two which are not stand out as special rather than as a formula to accept.',
      'A reader thinks an eigenvalue is a property of the matrix with no picture attached; watching (1, 1) come out as (4, 4) and (1, 2) as (3, 6) ties each eigenvalue to how much one direction is stretched.',
    ],

    avoidWhen: [
      'The subject is computing eigenvalues from the characteristic equation or determinant. The screen finds them only by testing given vectors.',
      'The article needs complex eigenvalues, a rotation matrix with no real eigenvector, or a negative eigenvalue that flips its vector. This matrix has two positive real ones.',
      'The point is what happens when the same matrix is applied again and again. Each vector here is multiplied once.',
    ],

    contrastWith: [
      {
        concept: 'eigen',
        note: 'Being an eigenvector is settled by one product; how quickly repeated products pull every other direction onto the dominant eigenvector is a further question whose answer is the ratio of the eigenvalues.',
      },
      {
        concept: 'powerIterationDrift',
        note: 'An eigen direction can be recognised by checking which vectors a single multiplication leaves on their line; repeated multiplication instead drives one arbitrary vector toward the dominant eigen direction without testing any candidates.',
      },
      {
        concept: 'vectorScale',
        note: 'Multiplying a vector by a number stretches it along its own line by definition; an eigenvector is a direction where a whole matrix happens to act exactly like such a number.',
      },
      {
        concept: 'matrixAsTransform',
        note: 'A matrix as a transformation moves the whole plane at once; eigenvectors pick out the particular directions inside that motion which keep their line.',
      },
      {
        concept: 'matrixTransform2d',
        note: 'Reading a 2x2 matrix through where the basis vectors land describes the map from its columns; eigenvectors describe it from the directions it leaves unturned, which are usually not the basis vectors.',
      },
    ],
  },
};
