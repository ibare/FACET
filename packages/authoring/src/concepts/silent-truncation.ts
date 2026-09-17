/**
 * silentTruncation 개념 선언.
 *
 * canonical facet 은 `facet:silentTruncation` — 열여섯 자리 비트 띠가 여덟 자리
 * 그릇 위로 내려앉고, 그릇 왼쪽 벽 바깥에 걸린 윗자리가 받쳐 줄 바닥이 없어
 * 캔버스 밖으로 떨어지는 조각이다. 값 셋을 차례로 담는다 — 300 → 44 · 260 → 4 ·
 * 511 → 255.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩만 딸려 있다 — 값도 폭도 고를 수
 * 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * `integerOverflow` 가 세 자리를 갈라 두었고 이 파일은 그 분배를 받는다.
 *
 *   integerOverflow  셈이 폭을 넘어서는 일. 주어는 자라는 계산이고, 그릇은
 *                    처음부터 끝까지 하나다.
 *   signedWraparound 값의 집합이 닫힌 고리라는 사실. 주어는 범위의 짜임이다.
 *   이 개념          **좁은 그릇으로 옮기는 일**. 주어가 연산이 아니라 **대입 ·
 *                    변환** 이고, 그릇이 둘이며(넓은 쪽 → 좁은 쪽) 잃는 것이
 *                    값이 아니라 **자리** 다.
 *
 * 그래서 keywords 는 **옮김의 어휘**(형 변환 · 좁히는 변환 · 아래 여덟 자리만
 * 남기기 · 필드에 담기) 를 가져가고, 폭 고르기 · 자료형 넓히기는
 * integerOverflow 가, 끝과 끝 · 고리는 signedWraparound 가 갖는다.
 *
 * avoidWhen 이 막아야 하는 것 둘.
 *  1. "truncate" 는 소수점 버림 · 문자열 자르기 · 테이블 비우기를 함께 끌어온다.
 *  2. 화면의 셋째 값 511 → 255 는 결과가 그릇의 최대값과 같아 **포화 연산**
 *     ("넘치면 최대값에 붙잡아 둔다") 으로 오독될 여지가 있다. 화면이 스스로
 *     반박하지 않으므로 (512 를 담아 보이지 않는다) 그 오독을 여기서 막는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const silentTruncationConcept: FacetConceptSource = {
  id: 'silentTruncation',
  label: 'Narrowing a Value (The High Places Are Dropped)',
  canonicalFacet: 'facet:silentTruncation',

  surface: {
    definition:
      'Storing a value in an integer container narrower than the one it was counted in: the places that do not fit are dropped rather than clamped, leaving the value modulo the narrow width, and nothing reports it.',
    exemplarKeywords: [
      'narrowing conversion',
      'casting an int to a byte',
      'the (byte) cast in Java',
      'assigning a wider type to a smaller one',
      'implicit conversion that loses data',
      'keeping only the low eight bits',
      'the value modulo 256',
      'uint16 into uint8',
      'why 300 becomes 44',
      'a value that does not fit the field it is stored in',
      'truncating the high bits of an integer',
      'no warning on an integer conversion',
      'packing a number into a one-byte field',
      'the high byte disappearing',
    ],
  },

  briefing: {
    observable: [
      'A strip of sixteen bit cells stands above an open-topped container drawn with a left wall, a floor and a right wall, and the container reaches only under the right half of the strip — the eight cells on the left hang over nothing, and that overhang is the whole of the picture.',
      'The two widths are named in monospace where they apply: uint16 at the head of the strip, uint8 at the rim of the container.',
      'Every cell is drawn identically, with nothing marking in advance which of them will survive, so which cells fall is decided by what is underneath them and by nothing else.',
      'The strip descends as one piece; the eight cells over the container come to rest on its floor, and the eight beyond the wall stop in mid-air, now labelled with the quantity those places were carrying.',
      'The overhanging group then falls away on its own, tilting as it accelerates, and leaves the bottom of the canvas — nothing catches it, records it, or marks where it went.',
      'The value that arrived is centred over the full strip and the value that stayed is centred under the container, so the horizontal offset between the two numbers is the width that was lost.',
      'Three values are poured in turn, each entering from the left while the previous strip slides off to the right: 300 leaves 44, 260 leaves 4, and 511 leaves 255.',
      'Every one of the three loses the same quantity — the captions name it as 256 each time — so the amount discarded is a property of where the wall stands and not of how far the value exceeded the container.',
      'The third result, 255, is the largest value the eight-bit container can hold, and it was reached by losing the same 256 as the other two.',
      'The closing caption states what did not happen at any point in the run: "No error, no warning at any step", followed by the three values that stayed.',
    ],

    screen: {
      affordances: [
        'The screen pours all three values on its own and stops with the last result standing under the container.',
        'Under it sit a Replay button and a playback strip. Once the run has finished, dragging the strip handle back into a pour is how a reader can hold still between the descent and the fall.',
        'The three values, the sixteen-bit source and the eight-bit container are fixed, so an article can quote each pair of numbers and the bits that fell.',
      ],
    },

    useWhen: [
      'The article introduces a cast or an assignment into a smaller type and the reader expects it to fail, to be refused, or to be reported. Watching the discarded places leave the picture with nothing raised is what makes a conversion something to check by hand.',
      'The prose needs "modulo 256" or "the low byte" to be something concrete rather than a formula: the places that stay are the ones with a floor under them, and the arithmetic is a consequence of where the wall is.',
      'A reader believes a value that does not fit gets as close as it can — the largest the container holds, or the amount by which it overflowed. Two of the three values land nowhere near the maximum, and all three lose the same quantity.',
      'The article has to argue that the loss is unrecoverable rather than merely unwelcome: what fell leaves the canvas, and the number that remains is indistinguishable from one that was always that small.',
      'The prose concerns a value being packed into a fixed-width field — a byte in a protocol header, a one-byte counter, a column narrower than the value written to it — and the reader needs to see what reaches the field.',
    ],

    avoidWhen: [
      'The article uses "truncate" for dropping the fractional part of a real number, for rounding toward zero, or for a float-to-integer conversion. Every value here is a whole number and no point is involved.',
      'The article uses "truncate" for shortening a string or a log line, for cutting text with an ellipsis, or for emptying a database table.',
      'The subject is saturating or clamping arithmetic, where a value that does not fit is pinned to the largest the container holds. It can look like that here because the third result lands on 255, but it lost the same 256 as the others; a value of 512 would leave 0, not 255.',
      'The subject is stack overflow — runaway recursion, an exhausted call stack. Nothing here concerns calls, and nothing is raised.',
      'The subject is a buffer overflow or overrun — writing past the end of an array, corrupting neighbouring memory, the exploit class built on it. What is lost here is lost by falling outside a container, not by landing inside someone else\'s.',
      'The subject is floating point, where a value beyond what the format resolves is replaced by the nearest one it has. That substitutes a close value; this one keeps a value with no relation to the original.',
      'The question is at which point a growing computation stops fitting, or whether a wider type would buy more room. The value here is already computed and the widths never change.',
      'The point is that the largest value is followed by the smallest. Nothing steps along the range here, and no value crosses a boundary — one value is moved from a wide container to a narrow one, once.',
      'The subject is a narrowed value read back as negative. The container on screen is unsigned and every value in the run stays at or above zero, so the step that gives the leading place a negative weight is not part of what is shown.',
      'The point is writing the same number in another base or regrouping bits into hexadecimal digits. The bits here are cut once, by a wall, and the part beyond it is discarded rather than read another way.',
    ],

    contrastWith: [
      {
        concept: 'integerOverflow',
        note: 'That one is arithmetic outgrowing the container it was working in, so the question is at which step it happens; this one has no arithmetic at all — the value is finished, and the loss is in moving it from one container to a narrower one.',
      },
      {
        concept: 'signedWraparound',
        note: 'Both leave a value congruent modulo a power of two, but that one keeps every place and changes only what the leading one is worth, whereas here the leading places are gone and there is nothing left to reinterpret.',
      },
      {
        concept: 'twosComplement',
        note: 'That one holds that the width is part of what a pattern means; this one is what happens when a value meets a width smaller than the one it was written under, and the places outside the new width simply cease to exist.',
      },
      {
        concept: 'positionalValue',
        note: 'Both cut one row of bits into pieces, but that one keeps every piece and reads the same number another way, while here one of the pieces is discarded and the number that remains is a different number.',
      },
    ],
  },
};
