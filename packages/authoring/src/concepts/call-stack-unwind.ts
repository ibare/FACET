/**
 * callStackUnwind 개념 선언.
 *
 * canonical facet 은 `facet:callStackUnwind` — `x = fact(4)` 가 fact(4) · fact(3) · fact(2) ·
 * fact(1) 네 틀을 얹고, 가장 위의 틀부터 걷히며 돌려준 값이 한 층 아래 틀의 빈자리로 떨어져
 * 곱셈을 채운다. 1 → 2 → 6 → 24 가 바깥의 `x` 에 들어간다. 걸음은 틀이 서고 걷히는 일 하나씩.
 *
 * ── 묶음 안에서의 자리 (재귀 셋)
 *
 * `recursionSelfCall` 이 들어가는 쪽이라면 이쪽은 **나오는 쪽** — 끝나는 차례와 돌려준 값의
 * 행선지. "unwind · return value · pop · reverse order" 를 이쪽이 독점한다. 바닥 조건 · 넘침은
 * `baseCase` 에 두고 쓰지 않는다. 예외 처리에서 말하는 stack unwinding 은 다른 것이라
 * avoidWhen 에서 막는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const callStackUnwindConcept: FacetConceptSource = {
  id: 'callStackUnwind',
  label: 'Call Stack Unwinding (Order of Returns)',
  canonicalFacet: 'facet:callStackUnwind',

  surface: {
    definition:
      'The call stack unwinds in reverse of the order calls began: the newest stack frame is popped first, and its return value fills the pending expression in the frame directly beneath.',
    exemplarKeywords: [
      'call stack',
      'stack frame',
      'unwinding',
      'return value of a recursive call',
      'recursive factorial',
      'last in first out calls',
      'pending multiplication',
      'push and pop of frames',
      'how recursion computes the result on the way back',
    ],
  },

  briefing: {
    observable: [
      'The code on the left is `function fact(n)` with `if n == 1` → `return 1` and `return n * fact(n - 1)`, called from an outer line `let x = fact(4)`. The code panel marks only the line where the current event happened.',
      'Each call drops a new frame onto the previous one: fact(4), fact(3), fact(2), fact(1), reaching depth 4. Every frame but the last shows its multiplication as `return 4 *`, `return 3 *`, `return 2 *` followed by an empty slot.',
      'fact(1) makes no further call and returns 1. From there the frames come off top first: each removed frame\'s value drops into the empty slot of the frame below, so fact(2) finishes 2 * 1, fact(3) finishes 3 * 2, fact(4) finishes 4 * 6.',
      'The last value, 24, drops into `let x =` on the outer line, outside every frame.',
      'Removed frames leave dashed outlines in place, and two columns record push order and pop order: fact(4) is first pushed and last popped, fact(1) last pushed and first popped.',
      'A step is one frame going on or coming off — eight in all. Lines evaluated in between (the test, the multiplication) are not counted as steps, and a frame shows only `n` and its empty slot, not the return address or temporaries a real frame holds.',
      'The code is written in a small language-neutral notation — `function`, `let`, `if`, `return`, indentation for bodies — rather than in any one real language.',
    ],

    screen: {
      affordances: [
        'The screen plays all four calls and four returns by itself and stops with `x = 24`.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to any pop holds a value mid-drop into the slot below.',
        'The function and the argument 4 are fixed.',
      ],
    },

    useWhen: [
      'The reader can follow a recursion down but cannot see how the answer is assembled. The empty slots filling from the top frame downward show that the multiplications happen only on the way out.',
      'The article states that the last call made is the first to finish and wants the push and pop orders side by side to prove it.',
    ],

    avoidWhen: [
      'The article uses "stack unwinding" for exception handling. Frames here end by returning normally, one value at a time.',
      'The subject is the stack as a data structure or its push and pop operations in general. Only the runtime call stack of one function is drawn.',
      'The point is what happens when a recursion never bottoms out. This one bottoms out at n == 1 after four calls.',
    ],

    contrastWith: [
      {
        concept: 'recursionSelfCall',
        note: 'The descent and the return are two halves of one recursion; this is the return, where results travel back and the order of finishing is fixed.',
      },
      {
        concept: 'baseCase',
        note: 'Finishing in reverse order presupposes that some call stopped calling. That condition, and what happens without it, belongs to the other; this takes it as given and follows the values back.',
      },
      {
        concept: 'pushPopTop',
        note: 'A single-opening container is the general rule; the runtime call stack is one place it is forced on a program, with frames as the entries and return values as what leaves.',
      },
      {
        concept: 'divideConquerCombine',
        note: 'Both put the real work on the way back up. That shape splits into two recursive calls and merges their results; here each call waits on exactly one inner call and completes a single pending operation with its result.',
      },
      {
        concept: 'exceptionPropagate',
        note: 'Both remove frames in reverse order of creation. Here each frame finishes its work and hands a value down; an exception abandons each frame\'s remaining lines and carries no value until something catches it.',
      },
      {
        concept: 'loopVsRecursion',
        note: 'The order of returns belongs to one recursion on its own. Comparing recursion with iteration asks how deep that stack had to grow before unwinding started, where a loop never grows it.',
      },
    ],
  },
};
