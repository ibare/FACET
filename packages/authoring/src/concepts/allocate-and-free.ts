/**
 * allocateAndFree 개념 선언.
 *
 * canonical facet 은 `facet:allocateAndFree` — 한 프로그램: `function make(size)` 가 `let box = allocate(size)` ·
 * `return box`, 바깥은 `let p = null` · `for i from 1 to {n}` 몸에 `p = make(3)` · `valueAt(p) = i` 와 돌려주기 줄 ·
 * 끝에 `let c = allocate(3)` · `let d = allocate(3)`. 손잡이 둘 — 바퀴(1 ~ 4) 와 돌려주기(안 함 · 쓰고 나서 · 쓰기
 * 전에 · 두 번). 돌려주기 손잡이가 몸 안의 `free(p)` 줄을 빼고 · 옮기고 · 둘로 늘린다. 스택(바깥 틀 · make 틀) ·
 * 힙 칸 줄(@100 부터, 덩이 = 세 칸) · 빈 자리 목록 · 새 땅 끝 표식. 계기 다섯. 한 판 7 ~ 24 걸음.
 *
 * reactive 다. 손잡이를 돌릴 때마다 판 하나가 새로 돈다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 여섯)
 *
 * 조각 여섯은 한 장면씩 쥔다 — `stackVsHeap` 틀은 걷히고 힙은 남음, `pointerDereference` 주소를 따라 건넘,
 * `danglingReference` 걷힌 스택 자리를 가리킴, `manualFree` 돌려준 덩이가 목록으로 가서 다시 나감, `doubleFree`
 * 두 번 올라 두 이름이 한 칸, `memoryLeak` 반복에서 주소를 덮어 잃음. 이쪽은 **돌려주는 줄 하나의 때와 횟수가
 * 네 결말을 가르고, 그동안 스택은 틀 둘에 머문다**를 쥔다. 그래서 definition 에 조각들의 낱말(frame discarded whole ·
 * free list · handed out again · leak · only handle · twice · overwrites · dereference · stale)을 쓰지 않고 when ·
 * how often · four outcomes · same program 을 이쪽 낱말로 쓴다. 돌려준 칸에 쓰기(use after free)는 조각에 힙 쪽
 * 짝이 없어 이쪽이 가진다.
 *
 * 전제 (설명 글이 밝힌 것): 힙 100 · 스택 500 은 예로 정한 값이고 스택이 자라는 방향은 주장 밖이다. 할당기는 이중
 * 해제를 검사하지 않는 장난감이다. 돌려준 칸에 쓰는 것은 실제 C · C++ 에서 정해지지 않은 동작이다. 코드 패널은
 * 할당기(`allocate` · `release`)를 여섯 언어로 쓴 것이고 여섯 언어의 malloc/free 가 아니다 — IR 은 한 뜻을 옮길 뿐이다.
 * 화면의 프로그램은 어느 언어도 아닌 표기이며 코드 패널과 다른 것(할당기를 쓰는 쪽)이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const allocateAndFreeConcept: FacetConceptSource = {
  id: 'allocateAndFree',
  label: 'Allocate and Free (When and How Often Memory Is Returned)',
  canonicalFacet: 'facet:allocateAndFree',

  surface: {
    definition:
      'In one program that repeatedly calls a helper which borrows heap memory, where the release of that memory is placed and how many times it runs (never, after use, before use, or doubled) decides between four outcomes: steadily growing consumption, bounded consumption, writes into memory already returned, or one block given to two owners, while the call stack stays at the same two levels throughout.',
    exemplarKeywords: [
      'malloc and free',
      'when to call free',
      'manual memory management mistakes',
      'use after free',
      'CWE-416',
      'heap memory lifetime',
      'returning allocated memory from a function',
      'ownership of heap memory in C',
      'common free() bugs compared',
      'C and C++ memory management overview',
    ],
  },

  briefing: {
    observable: [
      'The screen holds a Program on one side and, on the other, a Stack, a Heap row of cells starting at @100 (each block is three cells), a Free list with its Front, and a New land end marker. The program is `function make(size)` with `let box = allocate(size)` and `return box`, then `let p = null`, `for i from 1 to 3` with `p = make(3)` and `valueAt(p) = i` in its body, and finally `let c = allocate(3)` and `let d = allocate(3)`.',
      'The Free control moves the `free(p)` line inside the loop body: out of it (Never), below the write (After use), above the write (Before use), or doubled into two lines (Twice). The Rounds control changes the number in the `for` line from 1 to 4.',
      'Every call sets a make frame (size and box at @504 and @505) on top of the outer frame (p, i, c, d at @500 to @503) and takes it down on return, when box\'s address moves over to p. The frame stands at the same place every time, and Peak frames is 2 in all sixteen combinations.',
      'Never, 3 rounds (the first round): blocks land at @100, @103 and @106; each return overwrites p ("p: @103 · Lost: @100"), so the previous block stays on the heap with nothing pointing to it. c gets @109 and d gets @112 ("c: @109 · d: @112"). Thirteen steps, New cells 15, Lost blocks 2 — and new cells grow by 3 with every extra round.',
      'After use and Before use perform the same allocations: block @100 travels between the heap and the free list, and new cells stay at 6 however many rounds run. What separates them is that Before use writes into a block already on the list ("Wrote 1 at @100 · Use after free: 1"), once per round. Twice puts @100 on the list twice per round, so the list grows, and at the end c and d both receive @100 — two arrows meet at one block.',
      'The code panel is not the program on screen: it is the allocator — `allocate` and `release` over a free list — written in six languages, one meaning carried into each, not each language\'s own malloc and free (Python, Java, C#, JavaScript and TypeScript have no free at all). The screen\'s `free(p)` corresponds to the panel\'s `release`, and steps outside the allocator (return, write, `p = null`) light no line there. The addresses 100 and 500 are example values; the allocator is a toy that does not check for a block freed twice, while most real allocators abort on it; writing to freed memory is undefined behaviour in real C and C++. The program uses a small notation that is no single language. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The reader drives this facet with two segmented sliders — Rounds (1 to 4, default 3) and Free (Never, After use, Before use, Twice, default Never) — plus playback controls. Every change starts a new round from an empty heap, with the `free(p)` lines sliding to their new places in the program.',
        'The move that makes the idea land is sweeping Free across its four settings with Rounds fixed, then raising Rounds: a different counter grows with the rounds in each faulty setting — New cells and Lost blocks under Never, Use after free under Before use, Free list under Twice — none grows under After use, and Peak frames stays at 2 throughout.',
        'Five counters sit under the controls: New cells, Lost blocks, Use after free, Free list and Peak frames.',
      ],
    },

    useWhen: [
      'The article surveys how manual memory management goes wrong — never freeing, freeing too early, freeing twice — and wants them as variations of one program set against the correct version rather than as unrelated snippets.',
      'The article explains why a free placed too early is hard to catch: it performs exactly the same allocations as the correct placement, and only the writes into returned memory tell the two apart.',
      'The article presents the lifetime of heap memory in C or C++ as a matter of the program\'s own free calls, and wants the stack holding steady at two frames beside a heap whose fate changes with those calls.',
    ],

    avoidWhen: [
      'The language in question has a garbage collector. Nothing here is reclaimed automatically; every return is an explicit line in the program.',
      'The article needs a real allocator\'s design — size classes, coalescing, or double-free detection. This allocator only reuses equal-size blocks and checks nothing.',
      'The subject is pointers as such — taking addresses, dereferencing, pointer arithmetic. Addresses appear here only as where blocks sit and which names hold them.',
    ],

    contrastWith: [
      {
        concept: 'stackVsHeap',
        note: 'That a function\'s own storage ends with the call while heap memory outlasts it is the starting point here. What this adds is that the heap memory\'s end is then entirely up to the program, and getting its timing or count wrong has distinct consequences.',
      },
      {
        concept: 'manualFree',
        note: 'Returning each block exactly once, after its last use, is one of four placements compared here. Taken alone it explains where returned memory goes; beside the others it is the only placement that keeps consumption bounded without harm.',
      },
      {
        concept: 'memoryLeak',
        note: 'Losing the only address of a block each time it is replaced is what omitting the return leads to. Here it is one outcome among four, told apart from the rest by growth that scales with the number of repetitions.',
      },
      {
        concept: 'doubleFree',
        note: 'Returning a block twice so that two later requests share it is one outcome of the count of returns. The comparison sets it beside returning too early, which does not share memory yet still writes where it no longer owns.',
      },
      {
        concept: 'danglingReference',
        note: 'Using storage after it has ended is the common hazard. A dangling reference meets it on the stack, where storage ends when a function returns; here it arises on the heap, where storage ends when the program calls free too soon.',
      },
      {
        concept: 'tracingVsRefcount',
        note: 'Both concern when heap memory is given back. Under manual management the program decides with explicit calls; with a collector the decision is taken from the pointer graph, and its failure mode is different.',
      },
    ],
  },
};
