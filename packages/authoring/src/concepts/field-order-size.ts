/**
 * fieldOrderSize 개념 선언.
 *
 * canonical facet 은 `facet:fieldOrderSize` — 필드 넷(char a · double d · short s · int i)을
 * 위 줄에 선언 차례대로 놓아 24 바이트를 만들고, 같은 넷을 큰 것부터 아래 줄로 옮겨
 * 16 바이트로 줄이는 화면이다. 아래 줄의 테두리는 위 줄 크기에서 시작해 새 크기로
 * 줄어든다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 재생 띠만 딸려 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념의 주어는 **선언 차례**다. 같은 내용물, 다른 차례, 다른 크기. 빈 바이트가 왜
 * 생기는지(paddingGap)는 전제로 두고 definition 에 padding · multiple 을 쓰지 않는다.
 * 정렬 상한 설정(structAlignment)은 이 화면에 없으므로 pack · misaligned 도 쓰지 않는다.
 * order · largest first · 24 → 16 은 여기만 쓴다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const fieldOrderSizeConcept: FacetConceptSource = {
  id: 'fieldOrderSize',
  label: 'Field Order and Struct Size',
  canonicalFacet: 'facet:fieldOrderSize',

  surface: {
    definition:
      'Declaration order as a cause of struct size: the same fields listed largest first let each one end where the next may begin, shrinking a 24-byte layout to 16.',
    exemplarKeywords: [
      'reorder struct fields',
      'field ordering',
      'order members by size',
      'largest first',
      'sort fields by alignment',
      'struct size depends on field order',
      'shrink a struct by rearranging',
      'wasted space between fields',
      'struct layout optimization',
      'Go struct field alignment',
      'Rust field reordering',
    ],
  },

  briefing: {
    observable: [
      'The top row lays out a, d, s, i in declared order: d is pushed from byte 1 to byte 8 leaving seven empty bytes, and i is pushed from 18 to 20 leaving two; the border closes at 24.',
      'Captions write every start as a product — "starts at 8 = 8 × 1" — so each position is visibly a multiple of the field\'s own size.',
      'The caption then announces the same fields, largest first. Each field lifts out of the top row, leaving a trace of where it was, and arcs down into the bottom row in the order d, i, s, a.',
      'In the bottom row every field starts exactly where the previous one ended; the only empty space left is a single byte at the end.',
      'The bottom row\'s border starts at the old width of 24 and shrinks to 16 as it closes, with the caption noting what it was. Each row carries a label giving its size and its empty bytes.',
      'The field blocks keep their widths between the rows; only the space between them changes.',
    ],

    screen: {
      affordances: [
        'The screen plays both rows on its own — the declared layout, the rearrangement, the smaller layout — and stops with both rows visible.',
        'Under it sit a Replay button and a playback strip. Once both rows are closed, dragging the strip handle back is how a reader can hold a single field mid-move between its two positions.',
        'The four fields and their declared order are fixed, so an article can quote 24 bytes before and 16 after and name the seven-byte gap that disappears.',
      ],
    },

    useWhen: [
      'The article advises putting the largest members first and the reader doubts it can matter when the contents are identical. The same four blocks, same widths, going from 24 bytes to 16 is the whole proof.',
      'The reader needs to see why largest first works rather than accept it: in the bottom row each field ends on a boundary the next one already satisfies, so none has anywhere to be pushed.',
      'The prose is weighing the readable declaration order against the compact one, and wants the cost of the readable one put as a number of bytes per instance.',
    ],

    avoidWhen: [
      'The article is about the order of columns in a database table or the order of keys in a JSON object or map.',
      'The subject is the order in which a loop visits array elements, or row-major against column-major traversal.',
      'The point is why an empty byte appears at all when a field does not fit where it arrives. That is assumed here, and the attention is on how much of it survives a rearrangement.',
      'The article is about serialized formats or network headers whose field order is fixed by a protocol. Rearranging is the move here, and such layouts cannot make it.',
      'The subject is compiler options that relax alignment such as #pragma pack. The rule is never loosened here.',
    ],

    contrastWith: [
      {
        concept: 'paddingGap',
        note: 'That concept explains why empty bytes appear in a struct at all; this one keeps that explanation fixed and shows how much of the empty space the author controls through the sequence alone.',
      },
      {
        concept: 'structAlignment',
        note: 'Both shrink a struct, but by different levers: this one changes where fields stand under a fixed rule and loses nothing, that one loosens the rule and pays with reads that span two words.',
      },
      {
        concept: 'arrayTraversalOrder',
        note: 'Both turn on an order the programmer picks: here the order of fields decides how many bytes a record occupies, there the order of loop indices decides how the walk meets memory that is already laid out.',
      },
    ],
  },
};
