/**
 * structAlignment 개념 선언.
 *
 * canonical facet 은 `facet:structAlignment` — 필드 다섯(char a · double d · short s ·
 * int i · char b)을 두고 손잡이 둘(정렬 상한 pack 1·2·4·8 · 필드 순서 선언/큰 것부터)을
 * 돌리는 완결형이다. 판마다 크기 · 빈틈 · 어긋남 계기가 서고, 선언 순서에서는 크기와
 * 어긋남이 반대로 움직인다. 큰 것부터로 바꾸면 pack 을 어떻게 돌려도 16 바이트에서
 * 꿈쩍하지 않는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 *   이 개념          **정렬 상한이라는 설정값과 그 대가**. pack 을 낮추면 작아지는 대신
 *                    넓은 필드가 워드 경계에 걸쳐 한 번 읽을 것을 두 번 읽는다.
 *   paddingGap       **규칙 하나가 만드는 빈 바이트**. 크기가 필드 합보다 큰 까닭.
 *   fieldOrderSize   **선언 차례가 크기를 정한다**. 같은 필드, 다른 차례, 24 → 16.
 *
 * 어휘 배타로 가른다 — definition 에서 이 개념은 packing · misaligned · straddle 을,
 * paddingGap 은 padding · multiple · sum 을, fieldOrderSize 는 order · largest first 를
 * 가진다. 각 대표 낱말은 다른 두 definition 에 0 건이다 (기계로 확인).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const structAlignmentConcept: FacetConceptSource = {
  id: 'structAlignment',
  label: 'Struct Alignment (Packing Limit and Misaligned Fields)',
  canonicalFacet: 'facet:structAlignment',

  surface: {
    definition:
      "A struct's packing limit weighed against misaligned fields: lowering the limit shrinks the struct but lets wide fields straddle word boundaries, so one load becomes two.",
    exemplarKeywords: [
      '#pragma pack',
      '__attribute__((packed))',
      'packed struct',
      'alignment cap',
      'misaligned access',
      'unaligned load',
      'natural alignment',
      'data structure alignment',
      'alignof',
      'a field crossing a word boundary',
      'packing a struct for a wire format',
      'memory layout of a C struct',
      'size versus access cost of a struct',
    ],
  },

  briefing: {
    observable: [
      'On the first round five field blocks leave a tray that keeps their declaration order and settle one by one onto an address ruler running from 0 to 32 bytes. While a block is being placed, dots mark every multiple of its alignment on the ruler.',
      'A block first lands where the previous one ended and then, when that spot is not a multiple of its alignment, is pushed right to the next one; the bytes it passed over stay behind as an empty gap on the rail.',
      'When a field ends up at an offset that is not a multiple of its own size, a pair of red windows labelled "two reads" opens beneath it, one per word-sized cell it spans, and the caption says one read now covers two words.',
      'After the last field the end marker moves once more to a multiple of the largest field alignment, and the tail bytes it crosses are drawn as a gap of their own.',
      'Three gauges — Struct size, Padding, Misaligned — climb as each field lands and settle when the round closes. A summary caption spells out size as field bytes plus padding, with the misaligned count.',
      'In declaration order, stepping the cap from pack(1) to pack(8) moves size through 16, 18, 24, 32 while misaligned falls through 3, 1, 1, 0 — the two gauges travel in opposite directions.',
      'When a handle changes, the previous layout stays faded on the rail and the previous end is left as a dashed marker ("was N") while the blocks slide to their new positions, so each round is read against the last.',
      'Switching to largest first rearranges the blocks into d i s a b and every gap closes: 16 bytes, 0 padding, 0 misaligned. From there, every pack setting replays with nothing moving and the caption says so.',
      'The code panel highlights the running step of two functions, one returning the struct size for a list of field sizes and a pack value, the other counting misaligned fields.',
    ],

    screen: {
      affordances: [
        'Playback controls sit under the stage: play, single step, pause, reset and a speed slider. A round lays out all five fields, adds the tail, prints the summary and then waits for a handle.',
        'An Alignment cap control offers pack(1), pack(2), pack(4) and pack(8), starting at pack(8); a Field order control offers declared and largest first, starting at declared. Each change replays a full round under the new setting.',
        'The five fields — char a, double d, short s, int i, char b — are fixed, so an article can quote the size, padding and misaligned count for any of the eight combinations.',
        'The code panel starts empty with a "+ Add language" button offering Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side.',
      ],
    },

    useWhen: [
      'The article recommends #pragma pack or a packed attribute to save memory and the reader needs to see what that buys and what it costs: the struct shrinks from 32 to 16 bytes while three fields slide off their natural boundaries and each one needs two reads.',
      'The prose argues that empty bytes inside a struct are a price paid to keep every load to a single word, and the reader has to watch the size gauge and the misaligned gauge move against each other as one handle is turned.',
      'The reader should discover that the choice between wasted bytes and split reads was never forced: after rearranging the fields, every cap setting gives the same 16-byte layout with nothing misaligned.',
    ],

    avoidWhen: [
      'The article is about aligning an allocation or a whole buffer to a page or cache-line boundary — aligned_alloc, posix_memalign, alignas on an array. Only the positions of fields inside one struct are placed here.',
      'The subject is byte order — big-endian against little-endian, or swapping bytes for the network. Every field here is a block of bytes whose internal order never appears.',
      'The article is about bit fields or packing flags into the bits of one integer. The smallest unit on this ruler is a whole byte.',
      'The subject is "alignment" in the sense of text layout, sequence alignment in bioinformatics, or aligning a model with human intent.',
      'The subject is how a particular compiler or ABI assigns alignment to long double, vectors or nested structs. The model here fixes char 1, short 2, int 4, double 8 and nothing else.',
    ],

    contrastWith: [
      {
        concept: 'paddingGap',
        note: 'That concept holds one rule fixed and explains where the empty bytes come from; this one treats the rule as a setting and asks what loosening it trades away in access cost.',
      },
      {
        concept: 'fieldOrderSize',
        note: 'That concept varies only the sequence of the fields under a fixed rule; this one also varies the rule and shows that a good sequence makes the rule stop mattering.',
      },
      {
        concept: 'cacheLine',
        note: 'Both are about how bytes are grouped for the hardware: there the unit is the span a cache moves at once, here it is the word a single load reads, and a field straddling either costs an extra transfer.',
      },
      {
        concept: 'simd',
        note: 'Both care that data starts on a boundary, but for a vector instruction the boundary is set by the register width across many elements, while here it is set by the size of each individual field.',
      },
    ],
  },
};
