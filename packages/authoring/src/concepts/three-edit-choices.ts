/**
 * threeEditChoices 개념 선언.
 *
 * canonical facet 은 `facet:threeEditChoices` — 조각이다. 표를 채우지 않는다.
 * 칸 넷짜리 창(정해질 칸과 이웃 셋)과 오른쪽 비용 사다리가 전부이고, `kitten` ·
 * `sitting` 의 표에서 손으로 고른 칸 셋을 차례로 들여다본다. 이웃 셋의 값이 제
 * 레인으로 날아가 비용을 더하고 높이로 내려앉으면, 바닥에서 선이 올라와 가장 낮은
 * 것에 닿는다.
 *
 * ── 묶음 안에서의 자리 (편집 거리 계열)
 *
 * 완제품이 아직 없어 조각 둘이 이 토픽을 나눠 맡는다. 이쪽은 **한 칸의 규칙**
 * 이다 — 지우기 · 넣기 · 바꾸기 셋이 제 값을 내놓고 가장 싼 것이 이긴다는 결정
 * 하나. 표가 어떤 모양이고 어느 순서로 차는가는 `editTableFill` 의 몫이라
 * definition 에 축도 순서도 넣지 않았다.
 *
 * `takeBestNow` 와 헷갈리기 쉬운 자리다. 셋 중 최솟값을 집는 것이 탐욕처럼
 * 보이지만, 여기서 견주는 셋은 **이미 옳게 풀린 작은 답**이라 최솟값이 도박이
 * 아니라 강제다. 그 차이를 contrastWith 가 말하게 했고, definition 에서는 "greedy"
 * 라는 낱말 자체를 쓰지 않아 벡터가 붙지 않게 했다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const threeEditChoicesConcept: FacetConceptSource = {
  id: 'threeEditChoices',
  label: 'Three Ways into One Cell (Delete, Insert, Replace)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:threeEditChoices',

  surface: {
    definition:
      'The rule deciding one cell of an edit-distance table: three offers — the cell above plus a deletion, the cell to the left plus an insertion, the diagonal plus a substitution unless the letters agree — and the smallest of them wins.',
    exemplarKeywords: [
      'edit distance recurrence',
      'delete insert replace',
      'taking the minimum of three',
      'where a cell value comes from',
      'why matching letters are free',
      'the diagonal move costs nothing',
      'substitution cost',
      'a tie between two operations',
      'more than one shortest edit script',
      'three neighbours of a cell',
    ],
  },

  briefing: {
    observable: [
      'Only four cells are ever on screen: the one being decided, drawn as a dashed outline, and the three it reads from, each carrying its own coordinate in small type so the reader can tell which neighbour is which.',
      'The two words stand above as two rows of letters with a marker sliding along each, so the single pair of letters that meet at this cell is picked out of the words rather than asserted in the caption alone.',
      'To the right is a ladder of numbered lines with three lanes beneath it, named delete, insert and replace; low on the ladder means cheap, and that is the one convention the picture runs on.',
      'Each neighbour\'s value leaves its cell, flies into its own lane, picks up a badge reading "+1", and only then sinks to the height of its total — so the value and the price paid for it arrive as two separate events.',
      'The three totals come to rest at their own heights side by side, a line rises from the floor of the ladder until it meets the lowest of them, and the value it stops at is the one that then travels into the dashed cell, which turns solid around it while the losing chips sink out of the frame.',
      'When the two letters at a cell are identical the third lane renames itself to keep, its badge reads "+0" in the accent colour, and the two matching letters beside the cell are highlighted.',
      'Three cells are visited in turn and they end differently — one where a single offer is lowest, one where two chips come to rest at exactly the same height with the caption saying either path gives the same answer, and one where the letters match and the free diagonal alone is lowest.',
      'The numbering on the ladder does not change between the three visits, so the heights reached in one cell can be read against the heights reached in another.',
    ],

    screen: {
      affordances: [
        'The screen walks the three cells on its own and stops after the last decided cell rises and settles back.',
        'Two buttons: Replay, and a step control that takes each cell in four moments — opening it, letting the three offers arrive, weighing them, and moving the winner in. Stepping is the way to hold while the three chips stand at their heights and nothing has been chosen yet.',
        'The words and the three cells are fixed, so an article can name a cell by its coordinate and the reader will find that same coordinate written on the cell.',
      ],
    },

    useWhen: [
      'The article prints the recurrence as a formula with a minimum over three terms and the reader takes it as notation to be trusted. Three values standing at three heights with a line rising to the lowest gives the minimum as something that happens rather than something written.',
      'The prose names the operations — delete, insert, replace — and the reader cannot connect three words to three directions in a table. Each offer arrives from the neighbour that corresponds to it and lands in a lane that carries the operation\'s name.',
      'A passage needs the reader to accept that identical letters cost nothing, which is the one place the distance stops growing. The badge reading zero and the lane renaming itself is where that is visible instead of stated.',
      'The article claims that a minimum edit can be reached by more than one route. The cell where two offers come to rest level with each other is that claim standing on screen, and the caption says both paths end at the same answer.',
    ],

    avoidWhen: [
      'The subject is the shape of the whole table, the order its cells are filled in, or what the final cell means. Four cells are on screen at a time and no sweep over a grid ever happens.',
      'The article is about reading a finished table backwards to recover the operations actually performed. Each cell here is decided and then left; nothing returns to it.',
      'The operations in question carry different prices, or a swap of two adjacent letters counts as one move. Every offer on the ladder adds one, or nothing when the letters agree.',
      'The point is a rule that picks whatever looks best at the moment with no assurance about the result. The three values compared here are already settled answers, not impressions.',
      'The subject is approximate matching at scale — spelling correction, fuzzy joins, search ranking by closeness. One comparison inside one cell is the whole of what is shown.',
    ],

    contrastWith: [
      {
        concept: 'editTableFill',
        note: 'An entry and the grid holding it: this settles what fixes the value inside one cell, while that settles which cells exist, how they are indexed, and which of them answers the original question.',
      },
      {
        concept: 'takeBestNow',
        note: 'Both end by taking the cheapest option in view, but a greedy pick reads only the state reached so far and may later prove to have been wrong, whereas the three candidates here are already-correct answers to smaller problems, which makes the minimum forced rather than risked.',
      },
      {
        concept: 'greedyCanFail',
        note: 'Taking the local minimum is safe here and expensive there, and the difference is what is being compared: complete answers to subproblems in one case, and in the other whatever looks best before the rest of the problem has been solved.',
      },
      {
        concept: 'trustTheSmallest',
        note: 'Both answer by keeping the lowest of several numbers, but there the others are known to be inflated by counters shared with unrelated keys, while here each number is the genuine cost of one route and the lowest names the cheapest of them.',
      },
    ],
  },
};
