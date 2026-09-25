/**
 * narrowingLoss 개념 선언.
 *
 * canonical facet 은 `facet:narrowingLoss` — `let small: int32 = 100` · `let large: int32 = 300` ·
 * `let a: int8 = int8(small)` · `let b: int8 = int8(large)` · `show a` · `show b`. 변환마다 아래 8 비트만
 * 건너가고 윗 24 비트는 떨어져 나간다. 100 은 떨어진 쪽이 모두 0 이라 그대로, 300 은 자리값 256 의 비트를
 * 잃어 44. 출력 100 · 44. 걸음 일곱 (시작 포함).
 *
 * ── 자리
 *
 * "type conversion · cast · narrowing · low-order bits kept · high-order bits discarded" 를 이쪽이 독점한다.
 * 컴퓨터 구조의 수 표현 개념들과 겹치지 않게 — `integerOverflow`(셈이 한계를 넘음) 의 width · overflow ·
 * largest, `signedWraparound` 의 wrap · ring, `twosComplement` 의 sign · negative 를 definition 에서 쓰지
 * 않는다. 화면은 음수가 나오지 않는 수를 골랐다.
 *
 * 전제: 이 표기의 `int8(…)` 는 아래 8 비트를 남겨 부호 있는 8 비트 정수로 읽는다 (자바 · C# · 고의 정수 변환과
 * 같다). 파이썬에는 고정 크기 정수가 없고, 러스트 `as` 는 같지만 `try_from` 은 실패를 돌려준다. 화면은 각주를
 * 달지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const narrowingLossConcept: FacetConceptSource = {
  id: 'narrowingLoss',
  label: 'Narrowing Conversion (High Bits Are Cut Off)',
  canonicalFacet: 'facet:narrowingLoss',

  surface: {
    definition:
      'A narrowing conversion to a smaller integer type keeps only the low-order bits that fit and discards the high-order ones, so a number needing any discarded bit silently turns into a different number.',
    exemplarKeywords: [
      'narrowing conversion',
      'type cast',
      'explicit cast from int to byte',
      'int32 to int8',
      '(byte) 300 == 44',
      'truncation of high-order bits',
      'data loss when casting',
      'long to int conversion',
      'Rust as u8 truncates',
      'lossy integer conversion',
    ],
  },

  briefing: {
    observable: [
      'The code is six lines: `let small: int32 = 100`, `let large: int32 = 300`, `let a: int8 = int8(small)`, `let b: int8 = int8(large)`, `show a`, `show b`. Each declared name gets a row of bit cells, the 32-bit rows split into "low 8 bits" and "upper 24 bits", with the 8-bit rows lined up under the low part.',
      'Lines 1 and 2 fill 32-bit slots: 100 is 0110 0100, and 300 is 1 0010 1100 — its ninth bit, worth 256, is 1.',
      'Each conversion line drops a copy of the source bits down; only the low 8 cells land in the int8 row and the rest fall away, with the lost amount written as "fell off".',
      'For small the caption reads "Every bit that fell off was 0, so the value stays 100" (fell off: 0). For large it reads "The bits that fell off were worth 256: 300 became 44" (fell off: 256).',
      'The output shows 100, then 44. No error is raised at any point. Seven steps in all, counting the start.',
      'In this notation `int8(…)` keeps the low 8 bits and reads them as a signed 8-bit integer, as integer casts do in Java, C# and Go. Both results are non-negative by choice; the screen never shows the top bit turning a result negative. The code is not written in any one real language.',
    ],

    screen: {
      affordances: [
        'The screen plays the six lines by itself and stops after printing 44.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to line 4 holds the bits of 300 falling off.',
        'The program and its numbers are fixed.',
      ],
    },

    useWhen: [
      'The reader expects `(byte)300` or `int8(300)` to fail loudly and it quietly gives 44. The 256 that falls off shows exactly where the difference went.',
      'The article explains why a cast that works for 100 breaks for 300, and needs both conversions of the same type side by side.',
    ],

    avoidWhen: [
      'The subject is arithmetic exceeding the maximum of a type, such as a counter growing past 127. Nothing here is computed; values are only converted.',
      'The article is about how negative numbers are represented or why a cast yields a negative result. Both results here are non-negative.',
      'The article concerns converting floating-point numbers to integers, or implicit type coercion between strings and numbers. Only integer-to-integer conversion is shown.',
    ],

    contrastWith: [
      {
        concept: 'integerOverflow',
        note: 'Both end with a number that is silently wrong. Overflow comes from a calculation growing past a type\'s limit; narrowing comes from moving an already-correct value into a smaller type.',
      },
      {
        concept: 'twosComplement',
        note: 'Which value the surviving bits denote depends on how the type reads its top bit. This concept is about which bits survive a conversion, not how the survivors are read.',
      },
      {
        concept: 'bitMask',
        note: 'Keeping the low 8 bits by conversion gives the same bits as masking with 0xFF. A mask is a chosen operation on a value of unchanged type; narrowing happens because the destination type has no room.',
      },
    ],
  },
};
