/**
 * severalHashesOneValue 개념 선언.
 *
 * canonical facet 은 `facet:severalHashesOneValue` — "한 값이 어떻게 자리 여럿이
 * 되는가" 한 질문에만 답하고 멈추는 짧은 화면이다. 값 셋이 차례로 제 줄에 앉고,
 * 줄 끝의 한 점에서 갈래 셋이 서로 다른 호를 그리며 열여섯 칸 배열의 서로 다른
 * 칸으로 날아간다.
 *
 * 스스로 재생하고 멈춘다. 독자가 값을 넣거나 해시 수를 고르는 자리는 없고,
 * 다시 보기와 한 걸음씩 짚기만 기다린다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념이 말하는 것은 **넣는 일 하나** 다 — 값은 저장되지 않고 표식만 남으며,
 * 그 표식이 값 하나당 여럿이라는 것. 묻기도 지우기도 여기 없다. `bloomFilter`
 * 는 그 갈래 수를 고를 것으로 다루고, `wrongInOneDirection` 은 남은 표식에서
 * 무엇을 읽어도 되는지를, `cannotUnset` 은 그 표식을 되돌릴 수 없음을 맡는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const severalHashesOneValueConcept: FacetConceptSource = {
  id: 'severalHashesOneValue',
  label: 'One Value Lights Several Positions',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:severalHashesOneValue',

  surface: {
    definition:
      'Adding a value to a Bloom filter stores none of the value itself: several hash functions each select one position in a bit array, and every selected position is set to 1.',
    exemplarKeywords: [
      'double hashing',
      'k hash functions',
      'set the bits',
      'add to a Bloom filter',
      'h1 + i * h2',
      'one key many positions',
      'bit array insertion',
      'which bits does a key turn on',
      'deriving several hashes from two',
      'the key itself is never stored',
    ],
  },

  briefing: {
    observable: [
      'Values arrive one at a time, each sliding in from the left onto a row of its own and staying there — what arrives is never taken off the board.',
      'Each row carries the two base hash numbers it was given, and once the branches land the row rewrites them as the list of positions they reached, so the input and the outcome sit on one line.',
      'Three branches leave a single dot at the right end of the row along three separate arcs, each carrying the number of the cell it is heading for, and fold into that cell on landing — one departure point, three destinations.',
      'The arcs stay faintly drawn after the branches land, so two rows reaching the same cell shows up as two arcs converging on it.',
      'A cell is filled in the colour of the value that lit it, and a cell claimed by two values is split down the middle and carries both colours at once.',
      'When a branch reaches a cell already at 1, a ring pulses twice around it and the caption says it stays 1 — the second arrival leaves nothing behind.',
      'A line sweeps left to right at the end, lifting the lit cells as it passes, and the closing tally is seven of sixteen although three values times three branches is nine.',
    ],

    screen: {
      affordances: [
        'Three insertions play through unattended and the screen stops on the tally of lit cells.',
        'Two buttons: Replay, and a step control that rewinds to an empty array and advances one moment per press, which is how the branches of one value can be watched leaving separately.',
        'The array is sixteen cells and the three values are fixed, with every position computed from the two base hashes rather than written in, so the arithmetic can be repeated by hand.',
      ],
    },

    useWhen: [
      'The prose says a value is "added to" the filter and the reader pictures it being kept somewhere inside. A row that stays put while three numbered branches fly off it into separate cells is what separates the value from the marks it leaves.',
      'The article is about to claim the array fills more slowly than insertions multiply, and the reason has to land before the claim does. Two of the nine branches arriving where a branch already arrived, and the total closing at seven, supplies it.',
    ],

    avoidWhen: [
      'The question is whether a value is in the filter. Nothing is looked up here; the run only puts things in.',
      'The subject is taking a value back out, or why that cannot be done. Cells only ever move from 0 to 1 in this run.',
      'The article is about how many hashes to use or how large to make the array. Both are fixed throughout and nothing varies them.',
      'The point is a key being turned into an index for a table that will then hold the key. What arrives in a cell here is a mark, and the value is kept nowhere.',
    ],

    contrastWith: [
      {
        concept: 'bloomFilter',
        note: 'This asserts only that one value becomes several marks; the other treats how many marks and how much room as quantities that have to be chosen against each other.',
      },
      {
        concept: 'hashToBucket',
        note: 'Both turn a key into a position by arithmetic, but one key reaches one bucket that will hold it, while here one key reaches several positions and is held at none of them.',
      },
      {
        concept: 'wrongInOneDirection',
        note: 'One is about what putting a value in does to the array, the other about what may be concluded from the array once the values are in.',
      },
      {
        concept: 'cannotUnset',
        note: 'Both turn on positions shared by several values, but here the sharing is a harmless coincidence of insertion, and there it is the reason a removal cannot be performed.',
      },
      {
        concept: 'chainingBucket',
        note: 'Both face two keys wanting one position, but a bucket keeps both keys and can tell them apart later, while a bit already at 1 keeps nothing and cannot.',
      },
    ],
  },
};
