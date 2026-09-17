/**
 * unevenFloatGaps 개념 선언.
 *
 * canonical facet 은 `facet:unevenFloatGaps` — 1 · 2 · 16 · 1024 · 65536 다섯 지점을
 * 차례로 서며, 걸음마다 카메라가 물러서고 새 이웃이 다시 화면 끝까지 달아나는
 * 조각이다. 빗살이 앞 눈금 몇 개가 새 칸에 드는지를 센다. 손잡이는 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나 (특히 mantissaAndExponent 와)
 *
 * 이 개념과 `mantissaAndExponent` 가 가장 붙는다 — 이웃까지의 거리가
 * 2^(지수−가수비트) 라 곧 가수·지수 이야기이기 때문이다. **층위로 갈랐다.**
 *
 *   mantissaAndExponent   수 **하나의 안쪽**. 비트열이 어떻게 갈려 그 수를 이루는가.
 *   이 개념               값과 값 **사이**. 이웃까지의 거리가 어떻게 변하는가.
 *
 * 그래서 이 definition 은 'mantissa' · 'exponent' · 'bias' · 'hidden one' 을 한 번도
 * 쓰지 않는다. 쓰는 순간 두 점이 붙어 검색이 갈리지 않는다. 대신 거리 · 이웃 ·
 * 구간 · 자릿수 어휘만으로 선다. 화면도 비트열을 한 번도 열지 않는다.
 *
 * 배분을 고르는 일은 `floatingPoint`, 담기지 않는 값은 `unrepresentableFraction`
 * 의 몫이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const unevenFloatGapsConcept: FacetConceptSource = {
  id: 'unevenFloatGaps',
  label: 'Uneven Float Gaps (Neighbours Farther Apart as Values Grow)',
  canonicalFacet: 'facet:unevenFloatGaps',

  surface: {
    definition:
      'The values a binary format can hold are not spread evenly along the number line: the distance from one to the next doubles with every doubling of magnitude, so an equal count of values covers ever wider stretches.',
    exemplarKeywords: [
      'representable values are not evenly spaced',
      'spacing between consecutive floats',
      'unit in the last place',
      'machine epsilon',
      'adding a small number to a large one does nothing',
      'the addition was ignored',
      'accumulating elapsed time in a float',
      'a relative tolerance instead of a fixed one',
      'comparing floats for near equality',
      'precision loss at large magnitudes',
      'the next value after a given one',
      'how many values lie between one and two',
    ],
  },

  briefing: {
    observable: [
      'A rail carries a heavy tick at its left edge for the value in hand and a lighter tick for the value immediately after it, and the first pair opens by running the neighbour out to the far end of the rail, so one gap fills the entire width.',
      'The gap is written above the rail in two registers at once — as a power of two and as its full decimal expansion — and the neighbour’s own value stands at its tick, so 1 is followed by 1.0000001192092896.',
      'Every step is two motions rather than one: the span in view first shrinks back to a stub the width of a single previous notch, and only then does the new neighbour run away to the far edge again.',
      'A comb of fine teeth appears beneath the bar counting how many of the previous notches fit inside the new one, and the teeth light only as the neighbour sweeps past them, so the count is laid down rather than asserted.',
      'A badge at the right edge carries a running multiple against the first notch, and it climbs to ×65,536 by the last stop while the rail itself never changes length.',
      'The value on the left steps through 1, 2, 16, 1,024 and 65,536, and by the last of them the neighbour has moved from six decimal places away to 65,536.0078125.',
      'A band then sweeps once across the bar under a line stating that the same count of values fills every span from a number to its double, naming that count as 8,388,608.',
      'The screen closes on a plain statement: the bigger the number, the farther its neighbour, and the notches are not even.',
    ],

    screen: {
      affordances: [
        'The screen plays the walk outward on its own — the opening gap, the four widenings, the count that fills a span — and stops on the closing line.',
        'A Replay button returns to the first gap and walks outward again. After the walk, a playback strip can be dragged to any stop, which is how a reader can hold still on the comb and count the teeth.',
        'The five stopping points are fixed and every distance is measured from the format itself rather than computed for display, so an article can quote a value and the neighbour that follows it.',
      ],
    },

    useWhen: [
      'The article says a small amount added to a large running total is lost, and the reader pictures it being rounded away a little at a time. A neighbour sitting 0.0078 away at 65,536 shows there was no value in between for the sum to land on.',
      'The prose warns against comparing two values with one fixed tolerance everywhere, and the reader takes the warning for fussiness. A notch that grows by a factor of 65,536 across five stops is why one tolerance cannot serve both ends.',
      'The article needs the claim that every span from a number to its double holds the same count of values to arrive as a consequence of the walk rather than as a fact to be believed.',
      'A reader is accumulating a quantity that grows — elapsed seconds, a running balance of measurements — and has to see that the arithmetic gets coarser as the total climbs, not as it ages.',
    ],

    avoidWhen: [
      'The article opens a stored value to name its parts — which bits carry what, the constant taken off the exponent, the leading one that is not written. No bit pattern is shown here; what is drawn is the distance between whole values.',
      'The subject is one particular decimal having no exact form. Every value standing on this rail is one the format holds exactly; the point is only how far apart they are.',
      'The article is about dividing a budget of bits between the fields, or about comparing two formats. One format is held fixed here and the walk happens inside it.',
      'The subject is a value passing the limit of an integer container — a counter wrapping, a sum turning negative. Nothing wraps here; a value simply has no nearer neighbour to move to.',
      'The article advises what to use for money or exact amounts.',
      'The subject is error compounding through the steps of a numerical method, or the conditioning of a problem. One distance is measured at each stop and no computation runs across them.',
      'The article uses "precision" for significant figures in a measurement or for the resolution of an instrument.',
      'The article uses "gap" for the shrinking interval of a gap-based sort, or for the free span kept inside a text buffer.',
    ],

    contrastWith: [
      {
        concept: 'mantissaAndExponent',
        note: 'One is the distance from one value to the next; the other is the inside of a single value — which bits are which and what they read as. This follows from that, but nothing has to be taken apart to show it.',
      },
      {
        concept: 'floatingPoint',
        note: 'Both are about how finely a format resolves, but that one compares one division of the bits against another at a single point, while this holds the division fixed and walks outward to watch the spacing change.',
      },
      {
        concept: 'unrepresentableFraction',
        note: 'Both end with a value landing somewhere other than intended, but there the digits never stop arriving, and here they stop early only because the nearest neighbour is already far away.',
      },
      {
        concept: 'integerOverflow',
        note: 'An integer’s values sit one apart everywhere in its range and the limit shows up at the ends; here the spacing changes with magnitude, so the limit shows up as a value that stops responding to small additions.',
      },
      {
        concept: 'asymptotic',
        note: 'Both watch a quantity double as another grows, but one is about the cost of doing work and this is about the resolution of the numbers the work is done on.',
      },
    ],
  },
};
