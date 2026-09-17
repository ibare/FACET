/**
 * editDistance 개념 선언.
 *
 * canonical facet 은 `facet:editDistance` — 완제품이다. 왼쪽에 `intention` ×
 * `execution` 의 10 × 10 표가 조용히 차고, 마지막 칸의 수가 오른쪽 «답» 으로 올라간다.
 * 그 뒤 마지막 칸에서 구석까지 길이 그어지고 길 위의 칸이 한 일로 물든다 — 지움 ·
 * 넣음 · 바꿈 · 그냥 지나감. 오른쪽에는 그 길을 읽는 차례로 되돌려 놓은 번호 붙은
 * 고침 목록이 서고, 한 줄이 붙을 때마다 그 칸에 테가 둘린다. 손잡이는 교체 비용
 * (1 · 2 · 3)이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 조각 둘 다 **다 채운 표를 보이는 데까지**이고 둘 다 되짚지 않는다. `editTableFill`
 * 은 **표의 모양**을, `threeEditChoices` 는 **한 칸의 규칙**을 주어로 삼는다. 이쪽
 * definition 의 주어는 **고침 목록을 되찾는 일** 이다 — 다 찬 표를 마지막 칸에서
 * 거꾸로 짚는 것, 그리고 무엇을 비싸게 매기느냐가 그 목록을 통째로 갈아 끼운다는 것.
 * 되짚기도 값 매기기도 조각 어느 쪽에도 없다.
 *
 * 비용 2 와 3 에서 답이 똑같이 8 인데 목록이 다르다는 것이 이 화면의 가장 좋은
 * 관찰이라 observable 에 그대로 적었다 — 수 하나가 방법 하나를 뜻하지 않는다는 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const editDistanceConcept: FacetConceptSource = {
  id: 'editDistance',
  label: 'Edit Distance (Walking Back for the List of Fixes)',
  canonicalFacet: 'facet:editDistance',

  surface: {
    definition:
      'Recovering the edits that turn one string into another by walking the finished distance table backward from its last cell, where the price put on substitution changes which list of edits comes out.',
    exemplarKeywords: [
      'edit script',
      'traceback through a filled table',
      'which operations were actually performed',
      'diff between two strings',
      'weighted edit distance',
      'making substitution expensive',
      'Levenshtein with operation costs',
      'spelling correction suggestions',
      'aligning two sequences and reporting the changes',
      'one distance reached by different routes',
    ],
  },

  briefing: {
    observable: [
      'The left half is a ten-by-ten grid with one word down its edge and the other across its top, and the numbers fill in quietly from the corner outward, because the filling is the premise here rather than the point.',
      'The number in the last cell is lifted out into an Answer readout on the right, so the quantity and the grid it came from stand apart before anything is done with either.',
      'A path is then drawn from that last cell back to the corner as a chain of straight lines between neighbouring cells, and each cell on it takes the colour of what was done there — deleting, inserting, replacing, or passing through unchanged.',
      'On the right the same path appears as a numbered list read the other way round, each line carrying a colour patch matching its cell and a phrase naming the character involved.',
      'As each line is added the cell it came from takes a ring, so a line in the list and a cell in the grid are visibly one event seen twice.',
      'Pushing the handle refills the same grid for the same two words and the list changes outright: at a substitution price of one it is five replacements; at two it is three replacements with a deletion and an insertion mixed in; at three there are eight fixes and not one replacement among them.',
      'At the highest price the path itself bends away from the diagonal toward the edge of the grid, so the change of plan is legible in the shape of the route and not only in the list beside it.',
      'The answer reads eight at both the second and the third handle position, so the same number stands over two different lists — the distance alone does not say what was done.',
      'Three readouts run underneath: the total cost, how many fixes there were, and how many of those were replacements, and it is the last that the handle drives from five down to zero.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: a three-position slider for what a substitution costs, at one to begin with. Insertion and deletion stay at one throughout, so only one price ever moves.',
        'The two words are fixed and the grid is ten by ten, with every number worked out during the run rather than written into the declaration.',
        'The fix list holds eight lines, which is exactly as long as it ever gets, at the highest substitution price.',
        'Ties are broken diagonal, then up, then left, both when filling and when walking back, so the drawn route agrees with the neighbour the table actually chose.',
        'The code panel puts the filling and the walking back in one procedure, which is the pairing the two halves of the screen show.',
      ],
    },

    useWhen: [
      'The article gives a distance as a number and then talks about the changes it stands for without ever connecting the two. The route drawn back through the grid and the numbered list beside it are one object read two ways, and each line rings the cell it came out of.',
      'A reader assumes the cheapest repair is a property of the two words alone. The same pair under three prices yields five replacements, then a mixture, then no replacement at all, so what comes out is shown to depend on what was declared expensive.',
      'The prose has to admit that a minimum can be reached by more than one route without that counting as a flaw. Two handle positions give the identical total over different lists, and the rule that settles which route gets drawn is stated rather than hidden.',
    ],

    avoidWhen: [
      'The subject is the shape of the grid, what a cell stands for, or the order its cells are filled in. The filling happens here as a premise and no caption accounts for it.',
      'The point is the contest inside one cell between three candidate values. Only the winning route is drawn here and the offers that lost are never shown as numbers.',
      'The article is about locating one string inside another, where the answer is a position. What is measured here is the distance between two complete words and what would have to be done to close it.',
      'The article counts a swap of two adjacent characters as one move, or needs insertion and deletion to carry prices of their own. Those two are held at one here and only substitution is priced.',
      'The subject is approximate matching at scale — spelling suggestions ranked over a dictionary, fuzzy joins, results ordered by closeness. One pair of words is on screen.',
      'The subject is keeping only two rows of such a grid to save room. The whole rectangle stays drawn from the first step to the last.',
    ],

    contrastWith: [
      {
        concept: 'editTableFill',
        note: 'The grid and what is done with the finished grid: that one ends when the last cell holds the answer, while this treats that cell as a starting point and claims the route leading to it is the thing worth having.',
      },
      {
        concept: 'threeEditChoices',
        note: 'One decision against the chain of them: that one is about which of three offers wins inside a single cell, while this follows the winners end to end and shows that repricing one of the three swaps the whole chain for another.',
      },
      {
        concept: 'dynamicProgramming',
        note: 'Both fill a rectangle of subproblem answers exactly once, but one reports the best value obtainable and is finished there, while this reads the filled rectangle backward so the answer arrives as a sequence of moves rather than a number.',
      },
      {
        concept: 'naiveShiftByOne',
        note: 'Two questions asked of two strings: one asks where the shorter sits inside the longer and answers with a position, while this asks what would have to be done to turn one into the other and answers with a list of changes.',
      },
    ],
  },
};
