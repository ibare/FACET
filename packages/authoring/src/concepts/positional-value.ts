/**
 * positionalValue 개념 선언.
 *
 * canonical facet 은 `facet:positionalValue` — 45 를 여덟 자리로 적고, 켜진 자리
 * 넷을 더해 그 수로 되돌아온 뒤, 같은 비트를 셋씩·넷씩 다시 끊어 8진과 16진으로
 * 읽는 조각이다. 네 줄이 모두 같은 폭을 차지하는 것이 그림의 주장이다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩만 딸려 있다 — 수도 폭도 고를 수
 * 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 형제 `twosComplement` 가 세 자리를 이미 갈라 두었고 이 파일은 그 분배를 받는다.
 *
 *   twosComplement   읽는 약속. 폭이 약속의 일부라 같은 비트열이 두 수다.
 *   이 개념          **한 수를 적는 일**. 자리값의 합으로 쪼개고 밑을 바꿔 다시
 *                    적는다. 부호가 없고, 비트는 하나도 바뀌지 않는다.
 *   negateAndAddOne  음수를 만드는 절차. 뒤집고 하나 더한다.
 *
 * 그래서 keywords 는 **진법 변환 어휘**(밑 · 16진 · 셋씩 넷씩 끊기 · 앞의 0)를
 * 가져간다. 폭 · 형 변환 · 부호 확장은 형제가, 절차 어휘는 negateAndAddOne 이
 * 갖는다.
 *
 * avoidWhen 이 막아야 하는 것: definition 에 "base" 와 진법 어휘가 있는 한
 * 데이터베이스 · 이진 탐색 · 이진 트리 · 바이너리 파일 글이 걸린다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const positionalValueConcept: FacetConceptSource = {
  id: 'positionalValue',
  label: 'Place Value and Base (One Number, Three Notations)',
  canonicalFacet: 'facet:positionalValue',

  surface: {
    definition:
      'Positional notation: a whole number is the sum of the weighted places that are on, and regrouping those same digits into larger units rewrites it in another base.',
    exemplarKeywords: [
      'place value',
      'positional notation',
      'base 2, base 8, base 16',
      'binary to hexadecimal',
      'converting a number between bases',
      'hex notation such as 0x2D',
      'octal',
      'a nibble is four bits',
      'grouping bits three or four at a time',
      'powers of two as place weights',
      'a digit times its weight',
      'leading zeros that are not written',
      'the same number written another way',
    ],
  },

  briefing: {
    observable: [
      'Four rows are stacked and every one of them spans exactly the same width, from the decimal number at the top down to the two hexadecimal pieces at the bottom; a mono mark in the left gutter names each row\'s base as 10, 2, 8 and 16.',
      'The number starts as a single block that grows outward from its centre, then splits into eight cells that drop into the row below while gaps open between them left to right, as if a knife passed along the row.',
      'Each cell carries two things: its place weight in small type above — 128, 64, 32, 16, 8, 4, 2, 1 — and its bit below.',
      'Only the cells holding 1 change colour, and they lift slightly off the row; the caption then names them by value rather than by position: "The places that are on: 32, 8, 4, 1."',
      'Those four values fly up as chips out of their own cells and land in the space the original block left behind, assembling into 32 + 8 + 4 + 1 = 45 — and the vacated outline, dashed while empty, turns solid once the sum fills it.',
      'For each new base the pieces first appear lying on top of the bit cells they cover, so which bits are about to become one digit is visible before anything moves, and only then do they drop to their own row and separate.',
      'Cutting three at a time leaves two bits stranded in the leftmost group, so eight bits become three pieces of sizes 2, 3 and 3; cutting four at a time divides evenly into two pieces.',
      'A group whose digit is a leading zero is written in muted type rather than removed, which is why the screen carries 0 5 5 while the caption reads "base 8 reads 55"; the hexadecimal row has no such group and reads 2D.',
      'At the end two accent-coloured vertical lines descend along the left and right edges of all four rows at once, and the closing caption states the conclusion the equal widths were making: "Three notations, one length, one number: 45."',
    ],

    screen: {
      affordances: [
        'The screen plays the whole decomposition on its own and stops on the last frame with all four rows standing.',
        'Under it sit a Replay button and a playback strip. Once the run has finished, moving the strip\'s handle to the regrouping is how a reader can hold still on it.',
        'The number is fixed at 45 in eight places, so an article can quote the exact places that are on, the sum, and both readings.',
      ],
    },

    useWhen: [
      'The article prints a value in hexadecimal or octal and the reader takes it for a different number rather than the same number cut at different points. The same unchanged row of bits, regrouped twice under a width that never moves, is the correction.',
      'The prose has to justify why 8 and 16 are the bases that sit beside binary while 10 does not: three bits land on exactly one octal digit and four on exactly one hexadecimal digit, and the screen performs both cuts on one row of bits.',
      'A reader needs "the number is the sum of the places that are on" to be something concrete before any encoding argument rests on it, and the four lit places lifting out and adding back to the original number is that step.',
      'The article has to explain why a written notation drops digits at the front — the stranded two-bit group is on screen as a muted zero, present in the picture and absent from the reading.',
    ],

    avoidWhen: [
      'The article uses "binary" for binary search, a binary tree, or any method that splits something in two. Nothing here is divided in half or searched.',
      'The article uses "binary" for a compiled executable or for binary rather than text data.',
      'The article uses "base" for a database, a codebase, a base class, or a baseline measurement.',
      'The subject is negative numbers or where a sign lives. Every place here weighs positive and the value never goes below zero.',
      'The subject is deriving one pattern from another — inverting the bits, adding one, producing an opposite. The bits here are never altered, only grouped differently.',
      'The point is per-bit operations or moving bits sideways: AND, OR, XOR, masks, shifts. No operation is applied to the row.',
      'The subject is fractional values or where a point sits. Every place here is a whole power of two and the smallest is one.',
      'The article is about a value that no longer fits what holds it — a wrap, a truncation, a discarded high bit. The number here fits with places to spare, and the empty places at the front stay empty.',
      'The subject is the order bytes take in memory. Nothing here concerns addresses or which end a value begins at.',
    ],

    contrastWith: [
      {
        concept: 'twosComplement',
        note: 'This is about writing a number down: the base varies and the count of places is only how far the writing runs. That one is about reading a written pattern, where the count of places is itself part of the claim and the base never changes.',
      },
      {
        concept: 'negateAndAddOne',
        note: 'Both work over one row of bits, but here no bit is ever altered — the row is only cut at different points — while that one changes every position to arrive at a different number.',
      },
      {
        concept: 'floatingPoint',
        note: 'Both describe places carrying weights, but here the weights are whole powers of two down to one, while there the weights continue past the point and the exponent decides where the row of places is anchored.',
      },
    ],
  },
};
