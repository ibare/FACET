/**
 * floatingPoint 개념 선언.
 *
 * canonical facet 은 `facet:floatingPoint` — 여덟 비트에서 부호 하나를 뺀 일곱을
 * 지수와 가수가 나눠 갖고, 손잡이가 그 배분을 2·3·4·5 로 돌리는 완결형이다.
 * 담는 최대값과 1–2 눈금 수가 반대로 움직이는 것이 이 화면의 주장이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 조각 셋이 같은 부동소수점을 다루므로 definition 의 주어를 넷 다 달리 세웠다.
 *
 *   이 개념                 **자릿수의 배분**. 지수에 준 비트는 가수에서 뺀 것이다.
 *   mantissaAndExponent     **한 수의 안쪽 짜임**. 세 토막이 갈렸다가 도로 하나가 된다.
 *   unrepresentableFraction 십진 소수가 2진에서 **끝나지 않는다**는 것.
 *   unevenFloatGaps         **값과 값 사이의 거리**. 수가 클수록 이웃이 멀다.
 *
 * 그래서 여기 keywords 는 형식 고르기 · 범위와 정밀도의 맞바꿈 · 같은 폭의 두
 * 형식(bfloat16 ↔ float16) 어휘를 갖고, 비트 배치 어휘는 mantissaAndExponent 에,
 * 이웃 간격 어휘는 unevenFloatGaps 에 넘긴다.
 *
 * avoidWhen 이 반드시 막아야 하는 둘 — definition 의 "precision" 에 끌려오는 수치
 * 해석 글과, "floating point error" 로 걸리는 **돈 계산에 float 쓰지 말라**는 글이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const floatingPointConcept: FacetConceptSource = {
  id: 'floatingPoint',
  label: 'Floating Point (Splitting Bits Between Reach and Resolution)',
  canonicalFacet: 'facet:floatingPoint',

  surface: {
    definition:
      'A format that divides a fixed budget of bits between an exponent and a fraction, so every bit granted to reach is withheld from resolution and neither can be enlarged without shrinking the other.',
    exemplarKeywords: [
      'floating point format',
      'range versus precision',
      'float versus double',
      'how many bits go to the exponent',
      'single and half precision',
      'bfloat16 and float16',
      'choosing a numeric type',
      'IEEE 754 formats',
      'the largest value a float holds',
      'the smallest normal value',
      'trading reach for fineness',
      'why a wider float is not simply better',
    ],
  },

  briefing: {
    observable: [
      'A strip of eight cells is tinted into three runs marked S, E and M, and a line above it reads the current division as Sign 1 · Exponent 3 · Mantissa 4, so the whole argument is a partition of one fixed row.',
      'Four boxes fill one at a time as the playback runs — Bias, Largest value, Smallest normal, Gap next to 1.0 — each derived from the current division rather than quoted.',
      'A ruler between 1 and 2 carries a tick at every value the format can actually hold there, and its caption counts them; the bar keeps the same length at every setting, so a coarser format shows as ticks thinning out rather than as a shorter ruler.',
      'A line beneath reports what happens to one sample real number: at the opening division it reads that storing 3.14159 gives back 3.125, and no setting of the handle returns it unchanged.',
      'Two badges sit in the control bar, Largest value and Ticks 1 to 2, and moving the handle drives them in opposite directions — from 3.9375 and 32 ticks at two exponent bits to 57,344 and 4 ticks at five.',
      'Numbers are written out in full rather than rounded or abbreviated, so the smallest normal value appears as 0.00006103515625 and the largest as 57,344 with comma grouping.',
      'A closing line under the ruler states the trade directly: giving the exponent more reaches further with a coarser ruler.',
      'The code panel highlights the line matching the running phase as the board fills — the bias, the range, the smallest normal, the gap, the tick count, and the storing of the sample.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider.',
        'A four-way control labelled Exponent bits, set to 2, 3, 4 and 5 and starting at 3, is the handle that carries the argument — a pass finishes, and the next press rebuilds the whole board under a different division of the same eight bits.',
        'The total width, the single sign bit and the sample real number are all fixed, so an article can name one division and quote the four values it produces.',
        'The code panel starts empty with an "+ Add language" button offering Python, JavaScript, TypeScript, Java, C++ and C#; two can sit side by side. It holds the same arithmetic the board runs on — the bias, the largest value, the gap next to 1.0, and what a given real number becomes in this format.',
      ],
    },

    useWhen: [
      'The article compares two formats of the same width — sixteen bits spent one way or another — and the reader takes the choice for a vendor detail. Moving the handle without changing the number of cells is that comparison made literal.',
      'The prose calls a wider float "more precise" and the reader hears range and fineness as one quality. Two badges moving in opposite directions under the same handle is what separates them.',
      'A reader needs the largest value, the smallest normal, or the spacing at 1.0 to follow from how the bits were divided rather than arrive as a table to memorise; each box is derived on screen from the current division.',
      'The article is about picking a numeric type for a workload and has to justify why the answer depends on what the data looks like rather than on which type is biggest.',
    ],

    avoidWhen: [
      'The subject is how error behaves through a long computation — accumulation, cancellation, conditioning, the stability of a method. Nothing is computed twice here; the screen derives the constants of one format and stores a single sample.',
      'The article advises what to use for money, prices or accounting amounts. Its answer is a different representation, and nothing here shows an alternative — only how one format divides its bits.',
      'The point is that a particular decimal such as 0.1 cannot be held exactly. That is a property of the value in base two and holds at every division of the bits, while this screen is about the division itself.',
      'The subject is the distance from one representable value to the next along the number line. This screen measures the spacing at 1.0 for one format at a time and never walks outward to compare spacings.',
      'The article opens a stored number to name its fields — reading the exponent, subtracting the bias, restoring the leading one. Here the fields are only counted, never read.',
      'The subject is a signed integer, where the sign is a weight belonging to one of the ordinary places rather than a field of its own.',
      'The article is about a value leaving what its container holds — a counter wrapping, a sum turning negative. Exceeding a float leaves the nearest representable value in place instead.',
      'The article uses "float" for the CSS layout property or for a floating panel in an interface.',
    ],

    contrastWith: [
      {
        concept: 'mantissaAndExponent',
        note: 'This settles how many bits each field is given; that one takes the division as fixed and shows how the fields read out as a single number.',
      },
      {
        concept: 'unevenFloatGaps',
        note: 'Both concern how finely a format resolves, but this compares one division of the bits against another while that one holds the division fixed and walks outward along the number line.',
      },
      {
        concept: 'unrepresentableFraction',
        note: 'This is about what a format can reach and how finely; that one is about a value no binary format of any width holds exactly, so widening the container does not settle it.',
      },
      {
        concept: 'twosComplement',
        note: 'Two ways to encode a signed value: there the sign is a weight belonging to one of the ordinary places, here it is a field of its own standing beside an exponent and a fraction.',
      },
      {
        concept: 'positionalValue',
        note: 'Both write a number as digits against powers of a base, but that one fixes where the point sits and varies the base, while this one keeps the base at two and stores where the point went.',
      },
      {
        concept: 'integerOverflow',
        note: 'Both follow from a container being finite, but leaving an integer range changes the value outright while exceeding this format’s resolution quietly leaves the nearest representable value in its place.',
      },
    ],
  },
};
