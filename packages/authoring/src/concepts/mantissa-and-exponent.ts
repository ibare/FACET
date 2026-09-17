/**
 * mantissaAndExponent 개념 선언.
 *
 * canonical facet 은 `facet:mantissaAndExponent` — float32 로 적은 6.25 의 서른두
 * 비트가 두 자리에서 끊겨 셋으로 갈리고, 각 토막이 제 밑에서 읽힌 뒤 다시 한 줄의
 * 식으로 모여 처음 그 수가 되는 조각이다. 손잡이는 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나 (특히 unevenFloatGaps 와)
 *
 * 이 개념과 `unevenFloatGaps` 가 가장 붙는다 — 이웃까지의 거리가 2^(지수−가수비트)
 * 라 곧 가수·지수 이야기이기 때문이다. **층위로 갈랐다.**
 *
 *   이 개념           수 **하나의 안쪽**. 비트열이 어떻게 갈려 그 수를 이루는가.
 *   unevenFloatGaps   값과 값 **사이**. 이웃까지의 거리가 어떻게 변하는가.
 *
 * 그래서 definition 에서 이쪽은 '세 토막 · 치우침 · 숨은 1 · 도로 조립' 을 말하고
 * 거리 어휘(spacing · neighbour · gap)를 한 번도 쓰지 않는다. 저쪽은 거꾸로
 * 'mantissa' 와 'exponent' 라는 말 자체를 definition 에서 쓰지 않는다.
 *
 * 배분을 고르는 일은 `floatingPoint`, 담기지 않는 값은 `unrepresentableFraction`
 * 의 몫이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const mantissaAndExponentConcept: FacetConceptSource = {
  id: 'mantissaAndExponent',
  label: 'Mantissa and Exponent (How One Number Is Assembled)',
  canonicalFacet: 'facet:mantissaAndExponent',

  surface: {
    definition:
      'The three fields a single stored number is cut into — a sign, an exponent held with a constant subtracted from it, and a fraction whose leading one is never written — and the arithmetic that puts them back together.',
    exemplarKeywords: [
      'sign exponent mantissa',
      'significand',
      'exponent bias 127',
      'the hidden bit',
      'implicit leading one',
      'normalized form',
      'reading the bits of a float',
      'float32 bit layout',
      '1.xxx times two to the n',
      'how a float is laid out in memory',
      'why the exponent field reads larger than the exponent',
      'twenty-three bits but twenty-four of significand',
    ],
  },

  briefing: {
    observable: [
      'One value opens at the top tagged float32, and a row of thirty-two cells beneath carries the bits that value actually has rather than a drawn-in pattern.',
      'Two cut marks drop onto the row, the three runs slide apart into separate groups and take on three colours, and a bracket with a name and a count settles under each — sign · 1, exponent · 8, mantissa · 23.',
      'Each group’s reading appears directly beneath that group rather than in a gauge off to the side, so the number being read never leaves the bits it came from.',
      'The exponent is first read as a plain 129; a note reading bias 127 then rises under it and the 129 fades down into 2, with the note staying to say why the value changed.',
      'The mantissa is written in two registers at once — its fraction in binary as 0.1001 with the trailing zeros trimmed, and its decimal value beneath — while all twenty-three cells stay on the row.',
      'A dashed cell holding 1 slides into the empty space in front of the mantissa group under the label hidden 1, and at that same moment the binary note becomes 1.1001 and the decimal reading swaps up; the cell is dashed because it is not one of the stored bits.',
      'The three readings then travel out of their groups into a single line and stand as an expression — the sign, the significand, a two raised to the exponent, and the result — with the exponent shrinking into a superscript as it moves.',
      'Two underlines are drawn at the same instant, one under the value at the top and one under the assembled result, which is how the screen closes: what came apart is the number it started as.',
      'A caption under the board names the step in progress at each moment.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole decomposition on its own and stops on the assembled expression.',
        'Two buttons: Replay, and a step control that rewinds to the intact row and advances one moment per press, which is how a reader can hold still on the bias being subtracted or on the dashed cell arriving.',
        'The value and the division of the bits are fixed at one number and a 1 / 8 / 23 split, so an article can name the exponent field, the constant taken from it, and the fraction by their actual values.',
      ],
    },

    useWhen: [
      'The article says a float holds a number "in scientific notation" and the reader cannot see where the parts are kept. One row breaking in two places, and the three pieces recombining into the number it started as, is that sentence made literal.',
      'The prose has to account for an exponent field that reads 129 when the exponent is 2, and the reader takes it for an error or an off-by-one. The constant rising into place beneath the field, and staying there after the value drops, is the explanation.',
      'A reader is being told that a fraction field of twenty-three bits carries twenty-four bits of significand, and needs the leading one to be visibly absent from storage rather than asserted to be implied.',
      'The article names a field of an encoding and needs the reader to know which bits it means before the prose can say anything about its width or its range.',
    ],

    avoidWhen: [
      'The subject is a value the format cannot hold exactly. The number taken apart here is one the format holds precisely, and it returns unchanged.',
      'The point is how far apart consecutive representable values sit. Only one number is opened here, and nothing is compared against its neighbour.',
      'The article is about deciding how many bits each field should get, or about comparing formats of the same width. The division is fixed on this screen and nothing moves it.',
      'The subject is zero, the very small values below the normal range, infinities, or not-a-number. Those are reserved codings of the exponent field and lie outside a screen that decomposes an ordinary normalized value.',
      'The article advises what to use for money or exact decimal amounts.',
      'The subject is a signed integer pattern, where the sign is a weighted place rather than a field standing on its own.',
      'The article uses "exponent" for exponentiation, exponential growth, or the cost of an algorithm.',
      'The article uses "mantissa" for the fractional part of a logarithm.',
    ],

    contrastWith: [
      {
        concept: 'unevenFloatGaps',
        note: 'One is the inside of a single number — which bits are which and what they read as; the other is the distance from one number to the next. The second follows from the first, but stating it takes no number apart.',
      },
      {
        concept: 'floatingPoint',
        note: 'That one decides how many bits each field is given and what the choice costs; this one takes the division as settled and reads the fields out.',
      },
      {
        concept: 'unrepresentableFraction',
        note: 'This takes apart a value the encoding holds exactly and reassembles it unchanged; that one is about a value for which no such exact assembly exists, however many bits the fraction is given.',
      },
      {
        concept: 'twosComplement',
        note: 'Both are conventions for reading a fixed-width pattern, but one gives the top place a negative weight and leaves every place’s meaning fixed, while here a second field shifts what all the remaining places are worth.',
      },
      {
        concept: 'positionalValue',
        note: 'Both read digits against place weights, but there the weights are pinned to a fixed point in the middle of the digits, and here they are moved by a number stored alongside them.',
      },
    ],
  },
};
