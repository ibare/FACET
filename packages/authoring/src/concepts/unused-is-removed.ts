/**
 * unusedIsRemoved 개념 선언.
 *
 * canonical facet 은 `facet:unusedIsRemoved` — 일곱 줄 함수 `area(w, h)` 에서 판마다 `let` 이름의 쓰임을 세고
 * 쓰임 0 인 줄을 한꺼번에 떨군다. 판 1 에 L6(`r`), 판 2 에 L4 · L5(`q` · `s`), 판 3 에 L3(`p`), 판 4 는 지울 것이
 * 없어 멈춘다. `return a` 가 `a` 를 끝까지 붙잡는다. 줄 7 → 3 · 연산 5 → 1. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `foldAndSweep` 은 앞 패스(전파 + 폴딩)가 쓰임을 없애 두어 한 판에 다섯이 떨어지는 얽힘을, 형제
 * `foldAtCompile` 은 줄을 지우지 않고 식을 접는 쪽을 맡는다. 이쪽의 한 동사는 "풀려 떨어진다" — 지운 줄이
 * 놓은 쓰임 때문에 위쪽 줄이 다음 판에 떨어지는 번짐이다. 그래서 definition 은 use count · zero · cascade ·
 * repeated rounds · 돌려주는 값이 멈춘다는 쪽 낱말을 쥐고, folding · propagation · pass ordering 을 쓰지 않는다.
 *
 * 전제 (설명 글 `unusedIsRemoved.md`): 원시 프로그램은 어느 언어도 아닌 표기다. 판마다 한꺼번에 센다.
 * 매개변수와 `return` 줄은 지우지 않고, 밖에 흔적을 남기는 줄은 쓰임 0 이어도 지우지 않는 것이 규약이다(이 예에는 없다).
 * 갈래가 없어 흐름을 따지지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const unusedIsRemovedConcept: FacetConceptSource = {
  id: 'unusedIsRemoved',
  label: 'Dead-Code Elimination by Use Counts',
  canonicalFacet: 'facet:unusedIsRemoved',

  surface: {
    definition:
      'Dead-code elimination counts how many times each assigned name is read and deletes lines read zero times; every deletion lowers the counts of names that line read, so removal cascades over rounds until only returned values remain held.',
    exemplarKeywords: [
      'dead code elimination',
      'unused variable removed by compiler',
      'dead store',
      'use count',
      'def-use chain',
      'cascading dead code',
      'iterate until nothing changes',
      'fixed point',
      'unused computation',
      'compiler warning unused variable',
    ],
  },

  briefing: {
    observable: [
      'Seven lines stand as L1 to L7: `function area(w, h)`, `let a = w * h`, `let p = w + h`, `let q = p * 2`, `let s = a - 1`, `let r = q + s`, `return a`. A Uses column holds a count beside every `let` line — 2, 1, 1, 1, 0 at the start — and a Removed area collects lines that fall out. Threads run from each name read to the line that set it.',
      'Round 1: "uses 0: L6 (r) — removed · Uses let go: q, s". L6 falls into the Removed area, the lines below close the gap, and the counts of `q` and `s` drop to 0.',
      'Round 2: "uses 0: L4 (q), L5 (s) — removed · Uses let go: p, a". Both lines fall together in the same round. `a` drops from 2 to 1, not to 0.',
      'Round 3: "uses 0: L3 (p) — removed · Uses let go: none". Round 4: "no line has 0 uses — stop · Still held: a ← L7" — the `return a` line keeps `a` alive, so the removal stops there.',
      'Two readouts follow the rounds: "Lines: 7 → 3" and "Operations: 5 → 1". The whole run is five steps counting the start. `area(3, 4)` returns 12 before and after.',
      'Counts are taken for all lines at once each round, and every zero-count line in that round is removed together. The parameters and the `return` line are never removed. A line whose effect reaches outside the function, such as a call or an output, would be kept even with zero uses; there is none here. The code is in a small language-neutral notation.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one round per step, and stops at the round where nothing has zero uses.',
        'A Replay button and a playback strip sit below it. Dragging between round 1 and round 2 shows how removing one line brings two more down to zero.',
        'The program is fixed, so each round\'s caption and every use count can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains why removing one unused variable can make others unused too, and needs the chain `r` → `q`, `s` → `p` laid out round by round.',
      'A reader asks how a compiler decides a computation is dead and when it stops looking; counting reads and halting at the round with no zero, with `return a` still holding, answers both.',
    ],

    avoidWhen: [
      'The article is about unreachable code after a `return` or inside a never-taken branch. Every line here is reachable; lines are dead because their results are never read.',
      'The subject is garbage collection or reference counting of objects at run time. The counts here are reads of names in source code, taken before the program runs.',
      'The point is tree shaking of unused modules or exports in a bundler. Only lines inside one function are counted.',
    ],

    contrastWith: [
      {
        concept: 'foldAndSweep',
        note: 'Left to itself, deletion spreads upward one round at a time. When an earlier folding pass has already replaced names by numbers, the same deletion rule finds most lines dead in its first round.',
      },
      {
        concept: 'foldAtCompile',
        note: 'Folding makes a line cheaper but never removes it. Dead-code removal makes the program shorter but never changes a line that stays.',
      },
      {
        concept: 'refcountZero',
        note: 'Both remove something once its count reaches zero and then lower the counts it held. Reference counting frees objects while the program runs; this deletes source lines before it runs.',
      },
      {
        concept: 'noSideEffect',
        note: 'Deleting an unread line is safe only because computing it changes nothing outside. A line with an effect beyond its own result must stay even when nobody reads its name.',
      },
      {
        concept: 'valueFlowsToUse',
        note: 'Tracing each value to the places that read it is the underlying information. Removal is what a compiler does when that trace for a line comes out empty.',
      },
    ],
  },
};
