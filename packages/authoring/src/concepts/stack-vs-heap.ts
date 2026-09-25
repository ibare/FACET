/**
 * stackVsHeap 개념 선언.
 *
 * canonical facet 은 `facet:stackVsHeap` — `function make(v)` 가 `let box = allocate(1)` · `valueAt(box) = v` ·
 * `return box`. 바깥에서 `let p = make(7)` · `let q = make(9)` · `show valueAt(p)`. make 의 틀은 두 번 다 같은
 * 자리 502 · 503 에 섰다가 통째로 걷히고, 빌린 힙 칸은 100 · 101 로 다른 자리에 쌓여 남는다. 출력 7. 걸음 열둘
 * (시작 포함).
 *
 * ── 서브도메인 안에서의 자리 (메모리 모델 여덟)
 *
 * "stack frame · discarded whole · heap persists past the call" 을 이쪽이 독점한다. 주소를 따라 건너가는 일은
 * `pointerDereference` 에, 돌려주기 · 빈 자리 목록은 `manualFree` 에 두고 dereference · free list · reclaim 을
 * definition 에서 쓰지 않는다. 걷힌 자리를 다음 부르기가 다시 쓰는 것은 화면에 있지만(502 · 503) definition 에는
 * 넣지 않는다 — 변수와 타입 `danglingReference` 가 "reuses that storage" 를 가진다. `callStackUnwind` 의 unwind ·
 * pop · reverse order 도 쓰지 않는다.
 *
 * 전제: 주소 500 · 100 은 예로 정한 값이다. 실제 스택이 자라는 방향(대개 주소가 줄어드는 쪽)은 주장 밖이다.
 * `allocate(1)` 은 칸 하나를 빌리는 표기이고, 이 화면은 빌린 칸을 돌려주지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const stackVsHeapConcept: FacetConceptSource = {
  id: 'stackVsHeap',
  label: 'Stack vs Heap (What Survives a Returning Function)',
  canonicalFacet: 'facet:stackVsHeap',

  surface: {
    definition:
      'A function\'s stack frame is discarded whole when it returns, while heap memory requested inside it persists past the call at its own location, held only by the value the function hands back.',
    exemplarKeywords: [
      'stack vs heap',
      'stack memory and heap memory',
      'stack allocation vs heap allocation',
      'local variables live on the stack',
      'malloc inside a function',
      'returning a heap pointer from a function',
      'lifetime of heap memory',
      'automatic storage duration',
      'where do objects created in a function live',
      'new in C++ vs a local variable',
    ],
  },

  briefing: {
    observable: [
      'Three columns: a seven-line program on the left, a Stack in the middle that grows upward, and a Heap on the right. The number beside each cell is its address.',
      'The program is `function make(v)` with `let box = allocate(1)`, `valueAt(box) = v` and `return box`, then the outer lines `let p = make(7)`, `let q = make(9)`, `show valueAt(p)`.',
      'At the start the outer frame holds the empty cells of p and q at 500 and 501. Calling make(7) sets a make frame on top with v and box at 502 and 503; `allocate(1)` grows heap cell 100 with an arrow from box, and 7 goes into it.',
      'On return the caption reads "The make frame is taken down, slots and all." The frame lifts away and the top line drops back, but heap cell 100 keeps 7, now reached only by the arrow from p.',
      'make(9) repeats this: the frame stands again at the very same 502 and 503 and is taken down again, while the new heap cell appears at a different place, 101, holding 9. Counters read "Stack slots" (peaking at 4, ending at 2) and "Heap cells in use" (0, 1, 2 — none handed back).',
      '`show valueAt(p)` follows the address in p to heap cell 100 and prints 7. Twelve steps in all, counting the start; the calling line is visited twice, once to call and once to finish when the value lands in the name.',
      'The addresses 500 and 100 are example values, and the direction the stack grows in real machines (usually toward lower addresses) is outside the claim; only "same place again for the frame, a new place for each heap cell" is. The code is a small language-neutral notation — `allocate(1)` borrows one heap cell, `valueAt(box)` means the cell box points at. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the program by itself and stops after printing 7, with two heap cells left in use.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to either finishing step holds the moment the frame has gone and the heap cell remains.',
        'The program and its values are fixed.',
      ],
    },

    useWhen: [
      'The reader assumes everything made inside a function disappears when it returns. The frame lifting away while heap cell 100 still holds 7 shows which half of that is true.',
      'The article explains why a function may return memory it obtained with `malloc` or `new` but not a local variable, and wants the frame and the heap cell side by side at the moment of return.',
      'The article contrasts how the two regions are laid out: repeated calls land their frame in the same slots, while each request for heap memory takes a fresh cell.',
    ],

    avoidWhen: [
      'The subject is the heap data structure used for priority queues. Here the heap is the memory region, not a tree.',
      'The article needs heap memory being returned or collected. Nothing is ever given back here; heap cells in use only grow from 0 to 2.',
      'The point is how deep recursion exhausts the stack. Only one extra frame ever stands at a time.',
    ],

    contrastWith: [
      {
        concept: 'callStackUnwind',
        note: 'That concept is about the order in which frames finish and where each result goes. This one is about what a finished frame leaves behind: nothing of its own slots, but anything it placed on the heap.',
      },
      {
        concept: 'danglingReference',
        note: 'Both begin when a function returns something that points into memory. Pointing into the returning frame\'s own slots goes wrong because those slots are released; pointing into the heap is safe because that memory outlasts the call.',
      },
      {
        concept: 'manualFree',
        note: 'Heap memory outliving the call raises the question of when it ends. This concept stops at "it stays"; giving it back to the allocator is the next step and a separate claim.',
      },
      {
        concept: 'gcReachableFromRoot',
        note: 'Heap memory that survives a call must eventually be removed by someone. This concept establishes only that it survives; a tracing collector is one answer to who removes it and when.',
      },
    ],
  },
};
