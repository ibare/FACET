/**
 * digitByDigit 개념 선언.
 *
 * canonical facet 은 `facet:digitByDigit` — 줄 · 통 열 · 장부의 세 켜로, 낮은
 * 자리부터 한 자리씩만 보는 라운드가 앞 라운드의 순서를 지키며 쌓이는 것을
 * 보이는 조각(piece)이다. 라운드마다 장부에 한 줄이 남아 셋이 함께 보인다.
 *
 * 묶음 안에서의 자리 — 완제품 `radixSort` 는 한 라운드의 안쪽 절차(세기 ·
 * 누적합 · 뒤에서부터 놓기)와 그 값을 말한다. 이 조각은 그 절차를 열지 않고
 * **왜 한 자리씩만 봤는데 전체가 서는가** 하나만 말하고 멈춘다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const digitByDigitConcept: FacetConceptSource = {
  id: 'digitByDigit',
  label: 'Digit by Digit (Why the Passes Accumulate)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:digitByDigit',

  surface: {
    definition:
      'Why repeated single-place passes end up ordering a whole list: each pass starts from the lowest place and leaves untouched the order the previous pass produced.',
    exemplarKeywords: [
      'why does radix sort work',
      'stability is required',
      'least significant digit first',
      'ties keep their earlier order',
      'scatter and gather',
      'bucket by digit then read back',
      'each pass builds on the last',
      'sorting without ever comparing',
      'leading zeros pad the columns',
      'ten bins',
    ],
  },

  briefing: {
    observable: [
      'Three bands stack down the screen: the current row of numbers on top, ten bins in the middle, and a ledger at the bottom that keeps one line for every finished round.',
      'Each number is drawn as separate character cells and only the cell being read this round is sharp; a marker under that cell moves one column leftward at the start of each round.',
      'The whole row drops into the bins at once and is lifted back out reading the bins in order, and inside a bin the values stack in the order they arrived.',
      'The ledger keeps all the finished rows on screen together, so the row after the ones place, after the tens and after the hundreds can be read against each other rather than remembered.',
      'Movement is the only thing that happens to a number — a value keeps the same size and the same drawing whatever it is worth, because none of them is ever weighed against another.',
      'Numbers are padded with leading zeros to a common width so the columns line up, which is why a two-digit value has a cell to read in the hundreds round.',
      'The closing caption states the number of rounds together with a comparison count of zero.',
    ],

    screen: {
      affordances: [
        'The screen runs every round on its own and stops with the sorted row on top and the full ledger below it.',
        'Two buttons: Replay, and a step control that repeats the rounds one move at a time, which is how the moment of dropping into the bins can be held next to the moment of lifting back out.',
        'The four values are fixed and small enough that a reader can check any round by eye.',
      ],
    },

    useWhen: [
      'The reader accepts that one pass can order by a single place but expects the next pass to destroy that work. Three rounds accumulating in the ledger, each keeping what the last produced, is the answer to that specific doubt.',
      'The article needs to make stability a requirement rather than a pleasant property — inside a bin the arrival order is visibly the thing carrying the previous round forward.',
      'The prose has claimed that ordering does not require comparing, and the reader wants to know what replaces the comparison. Here a value is asked for one of its own digits and goes where that digit says.',
    ],

    avoidWhen: [
      'The article needs the mechanics inside one pass — how the bins are counted, how positions are computed, or where a value physically goes. The row here drops in and lifts out whole.',
      'The subject is choosing a base, the memory the bins cost, or handling negative, fractional or variable-length keys.',
      'The article is about reading a number digit by digit for a different purpose — checksums, digital roots, manual long division, or per-character string processing.',
    ],

    contrastWith: [
      {
        concept: 'radixSort',
        note: 'This argues that the rounds accumulate into a whole ordering; the method is how one round is carried out, counting a digit and turning the counts into seats.',
      },
      {
        concept: 'sortStability',
        note: 'There stability is a property a sort may or may not have; here it is the load-bearing assumption without which the earlier rounds would be erased.',
      },
      {
        concept: 'countThenPlace',
        note: 'Both replace comparing with reading a key, but one counts occurrences of the value itself and this repeats the idea over one place at a time.',
      },
    ],
  },
};
