/**
 * bitMask 개념 선언.
 *
 * canonical facet 은 `facet:bitMask` — 10101011(171) 위에 구멍 뚫린 덮개를 두 장
 * 차례로 씌우는 조각이다. 0F 를 씌우면 11, F0 를 씌우면 160 이 읽히고, 덮개를
 * 걷으면 171 로 돌아온다. 덮개는 조각난 뚜껑이 아니라 한 장이라 여덟 자리가
 * 한꺼번에 결정된다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩만 딸려 있다 — 값도 마스크도 고를
 * 수 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `bitwiseOps` 가 네 자리를 갈라 두었고 이 파일은 그 분배를 받는다.
 *
 *   bitwiseOps  규칙 자체. 자리마다 혼자, 그러나 한꺼번에.
 *   이 개념      **자리를 고르는 일**. 고른 자리만 남고 나머지가 0 으로 덮인다.
 *                남은 자리는 **제자리에 선다** — 이 한 마디가 bitShift 와의 경계다.
 *   bitShift     자리를 옮기는 일. 비트는 값을 지닌 채 자리를 바꾼다.
 *   byteOrder    바이트를 늘어놓는 차례.
 *
 * 둘 중 `bitShift` 가 가장 붙는다. 필드를 뽑으려면 가리고 옮겨야 하므로 실무에서
 * 늘 함께 나오기 때문이다. 그래서 definition 의 꼬리를 "남은 비트는 제자리에
 * 있다" 로 끝맺어 마주 세웠다 — 화면이 그것을 실제로 보인다. F0 를 씌운 뒤 읽히는
 * 수가 10 이 아니라 **160** 이다.
 *
 * keywords 는 **골라내기 어휘**(마스크 · 필드 뽑기 · 플래그 · 낮은 넉 자리)를
 * 가져간다. 연산자 어휘는 완제품이, 곱하고 나누는 어휘는 bitShift 가 갖는다.
 *
 * avoidWhen 이 막아야 하는 것: "mask" 와 "bit" 가 definition 에 있는 한 비트셋 ·
 * 블룸 필터 · 비트맵 인덱스 · 서브넷 마스크 글이 반드시 걸린다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bitMaskConcept: FacetConceptSource = {
  id: 'bitMask',
  label: 'Bit Mask (Keeping the Positions You Chose)',
  domain: 'computer-architecture',
  canonicalFacet: 'facet:bitMask',

  surface: {
    definition:
      'Combining a value with a pattern of chosen places so that only those places survive and every other becomes 0, while each surviving bit stays at the weight it already had.',
    exemplarKeywords: [
      'bit mask',
      'masking out the bits you do not want',
      'x & 0x0F',
      'keeping the low four bits',
      'extracting a field packed inside a word',
      'flag bits packed into one integer',
      'testing whether a flag is set',
      'clearing selected bits',
      'a constant of ones and zeros used as a filter',
      'permission bits and option flags',
      'isolating part of a value',
      'reading one field without touching the others',
    ],
  },

  briefing: {
    observable: [
      'A single row of eight cells holds 10101011, and a line directly beneath the row reads out what the row currently says: "reads 171 (0xAB)".',
      'The cover arrives from above the canvas as one solid piece with rectangular holes punched clean through it — not a set of separate lids — and a tab on its top edge carries the mask in hexadecimal, first 0x0F and then 0xF0.',
      'It hovers above the row, then descends onto it in a single movement. Nothing on the cover moves independently of anything else, so all eight positions are settled by one landing.',
      'The unpunched parts of the cover carry a 0 stamped on their faces, so the moment the cover lands those 0s are literally the values standing at those positions — the covering and the result are the same event rather than two.',
      'The cells visible through the holes change colour, and the readout beneath jumps as the cover lands: 171 becomes 11 (0x0B) under 0x0F, and 171 becomes 160 (0xA0) under 0xF0.',
      'The second reading is the instructive one: keeping the top four bits yields 160, not 10. The bits that survived are still standing at the weights they had, and the readout says so plainly.',
      'Between the two masks the cover rises and leaves the canvas, and the readout returns to 171 before the next one arrives — the value underneath was never altered by having been covered.',
      'The caption states each move as it happens: "The cover is punched: 1 is a hole, 0 is a lid." then "Only the bits under the holes come through — all eight positions decide at once." then "Take the cover off and the original value is untouched." and finally "A mask keeps just the positions you need."',
    ],

    screen: {
      affordances: [
        'The screen plays both maskings on its own and stops with the closing statement on the caption line.',
        'Two buttons: Replay, and a step control that rewinds and then retakes the same moments one press at a time, which is how a reader can hold still on the cover in mid-air before it lands.',
        'The value is fixed at 10101011 and the two masks at 0x0F and 0xF0, so an article can quote the readouts — 171, then 11, then 171 again, then 160 — by name.',
      ],
    },

    useWhen: [
      'The article writes an expression like v & 0x0F and the reader takes the constant for an arbitrary magic number. Seeing the same constant drawn as a punched cover makes the constant readable: its 1s are exactly the positions being asked for.',
      'The reader believes that pulling a field out of a word damages the word, and hesitates to do it. The cover lifting to reveal an unchanged 171 is the correction, and it is what licenses reading the same value repeatedly with different masks.',
      'The prose has to justify why packing several small things into one integer is workable at all: the argument depends on each field being retrievable without disturbing its neighbours, and that is the one thing the screen demonstrates twice over.',
      'The article is about to introduce shifting as the second half of reading a packed field, and needs the reader to feel why a second step is required at all. The 160 on screen is the gap that the shift closes.',
      'A reader is about to work with flag or permission bits and needs "test whether this bit is set" to mean something concrete — a constant with one hole in it, held over the value.',
    ],

    avoidWhen: [
      'The article is about a bit set, bitmap or bit array standing in for a set of booleans over a large universe — a Bloom filter\'s array, a bitmap index, a set of visited identifiers. Those are addressed by computing which word and which position; here one eight-bit value is covered whole by a constant naming positions directly.',
      'The subject is a hash function or any scheme that derives which positions to touch from the data. Both masks here are fixed and stated in advance, and choosing them is not part of what is shown.',
      'The subject is moving a field to where its value can be read — shifting it down, packing it into place, reassembling a word from parts. The mask leaves what it keeps at its original weight, which is exactly why it cannot do that job.',
      'The article is about subnetting, routing tables or address prefixes. A subnet mask is a mask, but the argument there is about address ranges and prefix lengths rather than about what covering positions does to a value.',
      'The subject is the family of per-position operators as such — comparing AND against OR and XOR, the truth tables, why they are cheap. Only AND appears here, and it appears with one operand chosen to act on the other.',
      'The article is about how a written pattern should be read — signedness, the weight of the top place, how many places were declared. Every readout here is an unsigned reading of eight places and the width never comes into question.',
      'The subject is a value that outgrew its container. Nothing is lost here except what the cover was chosen to hide, and the original remains available underneath.',
      'The subject is the order bytes take in memory or on a wire. A mask names positions by weight, which does not depend on which address holds which part.',
      'The article uses "mask" for hiding user input, for masking sensitive data in logs, for an image or CSS mask, or for a face covering.',
    ],

    contrastWith: [
      {
        concept: 'bitwiseOps',
        note: 'AND is one rule among several there, applied between two ordinary values. Here it has an asymmetry deliberately imposed on it: one side is a constant designed so the result reports on the other. What is being taught is the design of that constant, not the behaviour of the operator.',
      },
      {
        concept: 'bitShift',
        note: 'The two halves of reading a field that is packed inside a larger value: this one settles which positions are allowed to survive, and that one settles what they are worth once they have. Neither can do the other\'s half — covering a position cannot change any weight, which is why masking a high field yields a number far larger than the field itself.',
      },
      {
        concept: 'bloomFilter',
        note: 'Both put meaning into individual bit positions, but there the positions are produced by hashing and spread across an array much wider than any single value, and the interesting property is what happens when two items land together. Here the positions are named in advance inside one value and nothing collides.',
      },
      {
        concept: 'byteOrder',
        note: 'Selecting inside a value versus arranging a value across addresses. A mask picks positions by their weight, and weight is a property of the number rather than of the memory it sits in, so the same mask does the same thing under either arrangement.',
      },
    ],
  },
};
