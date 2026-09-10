/**
 * pivotChoiceMatters 개념 선언.
 *
 * canonical facet 은 `facet:pivotChoiceMatters` — 조각(piece)이다. 같은 값 일곱을
 * 두 줄(lane)에 나란히 놓고 각 줄에서 한 번씩 가른다. 기준으로 뽑힌 칸이 줄에서
 * 빠져 받침이 되고 나머지 칸이 왼팔·오른팔에 실리면 저울대가 개수 차이만큼
 * 기운다. 계기도 코드 패널도 없고 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `quickSort` 는 가르기를 재귀로 되풀이하는 **절차 전체** 를 맡고, 조각
 * `partitionAroundPivot` 은 한 번 가른 결과가 무엇인가(갈렸을 뿐 정렬은 아니다)를
 * 맡는다. 이 조각이 홀로 맡는 것은 **기준을 어디서 고르느냐가 남는 일의 크기를
 * 정한다** 는 것이다 — 가르는 품은 두 경우가 같은데 한쪽은 절반을 덜어 내고
 * 다른 쪽은 하나만 덜어 낸다.
 * definition 의 주어가 "고르는 자리" 이고, keywords 는 최악 · 이미 정렬된 입력 ·
 * 중앙값 고르기 어휘만 갖는다 (완제품의 재귀 · 제자리 어휘, 다른 조각의 갈림과
 * 정렬 구별 어휘와 겹치지 않게).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pivotChoiceMattersConcept: FacetConceptSource = {
  id: 'pivotChoiceMatters',
  label: 'Pivot Choice (What the Split Leaves Behind)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:pivotChoiceMatters',

  surface: {
    definition:
      'How much work a single split leaves behind is decided by which value is taken as the reference: a middle value halves the range, an extreme value removes only itself.',
    exemplarKeywords: [
      'choosing the pivot',
      'median-of-three',
      'random pivot',
      'first element as pivot',
      'worst case of quicksort',
      'already sorted input is the worst input',
      'unbalanced split',
      'quadratic instead of n log n',
      'why recursion depth blows up',
      'adversarial input',
    ],
  },

  briefing: {
    observable: [
      'The same seven values, already in ascending order, are laid out twice in two stacked lanes, so the only difference between the two runs is which cell is lifted out as the reference.',
      'The lifted cell drops out of the row and becomes the fulcrum a beam rests on, and the remaining cells then slide onto the left or the right arm one at a time.',
      'In the first lane the middle value is taken and three cells land on each arm; the beam wobbles once and settles level.',
      'In the second lane the first value is taken and nothing is smaller than it, so all six cells pile onto one arm and the beam settles tilted with the other arm bare.',
      'The beams are the same length in both lanes, which makes the loaded portion of an arm directly comparable across the two runs.',
      'A caption after each lane reports the larger side as what is left to do — three of seven in one lane, six of seven in the other — and names the difference as halving versus losing only the reference.',
      'Both lanes stay on screen once they are finished, so the two outcomes are read side by side rather than remembered.',
      'The number of cells that cross onto an arm is the same in both lanes; only where they land differs.',
    ],

    screen: {
      affordances: [
        'The screen plays both lanes on its own and stops with the two beams left in place for comparison.',
        'Two buttons: Replay, and a step control that rewinds and walks both lanes one movement at a time, which is how a reader can stop on the moment the second beam commits to one side.',
        'The values and the two reference positions are fixed, so an article can name the middle value and the first value and what each leaves behind.',
      ],
    },

    useWhen: [
      'The prose calls the worst case rare and the reader files it away as bad luck. Already-ordered input producing the lopsided beam every time is what moves it from bad luck to a predictable input.',
      'An article gives the average cost and the worst cost as two formulas without saying what physically differs between them. Two beams under identical values, one level and one tilted, is that difference in a single picture.',
      'A reader is about to accept "pick the first element" as a harmless simplification in example code. Seeing six of seven values pile onto one arm is what makes the simplification a decision.',
    ],

    avoidWhen: [
      'The subject is what a split accomplishes at all — whether the sides come out ordered, or where the reference ends up. Both lanes here split correctly and the question is only how evenly.',
      'The article is about the full sorting run, its recursion, or the code that carries it out. Neither lane goes past a single split.',
      'The point is how a good reference is computed in practice — median-of-medians, sampling, introsort switching strategies. The two positions here are fixed to contrast outcomes, not to demonstrate a selection procedure.',
      'The article uses "pivot" for a pivot table, a spreadsheet operation, or a change of direction in a product or business.',
    ],

    contrastWith: [
      {
        concept: 'quickSort',
        note: 'That runs split after split under one fixed rule and lets the imbalance accumulate in a log; this stops at a single split and varies the rule instead.',
      },
      {
        concept: 'partitionAroundPivot',
        note: 'Both stop after one split, but that one asks what the split achieved and this one asks how much is left over.',
      },
      {
        concept: 'bstDegenerate',
        note: 'The same input causes both failures — values arriving in order — with one collapsing a tree into a chain and the other collapsing a split into a decrement.',
      },
      {
        concept: 'depthDoublesCount',
        note: 'That concept is about what halving buys as depth grows; this shows the case where halving does not happen and the count falls by one instead.',
      },
    ],
  },
};
