/**
 * twosComplement 개념 선언.
 *
 * canonical facet 은 `facet:twosComplement` — 비트열 넷을 두 약속으로 나란히 읽고,
 * 손잡이로 비트 폭을 4 · 8 · 16 · 32 로 갈아 끼우는 완결형이다. 자리마다 무게가
 * 붙는데 맨 윗자리만 음수이고, 폭을 밀면 같은 비트열의 값이 통째로 달라진다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 형제 조각 둘이 같은 2의 보수를 다루므로 definition 의 주어를 셋 다 달리 세웠다.
 *
 *   이 개념        **읽는 약속**. 폭이 약속의 일부이고, 그래서 같은 비트열이 두 수다.
 *   positionalValue  한 수를 자리값의 합으로 쪼개고 밑을 바꿔 다시 적는 일. 부호가 없다.
 *   negateAndAddOne  음수를 **만드는 절차**. 뒤집고 하나 더해 더해서 0 이 되는 짝을 얻는 일.
 *
 * 그래서 여기 keywords 는 폭 · 형 변환 · 부호 확장 어휘를 갖고, 절차 어휘
 * (뒤집는다 · 1 을 더한다) 와 진법 변환 어휘는 형제 쪽에 넘긴다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const twosComplementConcept: FacetConceptSource = {
  id: 'twosComplement',
  label: "Two's Complement (One Pattern, Two Readings)",
  canonicalFacet: 'facet:twosComplement',

  surface: {
    definition:
      'A convention for reading a fixed-width bit pattern as a signed integer in which only the highest place weighs negative, so the declared width decides which value the same bits denote.',
    exemplarKeywords: [
      "two's complement",
      'signed versus unsigned',
      'int8 int16 int32',
      'the sign bit',
      'sign extension',
      'widening a value to more bits',
      'casting between integer types',
      'why 0xFF can mean -1',
      'reinterpreting the same bytes',
      'the range of a signed integer',
      '-128 to 127',
      'declaring how many bits a number gets',
    ],
  },

  briefing: {
    observable: [
      'A row of place weights sits above the bit cells and only the highest one is written with a minus in front, so the single asymmetry of the encoding is on screen before any value is read.',
      'Each of the four patterns is laid out, then read twice into two columns side by side — once with every place positive, once with the top place negative — and a line beneath spells the arithmetic out term by term, as in -8 + 2 + 1 = -5.',
      'A cell holding 1 in the highest place is tinted differently from the other set cells, which marks the one position whose weight changed sign.',
      'A band along the bottom reports the span of the current width: its lowest and highest value, how many values it holds, and how many of those are negative — the negatives always outnumber the positives by one.',
      'The Split readings badge counts the patterns whose two readings disagree, and at four bits it stands at three of four; pushing the width up to eight drops it to zero, because the same patterns now leave the top place empty.',
      'The Bit places badge tracks the total number of places laid out, so widening the container is visible as a quantity and not only as a longer row.',
      'At sixteen and thirty-two bits the row is folded: the highest place and the seven lowest stay, with the middle replaced by an ellipsis, so the top place remains the one being watched.',
      'The code panel highlights the line matching the running phase — laying out the places, the unsigned reading, the signed reading, and the span calculation.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider.',
        'A four-way width control set to 4, 8, 16 and 32 is the handle that carries the argument — a reading finishes, and the next press rebuilds the board under a different width with the same patterns.',
        'The four bit patterns are fixed, so an article can name a specific one and quote both of its readings at a given width.',
        'The code panel starts empty with an "+ Add language" button offering Python, JavaScript, TypeScript, Java, C++ and C#; two can sit side by side.',
      ],
    },

    useWhen: [
      'The article says a number is negative and the reader pictures a minus sign stored somewhere alongside it. Two readings of one unchanged row of cells, arriving at 11 and at -5, is the correction.',
      'The prose has to justify why a value must be declared with a size — a byte, a short, a thirty-two bit word — and the reader takes the size for a storage detail. Moving the handle changes what the identical bits mean, which makes the width part of the meaning rather than part of the packaging.',
      'A reader is about to convert or copy a value between two differently sized containers and needs to see that filling the new top places with zeros is a decision that can change the sign.',
      'The article needs the range of a signed type to be a consequence rather than a table to memorise: the band derives the bounds, the count of values, and the extra negative from the width alone.',
    ],

    avoidWhen: [
      'The subject is a value growing past what its container holds — a counter that wraps, a sum that turns negative, a cast that keeps only the low bits. Every pattern here fits the width and nothing exceeds it.',
      'The article is about producing the negative of a number. The screen reads patterns that are already there and never derives one from another.',
      'The point is writing the same value in another base, or reading hexadecimal. Only two readings appear, and both are decimal.',
      'The subject is per-bit operations or moving bits sideways — AND, OR, XOR, shifts, masks. No operation is applied to the patterns here; they are only read.',
      'The article is about how a fractional value is stored, where the sign occupies its own field rather than a weighted place.',
      'The subject is the order bytes take in memory. Nothing here concerns addresses or which end a value starts at.',
      'The article uses "binary" for binary search, a binary tree, or a binary file format.',
      'The article uses "complement" for set complement or for complementary colours.',
    ],

    contrastWith: [
      {
        concept: 'positionalValue',
        note: 'Both give every place a weight, but that one keeps all the weights positive and varies the base, while this one changes the sign of exactly one weight and varies the width.',
      },
      {
        concept: 'negateAndAddOne',
        note: 'That one is the procedure for producing a negative pattern; this one is the promise under which a pattern already present counts as negative, and the promise includes how many places there are.',
      },
      {
        concept: 'integerOverflow',
        note: 'This settles which values a width can represent; that one is about what happens when a computation leaves that set.',
      },
      {
        concept: 'signedWraparound',
        note: 'Both follow from the width being finite, but this reads each pattern on its own while that one is about the two ends of the range meeting.',
      },
      {
        concept: 'floatingPoint',
        note: 'Two ways to encode a signed value: here the sign is a weight belonging to one of the ordinary places, there it is a separate field beside an exponent and a fraction.',
      },
    ],
  },
};
