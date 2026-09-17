/**
 * bitShift 개념 선언.
 *
 * canonical facet 은 `facet:bitShift` — 여덟 칸 붙박이 레일 위에서 비트 무리가
 * 통째로 미끄러지는 조각이다. 왼쪽으로는 3 에서 다섯 칸(3 · 6 · 12 · 24 · 48 · 96,
 * 떨어지는 것 없음), 오른쪽으로는 200 에서 네 칸(200 · 100 · 50 · 25 · 12, 마지막
 * 칸에서 1 이 떨어진다). 칸 위에 자리 무게가 적혀 있어 곱셈을 말로 주장하지 않고
 * 자리로 보인다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩만 딸려 있다 — 값도 방향도 고를 수
 * 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `bitwiseOps` 가 네 자리를 갈라 두었고 이 파일은 그 분배를 받는다.
 *
 *   bitwiseOps  규칙 자체. 자리마다 혼자, 그러나 한꺼번에. 시프트만이 예외다.
 *   bitMask     자리를 고르는 일. 남은 비트는 **제자리에 선다**.
 *   이 개념      **자리를 옮기는 일**. 비트는 값을 지닌 채 자리를 바꾸고, 그래서
 *                수가 배가 되고 반이 된다. 유일하게 **산술인 쪽**이다.
 *   byteOrder   바이트를 늘어놓는 차례.
 *
 * `bitMask` 와 가장 붙는다 — 필드를 뽑으려면 가리고 옮겨야 하므로 실무에서 늘
 * 함께 나온다. 그래서 definition 을 "비트가 값을 지닌 채 자리를 바꾼다" 로 세워
 * 마스크의 "자리를 지킨 채 살아남는다" 와 마주 걸었다. 갈림의 요점은 하나다 —
 * 이쪽만 수의 크기를 건드린다. 그래서 이쪽만 곱셈으로 다시 쓸 수 있다.
 *
 * keywords 는 **크기 어휘**(<< >> · 두 배 · 2 의 거듭제곱 · 내림 · 끝을 넘어간
 * 비트)를 가져간다. 골라내기 어휘는 bitMask 가, 연산자 어휘는 완제품이 갖는다.
 *
 * avoidWhen 이 막아야 하는 것: "doubles or halves" 가 definition 에 있는 한
 * **곱셈을 시프트로 바꾸는 최적화 글**이 반드시 걸리고, "bit" 가 있는 한 해시 ·
 * 비트셋 글이 걸린다. 화면은 부호 없는 여덟 칸 논리 시프트 하나뿐이라 그 글들이
 * 묻는 것(음수 · 컴파일러 · 섞기)에 답할 수 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bitShiftConcept: FacetConceptSource = {
  id: 'bitShift',
  label: 'Bit Shift (Moving Places, Doubling and Halving)',
  canonicalFacet: 'facet:bitShift',

  surface: {
    definition:
      'Sliding every bit sideways into a new place: each bit keeps its value while the number doubles or halves once per place moved, and whatever passes the fixed width is discarded.',
    exemplarKeywords: [
      'bit shift',
      'left shift and right shift',
      'the << and >> operators',
      'x << 1 doubles the number',
      'dividing by a power of two',
      'why a right shift rounds down',
      'bits falling off the end',
      'shifting a field down into place',
      'logical versus arithmetic shift',
      'multiplying by two without multiplying',
      'place weights doubling from right to left',
      'moving a whole row of bits at once',
    ],
  },

  briefing: {
    observable: [
      'A rail of eight fixed slots runs across the screen, and above each slot its place weight is printed — 128, 64, 32, 16, 8, 4, 2, 1. The slots never move; only the bits do.',
      'A bit standing at 1 is a solid tile. An empty slot shows a faint 0 in its background, so a tile leaving a slot uncovers the 0 that was there all along.',
      'The weight labels above occupied slots are set bold, which makes the value readable directly off the rail as the sum of the bold weights.',
      'The tiles move as one group, together, in a single slide — nothing is carried or rippled from one place to the next.',
      'Two expressions sit under the rail. On the left is the shift that actually happened, written as 3 << 2 = 12; on the right is the same step written as ordinary arithmetic, 3 × 4 = 12, so the two descriptions stand side by side at every step.',
      'The first run starts from 3 in eight slots and slides left five times — 3, 6, 12, 24, 48, 96 — and nothing ever leaves the rail, so the doubling holds all the way through.',
      'It then turns around and starts from 200, sliding right four times — 200, 100, 50, 25, 12 — and only the final slide loses anything.',
      'On that final slide the departing tile turns the warning colour, dips below the rail and fades as it goes off the end, while the right-hand expression keeps a fractional tail in that same colour: 200 ÷ 16 = 12 followed by a marked .5.',
      'That coloured .5 and the tile that just fell are the same quantity shown twice, which is what ties the discarded bit to the rounding rather than leaving them as two separate facts.',
      'The caption narrates each step: "8 bits hold 3." / "One slot left — every place doubles. Now 6." / "The other way now. 8 bits hold 200." / "One slot right — every place halves. Now 50." / "The last bit ran off the end. Exact division gives 12.5, what is left is 12."',
    ],

    screen: {
      affordances: [
        'The screen plays both directions on its own and stops on the step where the bit is lost.',
        'A Replay button and a playback strip sit underneath. Once the run has finished, dragging the strip to any slide holds both expressions at that value, and returning to the moment the tile leaves the rail is where the lost bit can be looked at.',
        'The values are fixed — 3 shifted left five times and 200 shifted right four — so an article can quote any intermediate number and both forms of the expression at that step.',
      ],
    },

    useWhen: [
      'The article asserts that shifting left multiplies by two and the reader accepts it as an unrelated coincidence. The place weights printed above the slots turn it into a consequence: a bit that moves one slot left is standing on a weight twice as large, and the value is nothing but the sum of those weights.',
      'The prose depends on integer division discarding a remainder and the reader treats the discard as a rounding convention chosen by the language. Here the lost quantity is a physical tile going off the end of the rail, and the .5 it leaves in the arithmetic is the same thing counted a second way.',
      'The reader is about to unpack a field that has been shifted into position and needs to believe that moving bits is safe in one direction and lossy in the other, with the boundary being the width rather than the operation.',
      'The article needs a reason why powers of two keep appearing in sizes, alignments and indexes, and the reader takes it for convention. Every step here changes the number by exactly a factor of two because that is the only factor the place weights offer.',
      'The prose has to separate "the bits moved" from "the number changed" for an argument that follows — the tiles keeping their own faces while the weights beneath them change is that separation made visible.',
    ],

    avoidWhen: [
      'The subject is replacing multiplication or division with shifts as a performance optimisation — whether it is worth doing, whether the compiler already does it, how it behaves on values that are not powers of two. The screen shows what a shift is, never a comparison against an arithmetic version, and it offers no timing of any kind.',
      'The article is about shifting signed or negative values, or about the difference between an arithmetic and a logical shift in practice. Everything here is unsigned and vacated places are filled with 0, so the case that makes that distinction matter never arises.',
      'The subject is a hash function or a mixing step — xorshift, multiply-shift, a rolling hash, an avalanche property. Shifts there are a means of scattering a value, always composed with other operations; here a single shift is performed and nothing is combined with it.',
      'The article is about a bit set or bit array over a large universe, where a shift computes which word and which position a member falls in. That shifting is address arithmetic, and the rail here is one value rather than an index into many.',
      'The point is choosing which positions to keep — extracting a field, testing a flag, clearing bits with a constant. Nothing is selected here; every bit moves and the only thing that decides a bit\'s fate is whether it reached the edge.',
      'The subject is the family of per-position operators — AND, OR, XOR, NOT, their truth tables, how they compare. Shifting is the one operation in that family that is not a per-position rule, and it is isolated here for that reason.',
      'The article is about a computation whose result stopped being correct because it outgrew the width. A bit does leave the rail here, and it is the expected price of a known operation rather than a failure to be detected.',
      'The subject is what a pattern denotes — the sign convention, the weight of the top place, converting between widths. Every reading on the rail is an unsigned eight-bit reading and the width never changes.',
      'The subject is the order bytes take in memory. Byte swapping is often written with shifts, but the question there is which address holds which part, and there are no addresses here.',
      'The article uses "shift" for a work shift, a shift in meaning or position generally, or the Shift key.',
    ],

    contrastWith: [
      {
        concept: 'bitwiseOps',
        note: 'That concept establishes that a position normally decides on its own and names shifting as the single exception. This one takes the exception as its subject: once a position can take its value from elsewhere, the consequence is no longer about bits at all but about the size of the number.',
      },
      {
        concept: 'bitMask',
        note: 'Both are reached for together whenever a field is packed inside a word, and the reason neither replaces the other is that only one of them is arithmetic. Moving a bit changes what it is worth and therefore changes the number; covering a bit changes only whether it is present. That is why this one can be rewritten as a multiplication and that one cannot.',
      },
      {
        concept: 'positionalValue',
        note: 'This concept consumes the fact that each place weighs twice its right-hand neighbour and does nothing else with it. That one is where the fact comes from, and it regroups a row into other bases without ever moving a bit out of its place.',
      },
      {
        concept: 'integerOverflow',
        note: 'A bit pushed past the width is discarded in both. Here the discard is the stated price of a deliberate operation and it is what makes the halving round down; there the same departure is the moment a result quietly stops answering the question that was asked.',
      },
    ],
  },
};
