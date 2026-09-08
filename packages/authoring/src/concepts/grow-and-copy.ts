/**
 * growAndCopy 개념 선언.
 *
 * canonical facet 은 `facet:growAndCopy` — 꽉 찬 옛 블록과 그 오른쪽에 펼쳐지는 두 배
 * 크기의 새 블록, 하나씩 포물선을 그리며 건너가는 값, 아래로 떨어져 사라지는 옛 블록,
 * 가운데로 미끄러져 들어와 자리를 대신하는 새 블록.
 *
 * 한 주장만 말하는 조각(piece) facet 이라 canonicalFacet 은 자기 자신이고 `aspects`
 * 를 쓰지 않는다.
 *
 * mount 즉시 아홉 걸음을 스스로 재생하고 멈춘다. 다시 보기와 한 걸음이 있으나 둘 다
 * 눌러야 완성되는 조작이 아니다.
 *
 * 변별어를 붙인 이유: "성장" 만으로는 컬렉션이 커지는 온갖 이야기가 걸린다. 이 개념이
 * 말하는 것은 새 자리를 얻어 값을 베껴 옮기는 그 한 장면이므로 복사를 id 에 담는다
 * (C4 명명 규칙 2).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const growAndCopyConcept: FacetConceptSource = {
  id: 'growAndCopy',
  label: 'Growing a Full Array by Copying',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:growAndCopy',

  surface: {
    definition:
      'Enlarging a full fixed-size array by allocating a larger block elsewhere, copying every existing element into it, and releasing the old block, which changes the address.',
    exemplarKeywords: [
      'dynamic array',
      'resize',
      'capacity',
      'doubling',
      'reallocation',
      'copy on grow',
      'vector push_back',
      'ArrayList growth',
      'pointer invalidation',
      'size versus capacity',
    ],
  },

  briefing: {
    observable: [
      'The incoming value waits above a block whose four slots are all taken, drops toward a dashed red outline where a fifth slot would be, and bounces back — the block does not stretch.',
      'A second block unrolls to the right, eight slots wide, with a different address written beneath it and its byte size and slot count on the line below that.',
      'The values cross one at a time, each on its own arc, and the source slot dims to a spent shade as its copy lands. Four crossings, not one motion.',
      'The old block then drops out of the bottom of the frame and the new block slides over into the space it left, so the address standing under the row is now the new one.',
      'Only after that does the waiting value land, into the first free slot, and the closing line states where it ended: capacity 8, five values, three slots to spare, and an address different from the one it started at.',
    ],

    screen: {
      affordances: [
        'One resize plays out end to end on its own and stops with the new block in place.',
        'Two buttons — Replay, and one that advances the moments singly, which is the way to sit on the four copies rather than let them blur into one event.',
        'The addresses are declared for the picture, but the byte figures follow from them: four-byte elements, four slots becoming eight, thirty-two bytes at the new address.',
      ],
    },

    useWhen: [
      'The prose says a dynamic array grows, and grow sounds like the existing block stretching where it stands. What the word actually covers is a move to a different address with every value copied by hand.',
      'The article needs to explain why a pointer or reference into an array can go stale, or why one append in a run of cheap ones is not cheap at all. This is that one append, followed from the refusal to the landing.',
    ],

    avoidWhen: [
      'The subject is garbage collection or heap compaction moving objects on its own schedule. The move here is caused by one append and is fully accounted for.',
      'The article is about rehashing a hash table as it fills. Both migrate to a bigger block, but there every key is thrown again by the hash function rather than copied to the same position.',
      'The point is the amortized analysis itself — the accounting that averages the expensive append over the cheap ones. A single resize is shown here, not a run of appends to average over.',
      'The subject is a particular library\'s growth policy: which factor it uses, when it shrinks, how it reserves. One doubling is shown and no policy is named.',
    ],

    contrastWith: [
      {
        concept: 'array',
        note: 'A resize is one of the things an array does; here it is the only thing, slowed down to the point where the copying is countable.',
      },
      {
        concept: 'loadFactorRehash',
        note: 'The same migration to a larger block, triggered differently and paid differently: one moves values to matching positions, the other must recompute where every key belongs.',
      },
      {
        concept: 'shiftOnInsert',
        note: 'Shifting is what an insertion costs when there is room; this is what it costs when there is none, and the two costs stack in that order.',
      },
    ],
  },
};
