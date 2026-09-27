/**
 * modularClock 개념 선언.
 *
 * canonical facet 은 `facet:modularClock` — 수직선을 12 칸마다 한 바퀴씩 감은 나선에서 처음 수 9 에 7 을 여섯 번
 * 더한다. 수는 9 → 51 로 늘 커지지만 자리(나머지)는 9 4 11 6 1 8 3 으로 0..11 을 벗어나지 않고, 0 을 지날 때마다
 * 바퀴(몫)가 하나 는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `numberTheory` 는 출발 0 · 뜀 a 를 손잡이로 삼아 궤도가 gcd 로 갈리는 것을 본다. 이쪽은 **수 = 12 × 바퀴
 * + 자리** 하나를 쥔다. 그래서 definition 은 grows · remainder stays within · quotient · n = 12q + r 을 독점하고
 * stride · gcd · coprime · visit 을 쓰지 않는다.
 *
 * 전제: 법 12 · 처음 수 9 · 더하는 수 7 · 여섯 번은 예로 정한 값. 나머지는 0..11 로 쓰고 음수는 나오지 않는다
 * (설명 글 `modularClock.md`).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const modularClockConcept: FacetConceptSource = {
  id: 'modularClock',
  label: 'Modular Arithmetic (The Number Grows, the Remainder Goes Around)',
  canonicalFacet: 'facet:modularClock',

  surface: {
    definition:
      'A number that keeps growing under repeated addition still leaves a remainder from 0 to 11 on division by 12, because each pass beyond 11 is carried into the quotient: n = 12q + r.',
    exemplarKeywords: [
      'modular arithmetic',
      'clock arithmetic',
      'mod operator',
      'remainder',
      'quotient and remainder',
      'division algorithm n = qm + r',
      'congruence mod 12',
      'what time will it be in 100 hours',
      'residue',
    ],
  },

  briefing: {
    observable: [
      'The number line is wound into a spiral with one turn per 12 units: the angle is the position 0 to 11 (the remainder), and the distance from the centre is the lap (the quotient). Three readouts show "Number", "Position" and "Laps".',
      'The start is 9: "9 = 12 × 0 + 9" and "9 mod 12 = 9", with the caption "Start: 9".',
      'Each step adds 7 and the head moves seven cells forward along the spiral. The first step reads "9 + 7 = 16 · position 9 → 4 · passes 0 · laps: 1", with "16 = 12 × 1 + 4" and "16 mod 12 = 4".',
      'The numbers run 9, 16, 23, 30, 37, 44, 51 while the positions run 9, 4, 11, 6, 1, 8, 3. The steps that pass 0 (the first, third, fourth and sixth) each add a lap mark; a table beside the spiral keeps every number with its position.',
      'The last step shows "51 = 12 × 4 + 3" and "51 mod 12 = 3".',
      'Modulus 12, start 9 and step 7 are example values chosen to recall a clock. The position is written 0, not 12, and no negative numbers occur.',
    ],

    screen: {
      affordances: [
        'The screen plays seven steps by itself (the start and six additions) and stops at 51.',
        'A Replay button and a playback strip sit below it. Dragging back and forth over a step that passes 0 shows the lap count rising while the position drops back to a small number.',
        'The values are fixed, so every equation n = 12 × q + r can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces the mod operator with clock time and needs the remainder shown as one half of n = 12q + r, with the laps absorbing the growth.',
      'Readers think a remainder can grow along with the number; the article wants the number to climb to 51 while the remainder never leaves 0 to 11.',
    ],

    avoidWhen: [
      'The subject is the remainder of negative numbers or how languages differ on % with negatives. Every number here is positive.',
      'The article is about integer overflow in fixed-width types. The number here never overflows; it keeps growing.',
      'The question is which residues a repeated step eventually reaches, or modular inverses. Only seven values are shown and no pattern of coverage is claimed.',
    ],

    contrastWith: [
      {
        concept: 'numberTheory',
        note: 'A remainder always lies in 0 to m − 1; which of those values repeated addition of a fixed step actually reaches is a further question answered by the gcd of step and modulus.',
      },
      {
        concept: 'signedWraparound',
        note: 'Wraparound in a fixed-width integer loses the high part and jumps to the most negative value; a remainder is one component of a number whose full value is kept alongside the quotient.',
      },
      {
        concept: 'circularBufferWrap',
        note: 'A circular buffer reuses a fixed set of slots by resetting its index; the mod operation there is a tool, while here it is the object of study as the remainder of a growing number.',
      },
      {
        concept: 'hashToBucket',
        note: 'Reducing a hash value mod the table size is one application of the remainder; the arithmetic claim is only that the result always falls within 0 to m − 1.',
      },
    ],
  },
};
