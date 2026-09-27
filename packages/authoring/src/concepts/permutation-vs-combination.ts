/**
 * permutationVsCombination 개념 선언.
 *
 * canonical facet 은 `facet:permutationVsCombination` — 물건 K L M N 에서 셋을 고른다. 줄 세우기 24 개가 한꺼번에
 * 왼쪽 판(Order matters)에 나오고, 걸음마다 같은 셋으로 된 여섯이 오른쪽(Order ignored)의 한 묶음으로 모인다.
 * 끝에 24 ÷ 6 = 4 · P(4, 3) = 24 · C(4, 3) = 4 · 3! = 6. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `combinatorics` 에도 `P(n, k) ÷ k!` 줄이 뜨지만 거기선 부분집합의 크기별 수를 맞춰 보는 줄 하나다. 이쪽은
 * **순서만 다른 줄 세우기가 한 모임으로 모인다**는 장면 하나를 쥔다. 그래서 definition 은 order · arrangements ·
 * groups of r! · same members 를 독점하고 Pascal · size · subsets 를 쓰지 않는다.
 *
 * 전제: 물건 넷 · 고르는 수 3 · 기호 K L M N 은 예로 정한 값. 한 사례이고, 일반 식은 설명 글
 * `permutationVsCombination.md` 가 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const permutationVsCombinationConcept: FacetConceptSource = {
  id: 'permutationVsCombination',
  label: 'Permutations vs Combinations (Arrangements That Differ Only in Order)',
  canonicalFacet: 'facet:permutationVsCombination',

  surface: {
    definition:
      'Ordered arrangements of r items from n fall into groups of r! that contain the same members in different orders, so the number of unordered selections is the number of arrangements divided by r!.',
    exemplarKeywords: [
      'permutation vs combination',
      'does order matter',
      'nPr and nCr',
      'P(n, r) = n! / (n - r)!',
      'C(n, r) = P(n, r) / r!',
      'why divide by r factorial',
      'arrangements vs selections',
      'lottery numbers vs passwords',
      'overcounting by order',
    ],
  },

  briefing: {
    observable: [
      'The four objects K, L, M, N sit at the top with "Choose: 3". Two areas are labelled "Order matters" and "Order ignored"; the first caption asks "Pick 3: does order matter?"',
      'In one step all 24 arrangements appear at once on the left in dictionary order — KLM KLN KML KMN KNL KNM, then those starting with L, M and N — with the caption "Arrangements: 4 × 3 × 2 = 24".',
      'Each of the next four steps picks one set in dictionary order. For {K,L,M} the six arrangements KLM KML LKM LMK MKL MLK fly from their scattered places to the right and stand together inside one frame: "Same set, different order: 6 → group {K,L,M}".',
      'Two counters track the gathering: "Not yet grouped" falls 24 → 18 → 12 → 6 → 0 while "Groups" rises 0 → 4.',
      'The last step shows "24 ÷ 6 = 4 · group size 3! = 6", with "P(4, 3) = 24" under the left area and "C(4, 3) = 4" under the right.',
      'Four objects and a choice of three are example values; the screen shows this one case, and the general formulas are not written on it.',
    ],

    screen: {
      affordances: [
        'The screen plays seven steps by itself and stops on the division.',
        'A Replay button and a playback strip sit below it. Dragging back through the gathering steps shows the left area emptying by exactly six each time.',
        'The objects and the choice are fixed, so every arrangement and group can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article must explain why the combination formula divides by r! and wants the reader to watch every ordering of the same three items collapse into one group.',
      'Readers confuse when to count arrangements and when to count selections, and the article wants both counts of the same choice side by side with the ratio between them visible.',
    ],

    avoidWhen: [
      'The subject is permutations with repeated items or arrangements in a circle. All objects are distinct and arrangements are in a line.',
      'The article is about generating permutations in code, such as next-permutation or backtracking order. The 24 arrive all at once, not one by one.',
      'The point is the multiplication 4 × 3 × 2 built up branch by branch. It appears only as a one-line product.',
    ],

    contrastWith: [
      {
        concept: 'productRuleTree',
        note: 'Counting arrangements is the product rule applied with shrinking options, 4 × 3 × 2. Treating arrangements with the same members as one is the additional step that turns that product into a combination count.',
      },
      {
        concept: 'combinatorics',
        note: 'Dividing by r! gives one number of selections. Seen as subsets sorted by size, the same number also satisfies Pascal\'s rule, and all sizes together add up to 2^n.',
      },
      {
        concept: 'pascalTriangle',
        note: 'A combination count can be computed directly from n and r by division, or reached through successive additions from the row above; both give the same integer.',
      },
    ],
  },
};
