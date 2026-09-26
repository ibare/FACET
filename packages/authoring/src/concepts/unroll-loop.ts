/**
 * unrollLoop 개념 선언.
 *
 * canonical facet 은 `facet:unrollLoop` — 일곱 줄 함수 `total(list)` 의 반복 몸을 네 벌로 펴고(`list[i + 1]` …),
 * 조건 `i < 10` → `i < 8` · 올림 `i + 1` → `i + 4` 로 고친 뒤, 네 벌에 안 차는 둘을 반복 뒤에 곧은 줄로 붙인다.
 * 조건 셈 11 → 3 · 올림 10 → 2 · 더하기 10 → 10 · 줄 7 → 12. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `loopOptimization` 은 펼치기와 꺼내기가 반복 횟수 · 배수에 따라 언제 이득인가를 손잡이로 보이고, 형제
 * `hoistInvariant` 은 불변 줄을 몸 밖으로 옮기는 쪽이다. 이쪽의 한 질문은 "펴서 늘어놓으면 무엇이 줄고, 딱
 * 떨어지지 않는 나머지는 어디로 가는가" 다. 그래서 definition 은 copies · shifted index · 올림 폭과 끝 ·
 * leftover 가 반복 뒤로 간다는 쪽 낱말을 쥐고, trip count 에 따른 이득 · 손해 · invariant 를 쓰지 않는다.
 *
 * 전제 (설명 글 `unrollLoop.md`): 원시 프로그램은 어느 언어도 아닌 표기다. 반복 횟수 10 을 컴파일할 때 알아서
 * 나머지를 곧은 줄로 붙였다 — 모르면 한 벌짜리 반복을 하나 더 둔다. 배수 4 는 예로 정한 값이다. 한 방식이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const unrollLoopConcept: FacetConceptSource = {
  id: 'unrollLoop',
  label: 'Loop Unrolling with a Leftover Tail',
  canonicalFacet: 'facet:unrollLoop',

  surface: {
    definition:
      'Loop unrolling lays the body out as several copies per iteration, each reading a shifted index, widens the increment to match, and places the iterations left over from an uneven division as straight-line statements after the loop.',
    exemplarKeywords: [
      'loop unrolling',
      'unroll by 4',
      'remainder iterations',
      'epilogue loop',
      'Duff\'s device',
      'fewer condition checks',
      'loop overhead',
      'manual unrolling',
      'array sum loop',
      'what does unrolling do to the code',
    ],
  },

  briefing: {
    observable: [
      'The function `total(list)` stands in seven lines: `let sum = 0`, `let i = 0`, `while i < 10`, a body of `sum = sum + list[i]` and `i = i + 1`, then `return sum`. A strip on the right marks each condition test with a diamond (eleven), each bump with an arc (ten), and each list cell read with a dot over cells 0 to 9. The caption starts "One copy of the body per lap. Laps: 10".',
      'The working line is copied three times, each reading one cell further: "Body copy 2 — reads list[i + 1]", then `list[i + 2]` and `list[i + 3]`. In the strip each copy\'s row of dots shifts one cell. While the bump is still 1 this intermediate program would read the same cells more than once.',
      'The next step rewrites the loop: "Bump: i = i + 4 · Condition: i < 8 · Left over: 2". The arcs stretch to four cells and the diamonds gather to three (at 0, 4, 8); cells 8 and 9 are now read by no lap.',
      'Two leftover lines drop out of the loop and attach after it, before `return sum`: "Leftover 1/2 after the loop: sum = sum + list[i]" and "Leftover 2/2 …: sum = sum + list[i + 1]". When the loop ends `i` is 8, so these read cells 8 and 9; the index is written as `i`, not as a number.',
      'The last step compares one call before and after: "Program lines 7 → 12 · Condition checks 11 → 3 · Bumps 10 → 2 · Additions 10 → 10", headed "Per call — loop upkeep: 21 → 5". The additions that do the work do not change.',
      '`total([1, 2, …, 10])` returns 55 before and after. The run is eight steps counting the start. The factor 4 is an example value; the trip count 10 is known when compiling, which is what lets the leftover be plain lines. The code is in a small language-neutral notation.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one copy, rewrite or leftover line per step, and stops at the before-and-after comparison.',
        'A Replay button and a playback strip sit below it. Dragging to the step where the bump becomes `i + 4` shows the diamonds collapsing from eleven to three and cells 8 and 9 left unread.',
        'The program and the factor are fixed, so every line and count can be quoted exactly as it appears.',
      ],
    },

    useWhen: [
      'The article shows what an unrolled loop actually looks like and needs each copy\'s shifted index, the rewritten bound and step, and the two leftover lines placed after the loop.',
      'A reader asks what unrolling saves if the useful work stays the same; the comparison of 21 condition checks and bumps against 5, with additions unchanged at 10, answers it.',
    ],

    avoidWhen: [
      'The article is about when unrolling pays off for different iteration counts or factors. The iteration count and factor here are fixed.',
      'The subject is SIMD vectorization or parallel execution of the copies. The copies here run one after another.',
      'The point is a loop whose bound is only known at run time. The count here is known, so no remainder loop appears.',
    ],

    contrastWith: [
      {
        concept: 'loopOptimization',
        note: 'How unrolling rewrites a loop is a matter of mechanics. Whether it is worth doing is a separate judgement that changes with the number of iterations and the chosen factor.',
      },
      {
        concept: 'hoistInvariant',
        note: 'Unrolling cuts how many times the loop tests and bumps while leaving each unit of work in place; hoisting cuts the work repeated in each iteration while leaving the iteration count alone.',
      },
      {
        concept: 'loopBack',
        note: 'Each return to the condition is a test the loop pays for. Unrolling does not change how that return works; it makes it happen once per group of copies instead of once per element.',
      },
      {
        concept: 'basicBlock',
        note: 'A basic block is a run of lines with no jump in or out. Unrolling makes the loop body a longer run of that kind and turns the leftover into straight-line code with no loop at all.',
      },
    ],
  },
};
