/**
 * memoryLeak 개념 선언.
 *
 * canonical facet 은 `facet:memoryLeak` — `let buf = null` · `for i from 1 to 4` · (몸) `buf = allocate(2)` ·
 * `valueAt(buf) = i` · (밖) `free(buf)`. 네 바퀴에 덩이 100 · 102 · 104 · 106 을 빌리고, 둘째 빌림부터 앞 덩이의 주소가
 * buf 칸에서 덮여 하나씩 잃는다. 반복을 나올 때 잃은 덩이 셋(100 · 102 · 104), 끝의 free 는 106 하나만 돌려주고 빌린 칸
 * 여섯이 남는다. 목록이 내내 비어 새 땅 끝이 108 까지 밀린다. 걸음 열여섯 (시작 포함).
 *
 * ── 서브도메인 안에서의 자리 (메모리 모델 여덟 — 돌려주는 쪽 셋)
 *
 * "leak · loop · round · only handle · piling up" 을 이쪽이 독점한다. `manualFree` 의 free list · reuse,
 * `doubleFree` 의 twice · overwrites 를 definition 에서 쓰지 않는다. `gcReachableFromRoot` 의 reachable 도 쓰지 않는다.
 * 변수와 타입 `referenceHoldsAddress` 의 reassignment 는 피해 "requests a new block into the same variable" 로 말한다.
 *
 * 전제: 힙 주소 100 · 102 · … 는 예로 정한 값이고 덩이가 나란히 붙는다는 뜻도 아니다. 할당기는 장난감 모형이다 (목록에서
 * 같은 크기를 먼저 찾고 없으면 새 땅). `i` 는 주소를 쥐는 칸으로 치지 않는다. 코드는 어느 언어도 아닌 표기다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const memoryLeakConcept: FacetConceptSource = {
  id: 'memoryLeak',
  label: 'Memory Leak (Losing the Only Address in a Loop)',
  canonicalFacet: 'facet:memoryLeak',

  surface: {
    definition:
      'A memory leak arises when a loop requests a new block into the same variable each round without giving the previous one back, so every earlier block loses its only handle and stays occupied, piling up.',
    exemplarKeywords: [
      'memory leak',
      'leaking memory',
      'forgot to call free',
      'malloc without free',
      'lost pointer',
      'orphaned allocation',
      'memory usage keeps growing',
      'long-running server memory growth',
      'Valgrind definitely lost',
      'LeakSanitizer',
    ],
  },

  briefing: {
    observable: [
      'The program is five lines: `let buf = null`, `for i from 1 to 4`, and inside the loop `buf = allocate(2)` and `valueAt(buf) = i`, then `free(buf)` after it. The screen has a Stack with the cells buf and i, a Heap, a Free list, a "Fresh" marker for where new land begins, and counters "Borrowed cells" and "Lost blocks".',
      'Round 1: `buf = allocate(2)` — "A new block starts at 100. buf now holds 100." — and cell 100 gets 1.',
      'From round 2 on, each allocation replaces the address in buf: "buf now holds 102. The old address 100 is in no cell any more." Lost blocks rise by one in rounds 2, 3 and 4, and the lost blocks stay on the heap with their values 1, 2, 3.',
      'When the loop ends, borrowed cells are 8 and lost blocks are 3 (100, 102, 104). The final `free(buf)` "returns the block at 106" to the free list, leaving 6 borrowed cells that nothing can return.',
      'The free list is empty throughout the loop, so all four requests come from new land and the Fresh marker moves from 100 to 108. Sixteen steps in all, counting the start.',
      'Heap addresses are example values and do not mean real blocks sit side by side. The allocator is a toy model: it looks for a same-size block in the free list first and otherwise cuts from new land. i is a counter, not a holder of an address. The code is a small language-neutral notation — `allocate` and `free` stand where C has `malloc` and `free`. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays all four rounds and the final free by itself and stops with three lost blocks.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to the second `buf = allocate(2)` holds the moment the first address is overwritten and the lost-block counter first rises.',
        'The program and the number of rounds are fixed.',
      ],
    },

    useWhen: [
      'The reader thinks a leak means forgetting a `free` call altogether. Here `free(buf)` is present and runs, yet three blocks stay borrowed because their addresses were overwritten first.',
      'The article explains why memory use of a long-running process grows over time, and wants a counter that rises once per loop round.',
      'The article gives the fix of freeing the old block before requesting the next one, and needs the failing version to point at.',
    ],

    avoidWhen: [
      'The subject is a leak in a garbage-collected language, such as a cache or listener list that keeps objects referenced. Here the lost blocks have no reference at all.',
      'The article is about detecting leaks with tools such as Valgrind or heap profilers. Only the leak itself is drawn.',
      'The point is objects kept alive by pointing at each other. No block here points at anything.',
    ],

    contrastWith: [
      {
        concept: 'manualFree',
        note: 'Returning a block lets the next request reuse it, so repeated requests need no new space. Without the return every request needs fresh space, and that difference is the growth a leak causes.',
      },
      {
        concept: 'doubleFree',
        note: 'Both are bookkeeping errors in manual memory management, in opposite directions: a block returned fewer times than it was borrowed, against one returned more times.',
      },
      {
        concept: 'gcReachableFromRoot',
        note: 'A block whose last address is gone is exactly what a tracing collector would find unreachable and remove. Without a collector nothing looks for it, and it stays until the program ends.',
      },
      {
        concept: 'referenceHoldsAddress',
        note: 'Replacing the address in a variable leaves the earlier data untouched. That is harmless when something else will clean the earlier data up, and a leak when nothing will.',
      },
      {
        concept: 'lostLink',
        note: 'Both are cases where the only stored address of some memory is overwritten, leaving it with no way in. A lost link cuts off the rest of a list at once; a leak cuts off one block per round.',
      },
    ],
  },
};
