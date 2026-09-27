/**
 * combinatorics 개념 선언.
 *
 * canonical facet 은 `facet:combinatorics` — 원소를 하나씩 들일 때마다 부분집합 점 하나하나가 제자리(뺀 쪽)와
 * 한 열 옆(넣은 쪽, 크기 +1)으로 갈라지고, 열마다 쌓인 수가 파스칼 삼각형의 한 줄로 옮겨 적힌다. 끝 걸음에
 * 크기 k 열의 점이 삼각형 n 번째 줄 k 번째 칸으로 모이고 `P(n, k) ÷ k! = p ÷ f` 줄이 같은 수를 낸다.
 * 손잡이 둘 — 원소 수 n(1~6, 처음 4) · 고르는 크기 k(0~6, 처음 2).
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 여섯)
 *
 * 조각 여섯은 각각 한 장면이다 — 두 배로 불어남(`powerSet`) · 위 둘을 더함(`pascalTriangle`) ·
 * 줄 세우기가 k! 씩 모임(`permutationVsCombination`) · 갈래마다 곱함(`productRuleTree`) ·
 * 어느 원소를 가져오는가(`setOperations`) · 두 번 센 것을 뺌(`inclusionExclusion`).
 * 이쪽은 **n 과 k 를 돌리며 부분집합이 크기별로 어떻게 나뉘는가**를 쥔다. 그래서 definition 은
 * 크기별 분포 · n 과 k 를 바꾼다 · C(n, k) 쪽 낱말을 쥐고, 조각들이 독점한 doubles · two above ·
 * arrangements · product · intersection · counted twice 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `combinatorics.md` 가 밝힌 것):
 *  - 원소 글자 a … f 와 n 1~6 은 예로 정한 값이다. 한 판에서 본 수가 일반(2ⁿ · 파스칼 등식 · P ÷ k!)을 받치지만 증명하지는 않는다.
 *  - 삼각형의 수는 위 칸끼리 더한 것이 아니라 점의 열에서 옮겨 적힌 것이다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const combinatoricsConcept: FacetConceptSource = {
  id: 'combinatorics',
  label: "Subsets and Pascal's Triangle (How Subsets Split by Size)",
  canonicalFacet: 'facet:combinatorics',

  surface: {
    definition:
      'How the subsets of n elements are distributed by size: as n and the chosen size k vary, the number of size-k subsets is the binomial coefficient C(n, k), read off Pascal\'s triangle.',
    exemplarKeywords: [
      'binomial coefficient',
      'n choose k',
      'number of subsets of size k',
      'subsets by size',
      'C(n, k) = C(n-1, k) + C(n-1, k-1)',
      "Pascal's rule",
      'C(n, k) = P(n, k) / k!',
      'sum of binomial coefficients is 2^n',
      'combinatorics',
      'counting subsets',
    ],
  },

  briefing: {
    observable: [
      'A strip of size columns labelled "Subsets by size" (k = 0 to 6) sits beside an area labelled "Pascal\'s triangle". Each dot in the columns is one subset; the round opens with a single empty-set dot in column 0 and the caption "Subsets: 1".',
      'Each following step takes in one element (a, b, c, d …). Every dot stays where it is — the subset without the new element — and a copy leaves it and slides one column over, one size larger — the subset with it. Under each column a sum such as "3+3" shows what stayed plus what arrived, and the caption reads "New element: c · Subsets: 4 → 8".',
      'When a step ends, the column totals are copied into the next row of the triangle: with n = 4 the rows 1 1, 1 2 1, 1 3 3 1 and 1 4 6 4 1 appear one after another. The triangle numbers come from the dot columns, not from adding triangle cells together.',
      'The last step gathers the dots of column k into cell k of row n and lists them by name. With n = 4 and k = 2 the caption reads "Size 2: 6" and "P(4, 2) ÷ 2! = 12 ÷ 2 = 6", and the six subsets {a, b} {a, c} {b, c} {a, d} {b, d} {c, d} are written out.',
      'Two readouts under the controls: "Subsets" (1, then doubling each step, 2ⁿ at the end) and "Size-k subsets" (0 until the last step, then C(n, k)).',
      'Across the handles: n = 6 fills the columns 1 6 15 20 15 6 1 with 64 dots, and k = 3 gathers 20 with 120 ÷ 6 = 20. If k is larger than n no dots gather and only the count 0 appears, without the P line. A new round folds the previous dots back into the single empty set.',
      'The element letters and the range 1 to 6 are example values, and the screen shows one case at a time; the general rules it illustrates are not proved by any one round, and the screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: an "Elements n" slider from 1 to 6, starting at 4, and a "Chosen size k" slider from 0 to 6, starting at 2. A round plays n + 2 steps, then waits for the handles.',
        'The move that makes the idea land is changing k with n held still: the gathering moves from column to column, the count rises to the middle of the row and falls again, and the P(n, k) ÷ k! line agrees each time. Raising n adds one splitting step and one triangle row.',
        'The code panel, labelled "Counting subsets by size", starts empty with a "+ Add language" button; the chosen language shows `countSize`, which updates one array with `row[i] = row[i] + row[i - 1]` from the largest size down, and highlights the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article introduces the binomial coefficient and wants C(n, k) to come out of actual subsets sorted by size, with the triangle row appearing as a record of those sizes rather than as a table to memorise.',
      'A reader can compute n choose k but does not see why the same number turns up as a Pascal entry and as P(n, k) ÷ k!, and the article wants all three to agree on screen for several n and k.',
    ],

    avoidWhen: [
      'The subject is combinations with repetition, multisets, or arrangements of letters with repeats. Every element here is distinct and each subset takes an element at most once.',
      'The article is about binomial probabilities or the normal approximation. The counts here are never turned into probabilities.',
      'The point is generating subsets efficiently in code or bitmask enumeration. The code here only counts by size; it never lists the subsets.',
    ],

    contrastWith: [
      {
        concept: 'powerSet',
        note: 'That every new element doubles the subsets settles the total 2^n. Sorting those subsets by size is a further question, and it is the size split that produces the binomial coefficients.',
      },
      {
        concept: 'pascalTriangle',
        note: 'Adding the two entries above is a rule about numbers in a triangle. Here the same numbers are counts of real subsets, which is why that rule is true of them.',
      },
      {
        concept: 'permutationVsCombination',
        note: 'Dividing ordered arrangements by r! explains one count of unordered selections. The subset view connects that same count to Pascal\'s rule and to the total 2^n across every size at once.',
      },
      {
        concept: 'productRuleTree',
        note: 'The product rule multiplies independent choices, and in or out for each of n elements gives 2 × … × 2 = 2^n. It says nothing about how many of those outcomes contain exactly k elements.',
      },
      {
        concept: 'cltBell',
        note: 'Binomial coefficients arranged along a row are the counts behind a bell shape once they are read as probabilities; as plain counts of subsets they carry no chance at all.',
      },
    ],
  },
};
