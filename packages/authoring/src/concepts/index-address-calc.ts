/**
 * indexAddressCalc 개념 선언.
 *
 * canonical facet 은 `facet:indexAddressCalc` — 주소가 붙은 메모리 띠 한 줄과 그 아래
 * 계산 레일 (곱셈 관문 · 덧셈 관문), 그리고 레일을 떠나 제 칸으로 곧장 날아가는 주소.
 *
 * 한 주장만 말하는 조각(piece) facet 이라 누구의 하위도 아니다. canonicalFacet 은
 * 자기 자신이고 `aspects` 를 쓰지 않는다.
 *
 * mount 즉시 스스로 여덟 걸음을 재생하고 멈춘다. 눌러야 완성되는 화면이 아니며,
 * 다시 보기와 한 걸음은 곱씹으려는 사람을 위한 두 번째 통로다.
 *
 * 변별어를 붙인 이유: `index` 하나로는 검색 색인 · 데이터베이스 색인이 같은 이름을
 * 자칭한다. 이 개념이 다루는 것은 번호를 주소로 바꾸는 셈이므로 그것을 id 에 담는다
 * (C4 명명 규칙 2).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const indexAddressCalcConcept: FacetConceptSource = {
  id: 'indexAddressCalc',
  label: 'Index to Address Arithmetic',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:indexAddressCalc',

  surface: {
    definition:
      'Reaching an array element by computing its address as the base address plus the index multiplied by the element size, instead of scanning the cells.',
    exemplarKeywords: [
      'random access',
      'O(1) indexing',
      'base address plus offset',
      'element size',
      'stride',
      'pointer arithmetic',
      'contiguous memory',
      'zero-based index',
      'why arrays are fast',
      'address calculation',
    ],
  },

  briefing: {
    observable: [
      'The cells carry their hex addresses above them and their arr[i] labels below, and consecutive addresses differ by four, so the arithmetic has visible ingredients before anything is calculated.',
      'The index enters a rail beneath the row and passes through two gates written as "× 4" and "+ 0x1000", becoming an offset and then an address.',
      'The rule is written out between the cells and the rail as addr(i) = 0x1000 + i × 4, so the picture and the formula are the same statement.',
      'The finished address leaves the rail and flies straight to its cell, arcing over the cells in between rather than stepping through them.',
      'It runs twice, for index 3 and then for index 5. The farther index travels no further along the rail and passes the same two gates, and the closing line says so: any index, the same one calculation.',
    ],

    screen: {
      affordances: [
        'The screen plays itself through both indices and stops, having made its point without a click.',
        'Two buttons: Replay, and one that walks the eight moments forward one at a time from the beginning.',
        'The numbers are declared rather than measured — a base of 0x1000 and four-byte elements — and the addresses on screen follow from them exactly.',
      ],
    },

    useWhen: [
      'The reader has been told that reaching any element takes constant time and needs a reason rather than a restatement. The two operations that make it true are performed here on real byte addresses.',
      'The prose depends on elements being equal in width and laid end to end, without saying why that matters. The multiplication is the place where that requirement earns its keep.',
    ],

    avoidWhen: [
      'The article is about a database index or a search index. The word is the same and the subject is not — nothing here builds a lookup structure.',
      'The subject is a hash map, where the address is computed from the content of a key rather than from a position. No hash function appears on this screen.',
      'The article is about row-major order, strides, or addressing a two-dimensional array. Only one dimension is laid out here.',
      'The point is that a linked structure cannot do this. That case is argued by walking pointers, and there are no pointers on this screen to walk.',
    ],

    contrastWith: [
      {
        concept: 'array',
        note: 'The same arithmetic underlies both, but here it is the whole subject rather than one of several operations a reader can drive.',
      },
      {
        concept: 'outOfBounds',
        note: 'The arithmetic is identical in both; the difference is that one asks what it computes and the other asks what it computes when the index is too large.',
      },
      {
        concept: 'hashToBucket',
        note: 'Both turn a number into a location in one step, but one derives it from where the element sits and the other from what the key contains.',
      },
    ],
  },
};
