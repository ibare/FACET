/**
 * hoistInvariant 개념 선언.
 *
 * canonical facet 은 `facet:hoistInvariant` — 여덟 줄 함수 `score(rate, base)` 의 반복 몸 네 줄을 위에서부터
 * 하나씩 재어 L4 · L5 를 불변, L6 · L7 을 변함으로 가르고, 불변 두 줄을 반복 머리줄 앞으로 들어낸다.
 * 한 바퀴 연산 4 → 2 · 실행 연산 16 → 10. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `loopOptimization` 은 꺼내기와 펼치기의 값이 반복 횟수에 걸려 있다는 것을 손잡이로 보이고, 형제
 * `unrollLoop` 은 몸을 여러 벌로 늘어놓는 쪽이다. 이쪽의 한 질문은 "바퀴마다 같은 줄을 어떻게 알아보고 어디로
 * 옮기는가" 다. 그래서 definition 은 invariant · 읽는 이름이 어디서 오는가 · 이미 불변인 줄에서 오는 이름 ·
 * above the loop 쪽 낱말을 쥐고, trip count · pay off · unroll · overhead 를 쓰지 않는다.
 *
 * 전제 (설명 글 `hoistInvariant.md`): 원시 프로그램은 어느 언어도 아닌 표기다. 반복은 네 바퀴를 반드시 돈다 —
 * 한 번도 돌지 않을 수 있는 반복에서는 꺼내면 안 되는 경우가 있다. 반복 머리줄의 조건 셈은 연산에 넣지 않았다.
 * 불변 잣대는 한 방식이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const hoistInvariantConcept: FacetConceptSource = {
  id: 'hoistInvariant',
  label: 'Loop-Invariant Code Motion',
  canonicalFacet: 'facet:hoistInvariant',

  surface: {
    definition:
      'Loop-invariant code motion moves a body statement that yields the same value on every iteration to just above the loop, recognizing it because every name it reads comes from outside the loop or from a statement already judged invariant.',
    exemplarKeywords: [
      'loop-invariant code motion',
      'LICM',
      'hoisting out of a loop',
      'move computation outside the loop',
      'invariant expression',
      'repeated calculation inside a loop',
      'code motion',
      'same value every iteration',
      'why the compiler moves my line',
    ],
  },

  briefing: {
    observable: [
      'The function `score(rate, base)` stands in lines L1 to L8: `let total = 0`, `for i from 1 to 4`, a body of `let k = rate * 3`, `let b = k + base`, `let v = i * b`, `total = total + v`, then `return total`. Each line carries tick marks for how often its operation runs: four for each body line, one for a line outside the loop with an operation, none for lines without one.',
      'The body lines are checked from the top. For the line being checked, a thread runs from each name it reads to where that name is set, drawn differently for outside the loop, for an already-invariant line, and for a place that changes every turn.',
      'L4 `let k = rate * 3` is tagged "invariant" — "Read from outside the loop: rate". L5 `let b = k + base` is tagged "invariant" — "From invariant lines: k. From outside the loop: base"; the judgement just made for L4 is used immediately.',
      'L6 `let v = i * b` is tagged "varies" — "It reads names that change each turn: i". L7 `total = total + v` is tagged "varies" for `total` and `v`.',
      'L4 lifts out of the loop and settles above the `for` line, and its four ticks gather into one: "L4 is lifted above the loop head. Runs of this line: 4 → 1". L5 follows, keeping its order. The readouts move from "Ops per turn: 4 · Ops executed: 16" to 3 · 13 and then 2 · 10.',
      'The line count stays at eight; lines are moved, not added or removed, and `let` stays `let`. `score(2, 5)` returns 110 before and after. The run is seven steps: the start, four checks, two moves.',
      'This loop always runs four times, so moving the lines out does not change the meaning. In a loop that might run zero times, a moved line runs when it previously would not have. The condition test of the loop head is not counted in the operation totals. The code is in a small language-neutral notation.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one body line checked or moved per step, and stops once the second invariant line has been lifted.',
        'A Replay button and a playback strip sit below it. Dragging back to the L5 check holds the moment an invariant judgement is reused for the next line down.',
        'The program is fixed, so every tag, reason and count can be quoted exactly as it appears.',
      ],
    },

    useWhen: [
      'The article says a compiler will move a repeated calculation out of a loop and needs to show the test it applies: where each name that the line reads comes from.',
      'A reader wonders why `k + base` counts as unchanging when `k` is set inside the loop; the step that accepts it because `k` comes from a line already judged invariant settles that.',
    ],

    avoidWhen: [
      'The article is about JavaScript `var` hoisting or declarations being moved to the top of a scope. This is an optimization that moves computations out of a loop.',
      'The subject is how much hoisting saves for different iteration counts, or the case where the loop never runs. The loop here always runs four times.',
      'The point is moving code out of a loop by hand for readability. The judgement here is the one a compiler makes mechanically.',
    ],

    contrastWith: [
      {
        concept: 'loopOptimization',
        note: 'Recognizing and moving invariant lines is one transformation. Whether that move saves anything depends on the number of iterations, and it can cost an operation when the loop runs zero times.',
      },
      {
        concept: 'unrollLoop',
        note: 'Hoisting reduces the work inside each iteration and leaves the number of iterations alone; unrolling leaves the work alone and reduces the number of iterations.',
      },
      {
        concept: 'loopBack',
        note: 'Returning to the condition after the body is what makes every body line run again. Hoisting takes lines out of that repeated path so they run once before it.',
      },
      {
        concept: 'resolveToDeclaration',
        note: 'Both follow a name to the place it was set. Resolution asks which declaration a name refers to; the invariance test asks whether that place lies outside the loop or on a line that already never changes.',
      },
    ],
  },
};
