/**
 * pascalTriangle 개념 선언.
 *
 * canonical facet 은 `facet:pascalTriangle` — 줄 0 의 `1` 에서 줄 6 까지, 걸음마다 새 줄 하나가 생긴다. 안쪽 칸은
 * 바로 위 줄의 이웃한 두 수가 복제되어 내려와 합쳐진 것이고, 양 끝은 위의 `1` 하나가 내려온다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `combinatorics` 는 같은 수를 부분집합의 크기별 수로 읽는다. 이쪽은 화면에 C(n, k) 도 2ⁿ 도 두지 않는다 —
 * 주장은 "위 둘을 더해 아래가 된다" 하나다. 그래서 definition 은 two neighbouring entries above · ends stay 1 을
 * 독점하고 subsets · size · choose 를 쓰지 않는다.
 *
 * 전제: 마지막 줄 6 은 예로 정한 값. 일곱 줄의 셈만 보이며, 대칭 같은 일반은 설명 글 `pascalTriangle.md` 가 받친다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pascalTriangleConcept: FacetConceptSource = {
  id: 'pascalTriangle',
  label: "Pascal's Triangle (Each Entry Is the Two Above Added)",
  canonicalFacet: 'facet:pascalTriangle',

  surface: {
    definition:
      "Each inner entry in a new row of Pascal's triangle is the sum of the two neighbouring entries directly above it, while both ends stay 1 because only one number lies above them.",
    exemplarKeywords: [
      "Pascal's triangle",
      'how to build Pascal\'s triangle',
      'add the two numbers above',
      'next row from the previous row',
      'triangle of numbers',
      'row 6: 1 6 15 20 15 6 1',
      'symmetric rows',
      'additive recurrence',
    ],
  },

  briefing: {
    observable: [
      'The triangle starts as "Row 0" holding a single 1. Each step adds the next row underneath, one cell longer, until "Row 6" with seven cells.',
      'For each inner cell of the new row, the two neighbouring numbers in the row above are copied down, stand side by side, and merge into their sum; the originals stay in place above. The two end cells receive only the single 1 above them.',
      'Row 1 is "1 1" with the caption "Ends only: the single number above comes down". Later captions count the inner additions and name the largest one — row 4: "Inner sums: 3 · Largest: 3 + 3 = 6"; row 6: "Inner sums: 5 · Largest: 10 + 10 = 20".',
      'The finished rows read 1 · 1 1 · 1 2 1 · 1 3 3 1 · 1 4 6 4 1 · 1 5 10 10 5 1 · 1 6 15 20 15 6 1: fifteen inner additions in all, every row symmetric, largest number 20.',
      'Stopping at row 6 is an example choice, and the screen does not state that the pattern continues or why it is symmetric.',
    ],

    screen: {
      affordances: [
        'The screen plays seven steps by itself, one row per step, and stops at row 6.',
        'A Replay button and a playback strip sit below it. Dragging back to a middle row holds the moment two numbers come down and merge.',
        'Every number is computed from the row above, so an article can quote each row and each "Largest" sum as shown.',
      ],
    },

    useWhen: [
      'The article shows readers how to write down Pascal\'s triangle themselves and needs the one rule — add the two numbers above — performed row by row.',
      'A reader has seen the triangle as a finished table and wonders where each number comes from; the article wants each cell traced to exactly two parents in the previous row.',
    ],

    avoidWhen: [
      'The article wants the entries interpreted as counts of choices or subsets. The screen shows only the addition rule and never labels an entry C(n, k).',
      'The subject is the binomial theorem or expanding (a + b)^n. No algebra appears.',
      'The article needs rows beyond 6 or patterns such as Sierpinski shapes and Fibonacci diagonals. Only seven rows are built.',
    ],

    contrastWith: [
      {
        concept: 'combinatorics',
        note: 'The addition rule builds the numbers without saying what they count. Reading row n as the number of k-element subsets is what explains why adding the two above must hold.',
      },
      {
        concept: 'permutationVsCombination',
        note: 'Dividing arrangements by r! computes one entry directly from n and r; the triangle reaches the same entry only through every row above it.',
      },
      {
        concept: 'cltBell',
        note: 'The rows of the triangle, normalised by their total, take on a bell shape as n grows. The triangle itself is exact integer addition with nothing random in it.',
      },
    ],
  },
};
