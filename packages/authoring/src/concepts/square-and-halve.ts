/**
 * squareAndHalve 개념 선언.
 *
 * canonical facet 은 `facet:squareAndHalve` — 밑 3, 지수 13 짜리 줄을 반으로 접어
 * 3¹³ 에 닿는 화면이다. 칸 하나의 가로 길이가 그 칸이 덮는 지수 폭이라, 접을
 * 때마다 칸 수는 반이 되고 칸 폭은 두 배가 된다. 짝 없이 남는 칸은 아래 자리표의
 * 제 폭과 꼭 맞는 자리에만 앉고, 빈 채 남는 자리 하나가 1101 의 0 이다. 곱셈은
 * 여섯 번 (제곱 셋 + 답곱 셋), 하나씩 곱했다면 열두 번.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 옆 개념과 어떻게 갈랐나
 *
 * `halveTheRange` · `binarySearch` 도 「절반씩 줄인다」를 말한다. 저쪽이 반으로
 * 줄이는 것은 **찾을 범위**이고 줄인 쪽은 버린다. 이쪽이 반으로 접는 것은
 * **지수**이고, 접힌 절반은 버려지는 것이 아니라 남는 칸의 **제곱으로 흡수된다.**
 * definition 의 주어를 「거듭제곱을 셈하는 일」로 두고 keywords 도 지수 어휘만
 * 갖는다. `depthDoublesCount` 와는 로그의 출처가 다르다 — 저쪽은 트리의 층,
 * 이쪽은 지수의 이진 표기다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const squareAndHalveConcept: FacetConceptSource = {
  id: 'squareAndHalve',
  label: 'Square and Halve (Fast Power from the Binary Exponent)',
  canonicalFacet: 'facet:squareAndHalve',

  surface: {
    definition:
      'Computing a power by squaring the base while halving the exponent, taking the current square into the answer wherever the exponent is odd, so the cost follows the digits of the exponent rather than its size.',
    exemplarKeywords: [
      'exponentiation by squaring',
      'binary exponentiation',
      'fast power',
      'repeated squaring',
      'square and multiply',
      'x to the n in log n multiplications',
      'modular exponentiation',
      'pow implemented by halving the exponent',
      'the one bits of the exponent',
      'raising a number to a large power',
      'why the exponent is written in base two',
    ],
  },

  briefing: {
    observable: [
      'A row of thirteen cells each holding 3 stands above four dashed empty slots that are drawn before anything happens, each slot as wide as one binary place — eight, four, two, one.',
      'The width of a cell is the exponent it covers, so folding halves the number of cells and doubles the width of each, and the length of the whole row always reads as the exponent still unspent.',
      'A fold moves the right half bodily over the left half and each pair lands together as one cell, whose number is the square of the one before it: 3 becomes 9, 9 becomes 81, 81 becomes 6561.',
      'When the count is odd the unpaired cell leaves the row and settles into the slot its own width fits, carrying a 1 down to the digit line; when the count is even only a 0 drops, and the slot for two is the one left empty.',
      'Reading the digit line left to right gives 1101, and the three occupied slots hold 3, 81 and 6561 — the correspondence is settled by which slot each cell fits into rather than by the caption asserting it.',
      'A running line under the slots collects the cells that were taken, reading 3, then 3 x 81 = 243, and finishing as 3¹³ = 3 x 81 x 6561 = 1594323.',
      'The closing caption reports six multiplications against twelve and splits the six into three squarings and three products.',
    ],

    screen: {
      affordances: [
        'The screen folds the row all the way down on its own and stops with the product standing and the landed cells bobbing once.',
        'Two buttons: Replay, and a step control that rewinds and then walks the same folds one at a time, which is how a reader can sit on the moment the count is tested for being odd.',
        'The base and the exponent are fixed at three and thirteen, so an article can name 1594323, the six against twelve, and the digits 1101.',
      ],
    },

    useWhen: [
      'The prose states that raising a number to the nth power takes about log n multiplications and the reader has no way to see where the logarithm enters. The row is as long as the exponent left to spend and every fold halves it, so the number of folds is the number of digits the exponent has in base two.',
      'The article claims the factors multiplied into the answer are exactly the 1 digits of the exponent, and it reads as a coincidence the reader would have to check afterwards. A leftover cell can only come to rest in the slot its own width matches, so the claim is decided by fit before any digit is written down.',
      'A reader grants that folding is faster but not that it computes the same number, because each fold seems to throw away half the multiplications. Nothing leaves except the odd cell: the half that disappears is absorbed into the square that the surviving cell now holds.',
    ],

    avoidWhen: [
      'The subject is exponentiation under a modulus, where reducing after every multiplication is the point. Nothing is reduced here and the numbers are allowed to grow to 1594323.',
      'The article raises a matrix, a permutation, or a repeated transformation to a power. The same trick applies to those, but every cell on this screen holds one plain number.',
      'The point is what a single multiplication costs once the operands are enormous. Every multiplication counts as one here regardless of the size of what is multiplied.',
      'The subject is converting numbers between bases, or printing digits in some other base. The only split performed here is in two, and base two is a result rather than the topic.',
      'The article is about divide and conquer that solves both halves and combines the answers. A fold leaves a single row, and there is never a second half waiting to be returned to.',
    ],

    contrastWith: [
      {
        concept: 'fastPower',
        note: 'The same scheme asked about twice over: this settles how the folding works and why the odd steps are exactly the ones the answer takes, while that one takes the mechanism as given and weighs what it costs against multiplying one at a time.',
      },
      {
        concept: 'halveTheRange',
        note: 'Both halve something every step, but one halves a set of candidates to close in on a value that already exists, while this halves an exponent and pays for the reduction by squaring what it keeps.',
      },
      {
        concept: 'binarySearch',
        note: 'Halving is common to both and what becomes of the discarded half is not: there the rejected side is never examined again, here the folded half survives inside the square of the side that remains.',
      },
      {
        concept: 'depthDoublesCount',
        note: 'Both end at a base-two logarithm from opposite sources — there it follows from a shape whose positions double at every level, here from how one number is written in base two.',
      },
    ],
  },
};
