/**
 * productRuleTree 개념 선언.
 *
 * canonical facet 은 `facet:productRuleTree` — 자리 셋(A B C · x y · 1 2 3)을 차례로 고른다. 걸음마다 지금 있는 끝
 * 하나하나에서 그 자리의 선택지 수만큼 갈래가 돋아 끝이 1 → 3 → 6 → 18 이 된다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `combinatorics` 는 원소마다 넣기 · 빼기 두 갈래라는 특수한 곱(2ⁿ)을 크기별로 나눈다. 이쪽은 **자리마다
 * 선택지 수가 다른** 일반 곱의 법칙 하나를 쥔다. 그래서 definition 은 in sequence · same number of options ·
 * product not sum 을 독점하고 subsets · order · doubling 을 쓰지 않는다.
 *
 * 전제: 선택지 3 · 2 · 3 과 기호는 예로 정한 값. 합의 법칙과의 견줌은 화면에 없고 설명 글 `productRuleTree.md` 가 잇는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const productRuleTreeConcept: FacetConceptSource = {
  id: 'productRuleTree',
  label: 'Product Rule of Counting (Multiply at Every Branch)',
  canonicalFacet: 'facet:productRuleTree',

  surface: {
    definition:
      'When choices are made in sequence and every earlier outcome allows the same number of options at the next position, the total number of outcomes is the product of those option counts, not their sum.',
    exemplarKeywords: [
      'product rule',
      'multiplication principle',
      'fundamental counting principle',
      'tree diagram counting',
      'how many outfits',
      'number of license plates',
      'number of possible passwords',
      'rule of product vs rule of sum',
      'independent choices multiply',
    ],
  },

  briefing: {
    observable: [
      'Three positions are listed with their options: "First place" A B C, "Second place" x y, "Third place" 1 2 3. At the start a single root is the only end, and the caption reads "Nothing chosen yet. Ends: 1".',
      'Each step chooses one position. From every current end, one new branch per option pushes out to the right, and the new ends are highlighted as pills naming the outcome so far (A, then Ax, then Ax1).',
      'The captions read "First place: ends 1 × 3 = 3", "Second place: ends 3 × 2 = 6", "Third place: ends 6 × 3 = 18". Within one step every end receives the same number of branches — an end starting with A gets two at the second place, just as one starting with C does.',
      'The eighteen final ends stand in dictionary order from Ax1 to Cy3.',
      'The option counts 3, 2, 3 are example values; the screen shows this one case, and the comparison with adding (3 + 2 + 3 = 8) is not on it.',
    ],

    screen: {
      affordances: [
        'The screen plays four steps by itself (the empty start and three choices) and stops at eighteen ends.',
        'A Replay button and a playback strip sit below it. Dragging back to the second choice shows three ends each growing exactly two branches.',
        'The positions and options are fixed, so each caption\'s multiplication can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces the multiplication principle with a menu, outfit or license-plate question and wants the tree to show why each stage multiplies what came before.',
      'Readers add option counts where they should multiply, and the article needs a picture where every existing branch gets the same fan-out at each stage.',
    ],

    avoidWhen: [
      'The later options depend on earlier ones, as in drawing without replacement where the count shrinks. Here the options at each position are fixed regardless of history.',
      'The article is about the sum rule, choosing one case among several alternatives. Only sequential choices appear.',
      'The subject is probability trees with weights on branches. No probabilities are shown.',
    ],

    contrastWith: [
      {
        concept: 'permutationVsCombination',
        note: 'The product rule counts sequences built from separate option lists. When the positions draw from the same pool and order is then ignored, the count must be divided by the orderings of each selection.',
      },
      {
        concept: 'powerSet',
        note: 'Deciding in or out for each of n elements is the product rule with two options everywhere, which is why the subsets number 2^n.',
      },
      {
        concept: 'depthDoublesCount',
        note: 'A binary tree doubles at every level because each node has exactly two children. The product rule allows each level its own factor, so growth follows the option counts rather than a fixed ratio.',
      },
      {
        concept: 'inclusionExclusion',
        note: 'Multiplication counts outcomes built from several independent choices; inclusion–exclusion counts the union of overlapping cases by adding and correcting the overlap.',
      },
    ],
  },
};
