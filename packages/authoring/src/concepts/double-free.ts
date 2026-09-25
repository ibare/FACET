/**
 * doubleFree 개념 선언.
 *
 * canonical facet 은 `facet:doubleFree` — `let a = allocate(1)` · `free(a)` · `free(a)` · `let b = allocate(1)` ·
 * `let c = allocate(1)` · `valueAt(b) = 5` · `valueAt(c) = 9` · `show valueAt(b)`. 칸 100 이 빈 자리 목록에
 * [100, 100] 으로 두 번 오르고, b 와 c 가 차례로 같은 100 을 받는다. c 의 9 가 b 의 5 를 덮어 출력은 9. 새 땅은 칸 하나
 * (100)만 쓰였다. 걸음 아홉 (시작 포함).
 *
 * ── 서브도메인 안에서의 자리 (메모리 모델 여덟 — 돌려주는 쪽 셋)
 *
 * "twice · two variables receive one block · overwrites" 를 이쪽이 독점한다. `manualFree` 의 free list · reuse ·
 * new space 를 definition 에서 쓰지 않고 목록은 "record of available blocks" 로 말한다. `memoryLeak` 의 leak · loop ·
 * lost 도 쓰지 않는다. 변수와 타입 `aliasing` 과는 "의도한 공유 vs 할당기가 만든 우연한 공유" 로 가른다.
 *
 * 전제: 힙 100 · 스택 500 · 501 · 502 는 예로 정한 값이고 스택 방향은 주장 밖이다. 할당기는 검사하지 않는 장난감이다 —
 * 실제 할당기의 다수(glibc 의 "free(): double free detected" 등)는 이중 해제를 알아채 멈춘다. 알아채지 못할 때 일어나는
 * 일이 이 화면이다. 코드는 어느 언어도 아닌 표기다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const doubleFreeConcept: FacetConceptSource = {
  id: 'doubleFree',
  label: 'Double Free (One Block Handed to Two Owners)',
  canonicalFacet: 'facet:doubleFree',

  surface: {
    definition:
      'Freeing one block twice lists it twice among the allocator\'s available blocks, so two later allocations both get it and a write through one variable silently overwrites the other\'s value.',
    exemplarKeywords: [
      'double free',
      'double-free vulnerability',
      'free(): double free detected in tcache',
      'CWE-415',
      'freeing a pointer twice',
      'heap corruption',
      'two pointers to the same allocation',
      'set pointer to NULL after free',
      'memory safety bug in C',
    ],
  },

  briefing: {
    observable: [
      'The program is eight lines: `let a = allocate(1)`, `free(a)`, `free(a)`, `let b = allocate(1)`, `let c = allocate(1)`, `valueAt(b) = 5`, `valueAt(c) = 9`, `show valueAt(b)`. The screen has a Stack with the cells of a, b, c at 500, 501, 502, a Heap, a Free list, a New land marker and an Output.',
      '`let a = allocate(1)` cuts cell 100 from new land, which now starts at 101. The first `free(a)` puts 100 at the front of the free list ("Times 100 is in the list: 1"); the second puts it there again ("Times 100 is in the list: 2"), because a still holds 100.',
      '`let b = allocate(1)` takes 100 from the front of the list, leaving one copy. `let c = allocate(1)` takes the other copy — "Cell 100 is held by: b, c." New land stays at 101 throughout.',
      '`valueAt(b) = 5` writes 5 into cell 100; `valueAt(c) = 9` writes 9 into the same cell ("Overwritten: 5."). `show valueAt(b)` prints 9, with "Put in through b: 5." shown beside it.',
      'Nine steps in all, counting the start. Three allocations were made, but new land supplied only one cell.',
      'The addresses are example values and the direction the stack grows is outside the claim. The allocator is a toy that does not check whether a block is already listed; most real allocators detect a double free and abort the program, and this screen shows what happens when that check is absent. The code is a small language-neutral notation — `allocate`, `free` and `valueAt` stand where C has `malloc`, `free` and `*p`. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the eight lines by itself and stops after printing 9.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to the second `free(a)` holds the moment 100 appears in the list twice.',
        'The program is fixed.',
      ],
    },

    useWhen: [
      'The reader thinks freeing something twice is harmless because the memory is already free. Two later allocations receiving the same cell, and b printing 9 instead of 5, shows the damage.',
      'The article discusses double free as a security bug (CWE-415) or explains the advice to set a pointer to NULL after freeing it, and needs the mechanism rather than just the name.',
    ],

    avoidWhen: [
      'The article describes a real allocator\'s double-free detection or crash message. This allocator checks nothing, on purpose.',
      'The subject is use-after-free in general. The freed variable a is never read or written after being freed here; the harm arrives through b and c.',
      'The point is two variables deliberately sharing one object. The sharing here is an accident of the allocator.',
    ],

    contrastWith: [
      {
        concept: 'manualFree',
        note: 'Returning a block once makes it available for exactly one later request. Returning it again makes the allocator promise the same block to two requests.',
      },
      {
        concept: 'aliasing',
        note: 'Both end with two variables naming one piece of memory. Aliasing is created by the program on purpose and each side expects to see the other\'s changes; here the allocator creates it and each side believes the memory is its own.',
      },
      {
        concept: 'danglingReference',
        note: 'Both come from an address that outlives the storage behind it. A dangling reference reads what someone else later put there; a double free hands that storage out a second time.',
      },
      {
        concept: 'memoryLeak',
        note: 'The two classic errors of manual memory management point in opposite directions: returning a block more often than it was borrowed, or less often.',
      },
      {
        concept: 'allocateAndFree',
        note: 'Returning a block twice is one wrong count. The wider claim weighs timing and count of returns against each other (none, too early, too many), with this as the case of too many.',
      },
    ],
  },
};
