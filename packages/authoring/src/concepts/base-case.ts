/**
 * baseCase 개념 선언.
 *
 * canonical facet 은 `facet:baseCase` — n 을 가로, 깊이를 세로로 둔 판. `down(4)` 는 4 · 2 · 0
 * 으로 바닥(0)에 내려앉아 꺾이고 "floor" 가 거슬러 올라 `a` 에 들어간다. `down(5)` 는
 * 5 · 3 · 1 · −1 · −3 으로 0 을 건너뛰고 틀 한도 5 에 이른 뒤 다음 부르기 down(-5) 가
 * StackOverflow 로 넘친다. 코드는 어느 한 언어도 아닌 표기(`tasks/pseudo-notation.md`)다.
 *
 * ── 묶음 안에서의 자리 (재귀 셋)
 *
 * "base case · overflow · stop condition · recursion limit" 을 이쪽이 독점한다. 돌려준 값의
 * 행선지는 `callStackUnwind` 에, 첫 줄로 다시 들어가는 흐름은 `recursionSelfCall` 에 두고
 * return value · unwind · invocation 같은 말을 쓰지 않는다. `loopTermination` 과는 "끝나지
 * 않음" 이 겹치므로 loop · reads · assigns 를 쓰지 않는다.
 *
 * 전제: 틀 한도 5 는 예로 정한 값이다 (파이썬 기본은 1000 — 실제 언어의 사실이라 규약상 써도 된다). 화면은 각주를 달지 않으므로
 * 여기서 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const baseCaseConcept: FacetConceptSource = {
  id: 'baseCase',
  label: 'Base Case (A Recursion Must Reach It)',
  canonicalFacet: 'facet:baseCase',

  surface: {
    definition:
      'A recursion turns back only at a call where its base case holds; if the arguments step past that stop condition, calls keep piling up until the depth limit overflows.',
    exemplarKeywords: [
      'base case',
      'stopping condition of recursion',
      'stack overflow',
      'StackOverflow',
      'RecursionError',
      'maximum recursion depth exceeded',
      'infinite recursion',
      'recursion limit',
      'argument must approach the base case',
      'n <= 0 instead of n == 0',
    ],
  },

  briefing: {
    observable: [
      'The board puts n on a horizontal number line from −5 to 5 and call depth downward; a vertical line marks the floor at 0 and a horizontal line marks "frame limit 5".',
      'The function is `function down(n)`: `if n == 0` → `return "floor"`, otherwise `return down(n - 2)`. It is called twice, `let a = down(4)` and `let b = down(5)`.',
      'For `down(4)` each new frame jumps one row down and two places toward 0: 4, 2, 0. At 0 the caption reads "base condition n == 0 is true. The calls stop here and it turns back", and "floor" climbs back up the path row by row until `a = "floor"`.',
      'For `down(5)` the frames land at 5, 3, 1, then −1 — the caption says it jumped over the floor without touching it — and then −3, moving away. That is five frames; the next call down(-5) goes past the limit line and the caption reads "Already 5 frames — the next call down(-5) overflows with StackOverflow. The program stops." The line for `b` ends in `→ StackOverflow`, and `b` never receives a value.',
      'Both runs use the identical base condition; the only difference is whether the arguments land on 0.',
      'The frame limit of 5 is an example value chosen so the whole chain fits on screen; real limits are far larger — Python\'s default recursion limit is 1000, where the error is called RecursionError. The screen does not footnote this.',
      'The code is written in a small language-neutral notation — `function`, `let`, `if`, `return`, indentation for bodies — rather than in any one real language; `StackOverflow` is its name for the error.',
    ],

    screen: {
      affordances: [
        'The screen plays both calls in sequence by itself — the landing one first, then the one that overflows — and stops on the error.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to the down(-1) step holds the moment the chain crosses 0 without landing.',
        'The function, the two arguments and the limit are fixed.',
      ],
    },

    useWhen: [
      'The reader believes that writing a base case is enough. Two calls against the same `if n == 0` — one landing, one stepping over — show that the arguments must actually reach it.',
      'The article explains a stack overflow (RecursionError in Python) and wants to show the frames accumulating to a limit rather than just naming the error.',
      'The article recommends a base case such as `n <= 0` that cannot be skipped, and needs the case it protects against.',
    ],

    avoidWhen: [
      'The subject is a `while` loop that does not end. There are no loops here; the failure is frames accumulating.',
      'The article needs the real recursion limit of a language or tuning of it. The limit here is an example value of 5.',
      'The point is how returned values are combined on the way back, as in factorial. Here every frame hands back the same string unchanged.',
    ],

    contrastWith: [
      {
        concept: 'recursionSelfCall',
        note: 'Re-entering the same code is the mechanism; a call that declines to re-enter is what lets the mechanism end. This concept is about that call, and about the arguments having to arrive at it.',
      },
      {
        concept: 'callStackUnwind',
        note: 'The reverse-order finish begins only once some call stops calling. This is about whether that point is reached at all; the other is about what happens after it is.',
      },
      {
        concept: 'loopTermination',
        note: 'Both are about code that fails to end, from different causes: a recursion whose argument skips its stopping value, against a loop whose body never touches what its test reads. Only the recursive failure runs out of space and ends in an error.',
      },
      {
        concept: 'splitUntilOne',
        note: 'In a divide step the one-item group is a base case that cannot be missed, since halving always arrives there. Here the step size can carry the argument past the stopping value, which is exactly what makes the base case worth checking.',
      },
    ],
  },
};
