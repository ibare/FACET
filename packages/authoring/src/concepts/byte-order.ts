/**
 * byteOrder 개념 선언.
 *
 * canonical facet 은 `facet:byteOrder` — 0x12345678 을 네 바이트로 갈라 두 배치에
 * 늘어놓고, 각자의 규칙으로 읽으면 같은 수(305,419,896)가 돌아오지만 차례를 모르는
 * 채 읽으면 다른 수(2,018,915,346)가 되는 것을 보이는 조각이다. 바이트마다 제 색을
 * 지니고, 건너가는 띠에서 그 색들이 엇갈리는 것이 "뒤집힌다" 다.
 *
 * 타일은 돌지도 뒤집히지도 않는다 — 뒤집히는 것은 바이트의 차례이지 바이트 안의
 * 비트가 아니라는 것이 그림의 문법에 박혀 있다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩만 딸려 있다 — 값도 바이트 수도
 * 고를 수 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `bitwiseOps` 가 네 자리를 갈라 두었고 이 파일은 그 분배를 받는다.
 *
 *   bitwiseOps  규칙 자체. 자리마다 혼자, 그러나 한꺼번에.
 *   bitMask     자리를 고르는 일. 남은 비트는 제자리에 선다.
 *   bitShift    자리를 옮기는 일. 비트가 값을 지닌 채 자리를 바꾼다.
 *   이 개념      **바이트를 늘어놓는 차례**. 넷 중 유일하게 **주소가 있어야**
 *                성립한다 — 값 하나만 보아서는 물을 수조차 없는 물음이다.
 *
 * 그래서 definition 의 주어를 "값" 이 아니라 "메모리에 놓는 두 약속" 으로 세웠고,
 * 꼬리에 "뒤집히는 것은 바이트이지 그 안의 비트가 아니다" 를 박았다. 이 꼬리가
 * bitShift 와의 경계다 — 저쪽은 값을 바꾸려고 옮기고, 이쪽은 값을 지키려고 옮긴다.
 *
 * keywords 는 **배치 어휘**(엔디언 · 주소 · 바이트 뒤집기 · 헥스 덤프)를 가져간다.
 *
 * avoidWhen 이 막아야 하는 것: definition 에 "memory" 와 "byte" 가 있는 한
 * **네트워크 바이트 순서 · 직렬화 포맷 사양** 글이 반드시 걸린다. 화면은 네 바이트
 * 하나를 다룰 뿐이라 프레이밍 · 필드 배치 · 버전 관리에 답할 것이 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const byteOrderConcept: FacetConceptSource = {
  id: 'byteOrder',
  label: 'Byte Order (Endianness)',
  canonicalFacet: 'facet:byteOrder',

  surface: {
    definition:
      'The two conventions for laying a multi-byte value across consecutive memory addresses, biggest byte first or smallest first, which reverse the order of whole bytes but never the bits inside one.',
    exemplarKeywords: [
      'endianness',
      'big-endian and little-endian',
      'byte order',
      'why x86 stores a number backwards',
      'the same bytes read as a different number',
      'swapping the bytes of an integer',
      'byte swap',
      'reading a binary file written on another machine',
      'a 32-bit value spread over four addresses',
      'which end the low byte goes at',
      'a hex dump that looks reversed',
      'agreeing on an order before exchanging data',
    ],
  },

  briefing: {
    observable: [
      'At the top, four coloured tiles sit butted together behind a 0x prefix and read 12 34 56 78 — spaced as one number rather than as four separate things.',
      'Beneath them an address ruler counts 0, 1, 2, 3, and two rows of dashed empty slots hang under that ruler, labelled big-endian and little-endian in the left gutter. Both rows use the same columns, so the same address is always the same place on screen.',
      'The tiles drop straight down into the big-endian row without changing columns, which is what makes that arrangement look like no arrangement at all — it is the order a person writes the number in.',
      'Then the same bytes travel to the little-endian row along curved paths that cross in the middle of the canvas, the outer pairs dipping and the inner pairs arching so no two meet at one point.',
      'Each byte carries its own colour the whole way, so the crossing can be followed by eye: the colour that was at address 0 ends up at address 3.',
      'Every tile stays upright and keeps its two hexadecimal digits in the same order in every row. Nothing rotates or mirrors, which is the screen\'s way of saying that what reverses is the sequence of bytes and not anything inside a byte.',
      'Two read heads then sweep at the same time in opposite directions — left to right along the big-endian row, right to left along the little-endian row — and both rows finish with the identical readout at their right edge, = 305,419,896.',
      'Finally a red read head sweeps the little-endian row left to right, and the tiles it passes drop into a fourth row that is labelled big-endian in red; that row reads = 2,018,915,346, a different number built from the very same four tiles.',
      'The caption states each step: "One number, written the way people write it: the biggest part first." / "big-endian puts the biggest byte at the lowest address." / "little-endian puts the smallest byte at the lowest address. Same bytes, opposite order." / "Read each layout by its own rule and the number that comes back is the same." / "Read the little-endian bytes as big-endian instead: a different number."',
    ],

    screen: {
      affordances: [
        'The screen plays the whole sequence on its own and stops with all four rows standing and both readouts in place.',
        'Two buttons: Replay, and a step control that rewinds and then retakes the same moments one press at a time, which is how a reader can hold on the crossing paths before the bytes land.',
        'The value is fixed at 0x12345678 in four bytes, so an article can name any individual byte, the address it occupies in each row, and both readouts exactly.',
      ],
    },

    useWhen: [
      'The article says a value is stored "backwards" on common hardware and the reader concludes that the value itself is somehow altered or corrupted. Two rows built from identically coloured tiles, both reading back the same number, is the correction.',
      'The prose needs the reader to distinguish a value from its layout before an argument about files, wire formats or memory dumps can proceed, and the reader has no reason yet to think those are two different things.',
      'A reader has met a hex dump or a debugger view where the bytes appear in an order that contradicts the number printed beside them, and needs that to become expected rather than alarming.',
      'The article has to explain why two machines must agree in advance rather than working it out from the data. The final row is the failure: the bytes carry no mark saying which way they were laid, so the wrong rule produces a perfectly valid, completely wrong number.',
      'The prose is about to claim that a byte swap is a cheap fix and needs the reader to see precisely what is being swapped — whole bytes changing address, with their contents untouched.',
    ],

    avoidWhen: [
      'The subject is the specification or design of a wire format, file format or serialisation library — framing, field layout, schema evolution, versioning. Byte order is one line in such a document, and only one four-byte value appears here with nothing around it.',
      'The article is a how-to for network programming interfaces such as htonl and ntohl, or for a serialisation API. The screen explains what the two orders are, not how to call anything or when a conversion is required in code.',
      'The subject is character encoding — UTF-8, UTF-16, a byte order mark in a text file, how a code point is stored. The value here is a number and nothing on screen is text.',
      'The subject is what a pattern denotes once assembled — signedness, the weight of the top place, the declared width. The two arrangements hold the same bytes and the reading convention for those bytes is never in question.',
      'The point is moving bits to change a value — doubling, halving, packing a field. Everything here is arranged specifically so the value is preserved, and no bit changes its position within its own byte.',
      'The subject is selecting positions inside a value with a constant. Nothing is filtered here; all four bytes survive in every row.',
      'The subject is the family of per-position operators and their truth tables. No operator is applied to anything on screen.',
      'The article is about a bit set, a Bloom filter or a hash — any structure where a position is computed from data. The four positions here are addresses fixed in advance.',
      'The subject is how memory is laid out at a larger scale — alignment, padding inside a struct, which addresses are fetched together. Only the internal order of one value is at stake here.',
      'The article uses "order" for sorting, for sequencing operations, or for a purchase.',
    ],

    contrastWith: [
      {
        concept: 'bitwiseOps',
        note: 'Those rules can be stated and checked with a value in hand and nothing else. This one cannot be posed at all until the value has been given somewhere to live — it is the question in the group that only exists because numbers are kept at addresses.',
      },
      {
        concept: 'bitShift',
        note: 'Byte swapping is usually written with shifts, which makes the two easy to run together, but the intents are opposite: a shift moves bits in order to change what the value is worth, whereas this re-ordering is chosen precisely so the value survives it and only the layout differs.',
      },
      {
        concept: 'positionalValue',
        note: 'Both are ways of writing one number down more than once. That one holds the order of the digits fixed and varies the base; this one holds the digits fixed and varies their order — and unlike a change of base, reading it under the wrong assumption yields a number instead of an error.',
      },
      {
        concept: 'cacheLine',
        note: 'Both are about a value\'s relationship to the addresses holding it, but this one concerns the internal order of a single value\'s bytes, while that one concerns which neighbouring addresses are brought in together and is indifferent to how any one value is arranged.',
      },
    ],
  },
};
