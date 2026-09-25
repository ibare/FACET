/**
 * loopVsRecursion 개념 선언.
 *
 * canonical facet 은 `facet:loopVsRecursion` — 같은 셈 1² + 2² + … + n² 을 `sumSquaresLoop(n)` 과
 * `sumSquaresRec(n)` 이 차례로 푼다. 반복은 한 틀 안에서 조건 칸으로 되돌아가고, 재귀는 틀을 한 층씩 쌓았다가
 * 위에서부터 걷으며 값을 한 층 아래 □ 로 내려보낸다. 손잡이 n(1~6, 처음 4)을 돌리면 두 답과 두 검사 수(n+1)는
 * 함께 늘고, 틀 최고 높이만 반복 1 · 재귀 n+1 로 갈린다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 여섯)
 *
 * 조각 여섯은 각각 한 장면이다 — 되돌아감(`loopBack`) · 끝남(`loopTermination`) · 들어감(`recursionSelfCall`) ·
 * 걷힘(`callStackUnwind`) · 바닥(`baseCase`) · 호출식 자리(`returnToCaller`). 이쪽은 그 장면들을 한 판에 잇고
 * **두 풀이를 견주는 것**을 맡는다. 그래서 definition 은 iterative · recursive · 같은 답 · 같은 검사 수 ·
 * 쓰는 공간이 n 을 따라 는다는 쪽 낱말(constant · grows linearly)을 쥐고, 조각들이 독점한 jump back ·
 * re-enters · pop · base case · overflow · return statement 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `loopVsRecursion.md` 가 밝힌 것):
 *  - 틀은 그 함수의 틀만 센다. 두 함수를 부른 바깥은 세지 않는다.
 *  - 재귀의 틀은 무한하지 않다. 파이썬은 기본 한도 1000 에서 RecursionError, 다른 언어는 스택 크기에 따라 넘친다.
 *    n 은 6 까지라 화면에서는 닿지 않는다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이라 언어별로 다른 뜻을 보이지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const loopVsRecursionConcept: FacetConceptSource = {
  id: 'loopVsRecursion',
  label: 'Loop vs Recursion (Same Sum, Different Stack Depth)',
  canonicalFacet: 'facet:loopVsRecursion',

  surface: {
    definition:
      'An iterative and a recursive solution to the same sum give equal answers after equally many tests, but the loop needs constant stack space while recursion depth grows linearly with n.',
    exemplarKeywords: [
      'iteration vs recursion',
      'recursive vs iterative solution',
      'convert recursion to a loop',
      'rewrite a loop as recursion',
      'space complexity of recursion',
      'O(n) stack space vs O(1)',
      'recursion uses more memory than a loop',
      'sum of squares',
      'when to use recursion instead of a loop',
      'recursion depth grows with the input',
    ],
  },

  briefing: {
    observable: [
      'Two columns, Loop and Recursion, sit above an Outside strip holding two Answer places. The same sum 1² + 2² + … + n² is solved first by `sumSquaresLoop(n)`, then by `sumSquaresRec(n)`.',
      'The Loop column has one frame. Each check shows `k <= n` with true or false; after the body adds `k * k` to `acc` and raises `k`, a dot runs back up to the check. The column counts "Checks" and "Loop-backs"; with n = 4 that is 5 checks and 4 loop-backs, and the frame count never goes past 1.',
      'The Recursion column builds a tower: each frame tests `n == 0`, and when it fails waits on `n * n + □` and calls `sumSquaresRec(n - 1)`, which stands one floor higher. With n = 4 the tower reaches 5 floors, `sumSquaresRec(4)` at the bottom and `sumSquaresRec(0)` at the top.',
      'Coming down, the top frame hands 0 into the □ below, each frame completes its addition — "Frame 2: 9 + 5 = 14, handed down" — and the bottom frame\'s 30 lands in its Answer place. A "Peak" mark beside the tower keeps the highest floor reached.',
      'The round ends with "Loop: 30   Recursion: 30   same answer". Four readouts under the controls carry the round: Loop checks and Base checks both n+1, Loop frames 1, Recursion frames n+1.',
      'Across the handle the pattern holds: n = 1 gives answer 1, 2 checks each, peaks 1 and 2; n = 6 gives 91, 7 checks each, peaks 1 and 7.',
      'Frames are counted for the two functions only; the outside that calls them is not counted, and floors are numbered from 1 at the bottom. Recursion depth is not unlimited in practice — Python stops at a default of 1000 with RecursionError, other languages overflow at a size set by their stack — but n goes only to 6 here, so no limit is reached. The screen does not footnote either point.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: a six-position "Up to n" slider from 1 to 6, starting at 4. Each round plays the loop to its end, then the recursion, then waits for the handle.',
        'The move that makes the idea land is stepping n upward: both answers and both check counts rise together, and only the recursion tower and its Peak mark climb with them, while the loop stays at one frame.',
        'The code panel, labelled "Loop and recursion", starts empty with a "+ Add language" button; the chosen language shows both functions and highlights the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#, not language-specific behaviour.',
      ],
    },

    useWhen: [
      'The article claims a loop and a recursion are interchangeable and needs to show exactly what is not: the answer and the number of checks match, the memory used for frames does not.',
      'A reader asks why a recursive solution can fail on large inputs where the equivalent loop does not, and the article wants the growing frame count set against a count that stays at one.',
    ],

    avoidWhen: [
      'The article is about tail-call optimization or converting recursion into tail form. Both functions here are plain, and the recursive one keeps a pending addition in every frame.',
      'The subject is recursion over trees, divide and conquer, or several recursive calls per frame. Each frame here makes at most one call, so the tower is a single column.',
      'The point is a loop or recursion that never ends. Every value of the handle finishes; nothing here runs away.',
    ],

    contrastWith: [
      {
        concept: 'loopBack',
        note: 'Going back to the condition is what makes a loop repeat; setting that repetition beside recursion is what shows it costs no extra frames however many times it happens.',
      },
      {
        concept: 'loopTermination',
        note: 'Whether a loop ends is a question about one loop in isolation. Comparing a loop with a recursion assumes both end and asks what else differs.',
      },
      {
        concept: 'recursionSelfCall',
        note: 'That each self-call starts a new invocation is the cause; the depth that grows with the input, measured against a loop solving the same problem, is the cost that follows from it.',
      },
      {
        concept: 'callStackUnwind',
        note: 'Unwinding is the order in which one recursion finishes and hands values back. The comparison with iteration is about how deep the stack had to get, and that a loop never needs the unwinding at all.',
      },
      {
        concept: 'baseCase',
        note: 'A base case that is reached is what makes a recursion finish; with that settled, the comparison asks how much stack a finishing recursion uses compared with a loop, not whether it stops.',
      },
      {
        concept: 'returnToCaller',
        note: 'A result replacing its call expression is a single-level mechanism. Recursion repeats that hand-back once per level to assemble its answer, work an iterative version never does because its running total stays in one variable.',
      },
    ],
  },
};
