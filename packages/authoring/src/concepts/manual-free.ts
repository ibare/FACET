/**
 * manualFree 개념 선언.
 *
 * canonical facet 은 `facet:manualFree` — `let a = allocate(2)` · `let b = allocate(2)` · `free(a)` · `let c = allocate(2)` ·
 * `free(b)` · `free(c)`. a · b 는 새 땅에서 100 · 102 를 받고(끝 104), free(a) 로 100 이 빈 자리 목록 맨 앞에 가고,
 * c 는 목록에서 그 100 을 다시 받는다 — 새 땅 끝은 104 그대로. 끝에 목록은 100, 102. 빌린 칸 0 → 2 → 4 → 2 → 4 → 2 → 0.
 * 걸음 일곱 (시작 포함).
 *
 * ── 서브도메인 안에서의 자리 (메모리 모델 여덟 — 돌려주는 쪽 셋)
 *
 * "free list · handed out again · new space not touched" 를 이쪽이 독점한다. `doubleFree` 의 twice · overwrite ·
 * two variables, `memoryLeak` 의 leak · loop · lost 를 definition 에서 쓰지 않는다. 스택 · 틀은 `stackVsHeap` 것이다.
 *
 * 전제: 주소 100 · 102 · 104 는 예로 정한 값이다. 할당기는 장난감 모형이다 — 목록을 앞에서부터 보아 칸 수가 꼭 같은 첫
 * 덩이를 내주고, 없으면 새 땅에서 떼며, 돌려받은 덩이는 목록 맨 앞에 넣는다. 실제 할당기는 크기별 목록 · 합치기 · 쪼개기를
 * 한다. free 는 이름 칸의 주소를 지우지 않지만 이 화면은 그 주소를 따라가지 않는다. 코드는 어느 언어도 아닌 표기다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const manualFreeConcept: FacetConceptSource = {
  id: 'manualFree',
  label: 'Manual free (Returned Memory Goes to the Free List)',
  canonicalFacet: 'facet:manualFree',

  surface: {
    definition:
      'Memory given back with free is not destroyed but placed on the allocator\'s free list, and the next request of that size receives the same block again instead of new space being cut.',
    exemplarKeywords: [
      'free',
      'malloc and free',
      'delete in C++',
      'manual memory management',
      'deallocation',
      'free list',
      'memory allocator',
      'memory reuse after free',
      'what happens to memory after free',
      'heap allocator bookkeeping',
    ],
  },

  briefing: {
    observable: [
      'The program is six lines: `let a = allocate(2)`, `let b = allocate(2)`, `free(a)`, `let c = allocate(2)`, `free(b)`, `free(c)`. The name cells a, b, c sit at the top, a row of heap cells in the middle, and a Free list with a "front" at the bottom. A marker "end" shows where new land — cells never handed out — begins, starting at 100.',
      '`let a = allocate(2)`: "the free list has no 2-cell block — cut from new land at 100", and the end moves to 102. `let b = allocate(2)` does the same at 102, moving the end to 104. Borrowed cells: 4.',
      '`free(a)`: "block 100 goes to the front of the free list" — the block leaves the heap row and drops into the list, borrowed cells fall to 2, and the link from a to the block is cut, although a\'s cell still shows 100.',
      '`let c = allocate(2)`: "block 100 comes back out of the free list" and returns to its place for c. The end marker stays at 104.',
      '`free(b)` and `free(c)` send 102 and then 100 to the front, leaving the list as 100, 102 and borrowed cells at 0. Seven steps in all, counting the start; borrowed cells go 0, 2, 4, 2, 4, 2, 0, and three requests used only four cells of new land (100 to 103).',
      'Addresses are example values. The allocator is a toy model: it scans the list from the front for the first block of exactly the requested size, otherwise cuts from new land, and puts returned blocks at the front. Real allocators keep several size classes, merge neighbouring free blocks and split large ones. The code is a small language-neutral notation — `allocate(n)` borrows n cells, `free(p)` returns the block starting at p, standing where C has `malloc` and `free`. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the six lines by itself and stops with both blocks back on the list.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to `let c = allocate(2)` holds the moment block 100 rises out of the list while the end marker stays put.',
        'The program and the block size are fixed.',
      ],
    },

    useWhen: [
      'The reader pictures `free` as erasing memory or giving it back to the operating system. The block moving into a list and coming straight back out for `c` shows where it actually goes.',
      'The article explains why a program that keeps allocating and freeing does not grow without bound, and wants the new-land marker standing still while a request is served from the list.',
    ],

    avoidWhen: [
      'The subject is what goes wrong when `free` is misused — freeing twice, forgetting to free, or using memory after freeing. Every block here is freed exactly once and never touched afterwards.',
      'The article needs a real allocator\'s design such as size classes, coalescing or ptmalloc arenas. This allocator is a toy that only reuses exact-size blocks.',
      'The topic is garbage collection. Every block here is returned by an explicit call.',
    ],

    contrastWith: [
      {
        concept: 'doubleFree',
        note: 'Returning a block puts it back into circulation exactly once. The failure case returns the same block a second time, and the allocator\'s record of available memory becomes wrong.',
      },
      {
        concept: 'memoryLeak',
        note: 'Returned memory is what keeps a program\'s footprint bounded. The opposite mistake is never returning it, so every request must be served from new space.',
      },
      {
        concept: 'danglingReference',
        note: 'Giving memory back does not clear the addresses that still name it. The return itself is this concept; following such a leftover address afterward is the separate hazard.',
      },
      {
        concept: 'stackVsHeap',
        note: 'Stack storage disappears when its function returns without anyone asking. Heap blocks stay until explicitly returned, and this concept is about what that return does.',
      },
    ],
  },
};
