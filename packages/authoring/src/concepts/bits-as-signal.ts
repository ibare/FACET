/**
 * bitsAsSignal 개념 선언.
 *
 * canonical facet 은 `facet:bitsAsSignal` — 문자 `A`(바이트 `0x41`, 비트 `0 1 0 0 0 0 0 1`)를 맨체스터 부호로
 * 한 비트씩 선에 싣는다. 비트마다 가운데서 뒤집히고, 같은 비트가 이어지는 자리에서는 경계에서도 뒤집힌다.
 * 가운데 8 · 경계 4 · 합 12. 아래 줄에 같은 비트를 전압 그대로 실은 줄이 있어 뒤집힘 3 에 그친다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `physicalLayer` 는 부호 셋을 여러 데이터로 견주고, 이웃 `frameBoundary` 는 바이트 단위의 틀 끝을 말한다.
 * 이쪽의 주장은 하나 — **비트 하나가 반 칸 둘이 되고, 가운데 뒤집힘의 방향이 곧 비트다.** 그래서 definition 은
 * half · middle · direction · 이어지는 같은 비트 쪽 낱말을 쥐고, 비교 · 값 · 틀 · 바이트 채워 넣기는 쓰지 않는다.
 *
 * 전제 (설명 글 `bitsAsSignal.md` 가 밝힌 것): 비트는 높은 자리 먼저(실제 이더넷은 낮은 자리 먼저) · 전압은 두 값 ·
 * 첫 비트 앞의 경계는 세지 않는다. 부호 규약은 IEEE 802.3 (1 = 낮음→높음, 0 = 높음→낮음).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bitsAsSignalConcept: FacetConceptSource = {
  id: 'bitsAsSignal',
  label: 'Manchester Encoding: Every Bit Flips Mid-Bit',
  canonicalFacet: 'facet:bitsAsSignal',

  surface: {
    definition:
      'In Manchester encoding each bit becomes two half-bit voltage levels with a flip in the middle, the direction of the flip giving the bit, so the line keeps changing even through a run of identical bits.',
    exemplarKeywords: [
      'Manchester code',
      'mid-bit transition',
      'low-to-high means 1',
      'IEEE 802.3 Manchester convention',
      'self-clocking signal',
      'how bits become voltage',
      'transition at the bit boundary',
      '10BASE-T encoding',
      'encoding the letter A',
    ],
  },

  briefing: {
    observable: [
      'The screen starts with the letter `A`, its byte `0x41` and the bits `0 1 0 0 0 0 0 1`; the line is still empty ("Byte 0x41. The line is still empty.").',
      'Each step lays one bit as two half cells. A 1 goes low then high ("The middle flips up"), a 0 goes high then low ("The middle flips down").',
      'When a bit equals the one before, the line must first flip at the boundary to reach its starting level ("Same as the bit before, so the line first flips at the boundary"); when it differs, the line is already where it must start.',
      'After eight bits the Manchester row reads HL LH HL HL HL HL HL LH, with counters Middle: 8 and Boundary: 4 (bits 4 to 7, the run of zeros) — twelve flips in all.',
      'A second row, "Bit as level", carries the same bits as a plain high or low voltage. It changes only where the bit value changes — its counters end at Flips: 3 and Bits held: 5, the five zeros during which it stays low — while the Manchester row still flips every bit.',
      'Bits are sent high-order first for readability, though real Ethernet sends each byte low-order first. Voltage has two levels only, and the boundary before the first bit is not counted. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one bit per step, nine steps including the start, and stops after the last bit.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to the fourth bit holds the first boundary flip inside the run of zeros, with the flat plain-level row directly beneath.',
        'The letter, the byte and the bit order are fixed, so every count on the screen can be quoted as it appears.',
      ],
    },

    useWhen: [
      'The reader has to learn to decode a Manchester waveform by eye: up in the middle is 1, down in the middle is 0, and extra flips at the edges carry no data.',
      'An article explains why a receiver can keep its clock on a Manchester line, and needs a stretch of repeated zeros where a plain level signal goes silent but this one keeps flipping.',
    ],

    avoidWhen: [
      'The article compares several line codes or discusses NRZI. Only Manchester is encoded; the plain row is there for contrast, not as a code under study.',
      'The topic is the differential Manchester variant or the opposite G. E. Thomas polarity, where 1 and 0 map to the other directions.',
      'The subject is framing, preambles or where a packet starts. One byte is shown with no frame around it.',
    ],

    contrastWith: [
      {
        concept: 'physicalLayer',
        note: 'What a Manchester bit is and what it costs are separate claims: the flip inside every bit keeps a receiver aligned on any data, and its price of twice the signalling only matters against codes that sometimes go flat.',
      },
      {
        concept: 'frameBoundary',
        note: 'Both are about a receiver finding where something ends on a raw line, but at different grain: here the edges between bits, carried by voltage flips; there the edge of a whole frame, marked by a reserved byte.',
      },
    ],
  },
};
