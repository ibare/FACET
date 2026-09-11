/**
 * editTableFill 개념 선언.
 *
 * canonical facet 은 `facet:editTableFill` — 조각이다. `kitten` 을 세로로,
 * `sitting` 을 가로로 놓은 표가 왼쪽 위 구석에서 시작해 반대각선을 타고 오른쪽
 * 아래로 차오른다. 걸음 하나가 반대각선 하나라 여러 칸이 한꺼번에 채워지고,
 * 마지막 칸에서 3 이 나오며 멈춘다.
 *
 * ── 묶음 안에서의 자리 (편집 거리 계열)
 *
 * 완제품이 아직 없어 조각 둘이 이 토픽을 나눠 맡는다. 이쪽은 **표 전체의 모양**
 * 이다 — 두 낱말이 가로세로 축이 되고, 칸 하나가 앞자락 한 쌍에 붙고, 구석에서
 * 번져 마지막 칸이 두 낱말 전체의 답이 된다는 것. 한 칸이 어떻게 정해지는가는
 * `threeEditChoices` 의 몫이라 definition 에서 세 갈래를 세지 않았다.
 *
 * `bottomUpTable` 과 가장 가깝다. 저쪽은 "작은 것부터 채우면 호출이 필요 없다" 는
 * **일반 전략**이고, 이쪽은 그 전략이 이 문제에서 갖는 **구체적 모양**이다. 그래서
 * definition 에 "재귀" · "반복문" · "순서" 를 넣지 않고 축과 앞자락으로만 썼다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const editTableFillConcept: FacetConceptSource = {
  id: 'editTableFill',
  label: 'Edit-Distance Table (Filled Prefix by Prefix)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:editTableFill',

  surface: {
    definition:
      'A grid indexed by the prefixes of two strings, each cell holding the edit distance between one such pair, filled outward from the empty-prefix corner until the far corner gives the distance in full.',
    exemplarKeywords: [
      'edit distance table',
      'Levenshtein matrix',
      'kitten to sitting',
      'comparing two whole strings',
      'prefix against prefix',
      'sequence alignment grid',
      'how many edits between two words',
      'the bottom-right cell is the answer',
      'filling a grid diagonal by diagonal',
      'rows are one word, columns are the other',
    ],
  },

  briefing: {
    observable: [
      'The two words are the axes themselves — one written down the left edge letter by letter, the other across the top — so the grid is visibly made of the strings rather than merely accompanying them.',
      'The whole grid stands empty before any number appears, and the corner cell opens at 0 with the caption naming it as empty measured against empty.',
      'The top row and the left column simply count upward, and the caption there gives the reason: away from the corner each letter is one insertion or one deletion and there is nothing to choose.',
      'Values do not appear in place. Three neighbours of the target cell — above, to the left, and diagonally back — are outlined together, and then a single chip carrying a number flies out of one of them and lands in the cell, marked "+1" unless it arrived free.',
      'Several cells fill in the same step, and a dashed line sweeps across them, because a step here is a whole anti-diagonal whose cells do not read one another.',
      'Cells that were reached for free keep a faint tint after the highlight fades, and those tinted cells step down the diagonal where the two words share the run i, t, t.',
      'The sweep ends at the bottom-right cell, which swells and settles in its own colour while the caption states that this one cell answers for the whole pair: 3.',
    ],

    screen: {
      affordances: [
        'The grid fills itself after mount and stops on the answer cell, with the tinted free cells and the finished numbers left standing.',
        'Two buttons: Replay, and a step control that empties the grid and re-runs it one anti-diagonal at a time — the way to hold on a step while the chips are still in the air and the three outlined neighbours are visible.',
        'The two words are fixed at kitten and sitting, so an article can name them, name the answer, and point at the letters the reader will find on the two axes.',
      ],
    },

    useWhen: [
      'The article gives edit distance as a number and the reader has no idea what was measured. Here the two words are the axes and the number is the last cell, so the quantity and the thing it describes are on the same picture.',
      'The prose says the method works on "smaller subproblems" and the reader cannot tell what smaller means when there are two strings. Every cell is a pair of prefixes, one taken from each word, and the grid is exactly the set of those pairs.',
      'The reader assumes a table like this must be filled row by row and that the order is part of the method. Whole anti-diagonals landing at once shows the only real requirement is that the three neighbours already exist.',
      'A passage claims that letters the two words share make the comparison cheaper. The tinted cells running diagonally are where that discount accumulated, and they are still on screen after the run.',
    ],

    avoidWhen: [
      'The subject is recovering which edits were made — a traceback through the finished table, or the aligned strings printed against each other. The run stops once the grid is full and nothing walks back through it.',
      'The point is the contest inside a single cell, where three candidate values are weighed against one another. Only the winning neighbour sends anything here, so the two that lost are never shown as numbers.',
      'The article is about finding a pattern inside a text, where the answer is a position. What is measured here is the distance between two complete strings.',
      'The subject is keeping only two rows of such a grid to save space. The whole rectangle stays drawn from the first step to the last.',
      'The article gives the operations different prices, or counts a swap of adjacent letters as one move. Every step across this grid adds one, or nothing when the letters agree.',
      'The article means diffing files or revisions, or ranking fuzzy search results over a corpus. What is on screen is one pair of short words.',
    ],

    contrastWith: [
      {
        concept: 'editDistance',
        note: 'The grid and what is done with the finished grid: this ends when the last cell holds the answer, while that treats the cell as a starting point and walks back through the grid so the answer becomes a list of changes rather than a number.',
      },
      {
        concept: 'threeEditChoices',
        note: 'The grid and one of its entries: this settles which cells exist, how they are indexed and which of them is the answer, while that settles what decides the value inside any one of them.',
      },
      {
        concept: 'bottomUpTable',
        note: 'A general ordering principle against the shape one problem forces: that one claims a value is ready before it is needed, this one claims the readiness is achieved by making two strings the two axes and a cell a pair of prefixes.',
      },
      {
        concept: 'dynamicProgramming',
        note: 'Both are rectangles of subproblem answers, but one is indexed by items and a capacity and reports the best value obtainable, while this is indexed by two prefixes and reports a distance that cannot be improved on.',
      },
      {
        concept: 'naiveShiftByOne',
        note: 'Two questions asked of two strings: one asks whether the smaller occurs inside the larger and answers with a position, this asks how far apart two whole strings are and answers with a count.',
      },
    ],
  },
};
