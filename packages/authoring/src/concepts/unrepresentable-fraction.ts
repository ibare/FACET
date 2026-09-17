/**
 * unrepresentableFraction 개념 선언.
 *
 * canonical facet 은 `facet:unrepresentableFraction` — 1/10 을 2 로 곱해 자리를
 * 하나씩 뽑고, 남은 값이 앞에 나온 것과 같아지는 순간 고리가 닫히며, 그릇이 차면
 * 꼬리가 잘리고 마지막 자리가 올림되는 조각이다. 손잡이는 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 넷 다 부동소수점을 다루므로 definition 의 주어를 갈랐다. 이 개념의 주어는
 * **값 자체의 성질**이다 — 십진에서 끝나는 소수가 2진에서는 끝나지 않는다는 것.
 * 형식이나 비트 배치가 아니다. 그릇(float32)은 끝나지 않는 것이 어디서 잘리는지를
 * 보이려고 등장할 뿐이라, 비트 배치 어휘는 `mantissaAndExponent` 에, 배분 어휘는
 * `floatingPoint` 에, 이웃 간격 어휘는 `unevenFloatGaps` 에 넘긴다.
 *
 * avoidWhen 이 특히 막아야 하는 것 — "0.1 이 정확하지 않다" 는 이 개념의 것이지만
 * **돈에는 십진 자료형을 쓰라**는 권고 글은 이 화면이 답하지 않는다. 화면은 다른
 * 표현을 내놓지 않고 끝나지 않는 까닭만 유도한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const unrepresentableFractionConcept: FacetConceptSource = {
  id: 'unrepresentableFraction',
  label: 'Unrepresentable Fraction (A Decimal That Never Ends in Binary)',
  canonicalFacet: 'facet:unrepresentableFraction',

  surface: {
    definition:
      'A decimal fraction that ends in base ten need not end in base two: doubling it returns a remainder already seen, a group of digits then recurs without end, and what gets stored is that expansion cut short and rounded.',
    exemplarKeywords: [
      'why 0.1 cannot be stored exactly',
      'zero point one plus zero point two',
      '0.30000000000000004',
      'repeating binary fraction',
      'converting a decimal fraction to binary',
      'multiply by two and take the integer part',
      'a denominator with a factor of five',
      'rounding at the moment of storage',
      'terminating and non-terminating expansions',
      'the stored value is not the value you wrote',
      'exact comparison of two decimals',
    ],
  },

  briefing: {
    observable: [
      'The fraction is written at the left of a digit tape as 1/10 = 0., and the tape already trails off in an ellipsis before a single digit has been produced, so the expansion is open from the first frame.',
      'A row of five slots joined by arrows marked ×2 runs across the top; each slot is a remainder, and a filled token marks which remainder the work is standing on.',
      'Every step spells its own arithmetic in the caption — the value, doubled, the digit taken off, and what is left — and the digit itself drops out of the slot and lands in the next cell of the tape.',
      'When the remainder returns to one already on the board, an arc is drawn back over the slots from the later one to the earlier, labelled repeats, and the token flies back along that arc instead of advancing.',
      'An underline appears beneath the digits inside the loop at the moment the arc closes, and it keeps growing with the tape as more digits arrive.',
      'Each further step goes around the loop again, and a lap lays down more digits than the one before it, so the tape fills faster the longer it runs.',
      'A bracket then grows under the tape labelled float32, marking how many digits the container keeps, and a line in the alarm colour stands at the cut.',
      'The digits past that line slide to the right and fade off the tape, taking the trailing ellipsis with them, and the last digit still standing hops and changes value, which is the rounding.',
      'The closing caption states both halves at once: this value has no end in base two, and what is stored is the cut version.',
      'The slots, arrows and arc dim at the end so that only the tape and the container remain lit.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole expansion on its own — the first digits, the loop closing, the laps, the cut and the rounding — and stops with the stored digits lit.',
        'A Replay button clears the tape and runs the expansion again. When it has finished, a playback strip can be dragged to any moment, which is how a reader can stop on the remainder that comes back.',
        'The fraction is fixed at one tenth and every digit is produced by arithmetic on integers rather than placed by hand, so an article can name the repeating group and the digit that rounds up.',
      ],
    },

    useWhen: [
      'The article writes that adding two decimals gives an answer ending in stray digits, and the reader files it under floating-point strangeness. A remainder arriving back where it has already been makes the non-termination structural rather than anecdotal.',
      'The prose has to say why some decimals are exact in binary and others are not, and the reader hears an arbitrary list. The remainder track closing into a loop is the reason, and it is visible before any container is mentioned.',
      'The article needs rounding to be located at a specific moment — the point where the digits ran out — rather than described as something that happens generally; the last surviving digit changes value on screen at that moment.',
      'A reader is being warned against comparing two computed decimals for equality and needs to see that the values compared were already altered on the way in.',
    ],

    avoidWhen: [
      'The article advises what to use for money, prices, or exact decimal amounts. Its answer is another representation, and this screen never shows one — it only derives why this one does not end.',
      'The subject is error growing through a long computation. A single conversion is shown here, and nothing is computed twice.',
      'The point is how a stored number divides into fields, what the exponent reads, or where the leading one went. The container appears here only as a length that the digits overrun.',
      'The subject is how far apart neighbouring representable values sit, or how that distance changes with magnitude.',
      'The article is about choosing a format or a width. A wider container would move the cut and change nothing about the expansion reaching it.',
      'The subject is writing an integer in another base, or reading hexadecimal. Only a fraction is converted here, and only into base two.',
      'The article is about recurring decimals in ordinary arithmetic — a third written in base ten — as a fact about fractions rather than about what a machine keeps.',
      'The article uses "precision" for significant figures in a measurement or for the accuracy of an instrument.',
    ],

    contrastWith: [
      {
        concept: 'floatingPoint',
        note: 'That one is about what a format reaches and how finely it resolves; this is about a value that no division of the bits captures exactly, so it survives every such choice.',
      },
      {
        concept: 'mantissaAndExponent',
        note: 'That one opens a value the encoding holds exactly and puts it back together unchanged; here the digits never stop arriving, so the assembly has to be cut off and the result differs from what was asked for.',
      },
      {
        concept: 'unevenFloatGaps',
        note: 'Both end at a value landing somewhere other than where it was aimed, but one is about a number falling between neighbours that are spaced too far apart, and this is about a number whose digits never end in the first place.',
      },
      {
        concept: 'positionalValue',
        note: 'Rewriting a number under a different base is the same procedure in both; this one follows it past the point where it would ordinarily stop, and finds that it does not.',
      },
    ],
  },
};
