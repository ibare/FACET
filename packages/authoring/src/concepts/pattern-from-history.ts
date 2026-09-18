/**
 * patternFromHistory 개념 선언.
 *
 * canonical facet 은 `facet:patternFromHistory` — T N T N … 로 번갈아 가는 분기 열두 번을,
 * 지난 두 결과를 칸 이름으로 삼는 1비트 칸 넷(TT · TN · NT · NN, 처음엔 모두 N)으로 짐작하는
 * 한 장면이다. 처음 세 번을 틀리고 나머지 아홉 번을 잇달아 맞힌다. NN 칸은 끝까지 쓰이지
 * 않는다. 손잡이는 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * branchHistoryTable(완제품)과 가장 붙는다. 둘 다 "이력이 칸을 고른다" 이므로 **주장**을
 * 갈랐다 — 저쪽은 이력의 길이를 고르는 맞바꿈, 이쪽은 이력이 무엇을 기억하느냐.
 *
 *   이 definition 은 'followed' · 'pair' · 'alternating' · 'entry' 를 갖고,
 *   'counter' · 'doubles' · 'length' · 'period' · 'table' 을 쓰지 않는다 (저쪽 몫).
 *   unpredictableBranch 의 'chance' · 'random' · 'half' · 'independent' 도 쓰지 않는다.
 *
 * 화면이 실제로 카운터를 그리지 않는다 — 칸마다 1비트이고 길이 손잡이도 없다. 그래서
 * 'counter' 를 빼는 것이 어휘 배타의 정당한 경우다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const patternFromHistoryConcept: FacetConceptSource = {
  id: 'patternFromHistory',
  label: 'Prediction from the Last Few Outcomes',
  canonicalFacet: 'facet:patternFromHistory',

  surface: {
    definition:
      'Remembering what followed each recent pair of outcomes: the last two results name an entry that stores the next one, so an alternating taken, not-taken branch is guessed right once those entries are written.',
    exemplarKeywords: [
      'history-based branch prediction',
      'correlating the next outcome with the previous ones',
      'alternating branch T N T N',
      'what came after this history last time',
      'pattern recognition in branch predictors',
      'why a bias counter fails on alternating branches',
      'if-else that flips every iteration',
      'i % 2 branch',
      'context-based prediction',
      'learning a sequence of taken and not taken',
    ],
  },

  briefing: {
    observable: [
      'Twelve outcomes lie on a strip in the order T N T N …, with a guess row above them and a legend naming T as taken and N as not taken.',
      'A highlighted window wraps the last two outcomes. At every step a copy of those two letters drops into the table below and settles on the cell with the same name — TT, TN, NT or NN.',
      'The guess rises from that cell to the guess row, then the real outcome descends into the same cell and is written there; finally the window slides one place along the strip.',
      'All four cells start holding N. The first three guesses are wrong: the opening history TT lies outside the alternating rhythm and misleads twice, and the TN cell still holds its starting N when first visited.',
      'After those three the window only ever lands on TN and NT, and each has already been written with the right answer — TN is followed by T, NT by N — so the remaining nine guesses are all correct.',
      'The NN cell is never visited, because this sequence never has two not-takens in a row, and it keeps its starting value to the end.',
      'The closing caption reads "Wrong 3 of 12." and "The last 9 in a row were right."',
    ],

    screen: {
      affordances: [
        'The screen plays all twelve branches and the closing tally on its own and then stops.',
        'A Replay button and a playback strip sit underneath. Once the tally is up, dragging the strip back to a step is how a reader can hold the moment a history copy lands on its cell, or the third step where the TN cell is corrected.',
        'The outcome sequence, the starting history TT and the starting cell value N are fixed, so an article can name the exact steps that miss and the cell that is never touched.',
      ],
    },

    useWhen: [
      'The article must show that a predictor can learn order, not just frequency. An alternating branch has no majority to lean toward, and the reader needs to see the answer come from what preceded it instead.',
      'The reader should see why the early misses happen and why they stop: each miss is a cell being written for the first time, and once every cell the sequence uses holds its answer, nothing more goes wrong.',
      'The text says "the predictor remembers the pattern" and needs the concrete storage behind that phrase — one slot per recent two-outcome history, holding what came next.',
    ],

    avoidWhen: [
      'The article is about choosing how many past outcomes to keep or how large a predictor table should be. The history here is fixed at two.',
      'The subject is the two-bit saturating counter or hysteresis. Each cell here holds a single bit that is simply overwritten.',
      'The branch in question is data-dependent with no rhythm to learn. This sequence is perfectly regular by design.',
      'The article uses "pattern" for regular expressions or string matching, or "history" for undo stacks and browser history.',
      'The subject is sequence prediction in machine learning — n-gram language models or recurrent networks. The shape is related but the object here is a conditional jump in a processor.',
    ],

    contrastWith: [
      {
        concept: 'branchHistoryTable',
        note: 'This asserts what a history buys — the next outcome is looked up under what just happened; that one takes the same mechanism and prices it, asking how many past outcomes are worth their doubling storage.',
      },
      {
        concept: 'saturatingCounter',
        note: 'A counter remembers which way the branch has leaned lately and so is wrong every other time on an alternating branch; remembering what followed each context turns the same rhythm into something fully predictable.',
      },
      {
        concept: 'oneBitDoubleFault',
        note: 'Both store a single bit that is overwritten by the latest outcome. With one bit for the whole branch, every change of direction costs a miss; with one bit per recent history, a change of direction is exactly what gets remembered.',
      },
      {
        concept: 'unpredictableBranch',
        note: 'The same kind of memory meets two kinds of branch: here the next outcome is fully determined by the previous two, there it is determined by nothing that came before.',
      },
    ],
  },
};
