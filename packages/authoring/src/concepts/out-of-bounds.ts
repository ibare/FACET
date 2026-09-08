/**
 * outOfBounds 개념 선언.
 *
 * canonical facet 은 `facet:outOfBounds` — 주소 순서대로 틈 없이 붙은 메모리 띠 한 줄,
 * 그 위를 미끄러지는 커서, 배열의 끝을 긋는 굵은 선, 나중에 내려서는 경계 검사 벽.
 *
 * 한 주장만 말하는 조각(piece) facet 이라 canonicalFacet 은 자기 자신이고 `aspects`
 * 를 쓰지 않는다.
 *
 * mount 즉시 여덟 걸음을 스스로 재생하고 멈춘다. 다시 보기와 한 걸음이 있으나 둘 다
 * 눌러야 완성되는 조작이 아니다.
 *
 * 변별어를 붙이지 않은 이유: "경계 밖 접근" 은 단독으로 불려도 다른 개념과 헷갈리지
 * 않는다 (C4 명명 규칙 3).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const outOfBoundsConcept: FacetConceptSource = {
  id: 'outOfBounds',
  label: 'Reading Past the End of an Array',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:outOfBounds',

  surface: {
    definition:
      'Using an index outside an array\'s valid range, where the address arithmetic still yields an address and the access lands on memory the array does not own.',
    exemplarKeywords: [
      'out of bounds',
      'index out of range',
      'off-by-one',
      'array bounds check',
      'buffer overrun',
      'reading past the end',
      'undefined behavior',
      'valid index range',
      'IndexOutOfRangeException',
      'memory safety',
    ],
  },

  briefing: {
    observable: [
      'The memory strip is one unbroken row: five array cells and then a separate variable called count, with no gap and no marker between them other than the addresses.',
      'A bracket under the array states the range it owns, 0x1000 – 0x1013 · 20 bytes, and a heavy vertical line marks where that ownership stops.',
      'The expression at the top recomputes 0x1000 + i × 4 for each index, and for index 5 it produces 0x1014 with no complaint — the arithmetic has nothing to compare against.',
      'The cursor slides past the end line onto the neighbouring cell and the read succeeds, returning 1000. The label under that cell reads count, not an array index, so whose value it is stays visible.',
      'A guard bar then rises at the end of the array carrying 0 ≤ i < 5, and the cursor sent to index 5 stops against it before it ever reaches the address.',
    ],

    screen: {
      affordances: [
        'It runs on its own: a safe access first, the same arithmetic pushed one cell further, then the check being installed.',
        'Two buttons — Replay, and one that steps the eight moments forward from the start.',
        'Which value sits next to the array is a stated assumption of the picture, which is itself the point: what an out-of-range read finds is whatever happens to be there.',
      ],
    },

    useWhen: [
      'The article treats an index past the end as an error the machine raises, when without an added check the arithmetic simply produces an address and hands back whatever is stored there.',
      'A bounds check is about to be introduced as something a language chooses to add. Watching the unchecked read succeed first is what makes the check read as a decision rather than a formality.',
    ],

    avoidWhen: [
      'The article is about exception handling as a language mechanism — throwing, catching, stack unwinding. Nothing here is raised or caught.',
      'The subject is exploiting an overflow: overwriting a return address, injecting code, stack smashing. This is a single read of a neighbouring value, and nothing on screen is written or attacked.',
      'The point is null or undefined access, or a type error. Those fail because there is no object; here the address is perfectly ordinary and the failure is that it belongs to someone else.',
      'The article is about how a compiler removes redundant bounds checks for speed. The check here is installed, not optimized away.',
    ],

    contrastWith: [
      {
        concept: 'indexAddressCalc',
        note: 'The same multiply and add, asked a different question: one shows what it computes, the other shows that it keeps computing when it should not.',
      },
      {
        concept: 'circularBufferWrap',
        note: 'Both concern an index that runs off the end. One shows the index continuing into memory it does not own; the other shows it folded back to the start on purpose.',
      },
      {
        concept: 'array',
        note: 'The array concept covers what an index does inside the range it owns; this one is entirely about the moment the index leaves that range.',
      },
    ],
  },
};
