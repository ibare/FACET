/**
 * loopTermination 개념 선언.
 *
 * canonical facet 은 `facet:loopTermination` — `while i < 3` 의 몸이 `total` 만 쓰고 `i` 는
 * 건드리지 않는다. 조건 줄로 돌아올 때마다 `i` 칸에서 0 이 한 알 떨어져 셈 칸에 내려앉고
 * 다섯 번 모두 참이다. 재생은 다섯 번째 셈에서 멈추고 `show total` 은 "never reached".
 *
 * ── 묶음 안에서의 자리
 *
 * `loopBack` 이 흐름의 모양을 말한다면 이쪽은 "끝나는가" 다. `baseCase` 도 "끝나지 않음" 을
 * 말하지만 원인이 다르다 — 여기는 조건이 읽는 변수를 몸이 쓰지 않는 것, 저쪽은 재귀가 바닥을
 * 건너뛰는 것. 그래서 definition 은 읽기 · 쓰기가 겹치지 않는다는 쪽 낱말(reads · assigns ·
 * infinite loop)을 독점하고, stop condition · overflow · 되돌아감 같은 말은 쓰지 않는다.
 *
 * 전제: 재생이 다섯 번째 셈에서 멈추는 것은 그림의 한도이지 판정 근거가 아니다 — 개념 메타가
 * 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const loopTerminationConcept: FacetConceptSource = {
  id: 'loopTermination',
  label: 'Loop Termination (Why a while Never Ends)',
  canonicalFacet: 'facet:loopTermination',

  surface: {
    definition:
      'A while loop can exit only when its condition becomes false, which never happens if the body assigns none of the variables the condition reads — the classic infinite loop.',
    exemplarKeywords: [
      'infinite loop',
      'endless loop',
      'program hangs in a loop',
      'forgot to increment the counter',
      'missing i += 1',
      'loop variable never updated',
      'loop invariant condition',
      'why does my while loop not end',
      'termination of a loop',
    ],
  },

  briefing: {
    observable: [
      'Five lines: `let i = 0`, `let total = 0`, `while i < 3`, `total = total + 1`, `show total`. On the right, variable cells are tagged — `i` with "the condition reads", `total` with "the body writes".',
      'Each time the flow returns to the condition line, a 0 detaches from the `i` cell and settles in a new check cell with `0 < 3` and true beneath it. Five checks, five identical answers.',
      'Under the checks a bar for `total` grows 0, 1, 2, 3, 4 — the value the body changes is not the value the condition reads.',
      '`show total` carries the label "never reached" throughout.',
      'The last caption reads: "Check 5: 0 < 3 is true again. The body writes total, the condition reads i, and they share nothing, so the answer cannot change. Playback stops here; the loop does not."',
      'Stopping after five checks is a limit chosen for the drawing, not evidence of anything: the argument that the loop never ends rests on the read and write sets not overlapping, which the tags show, not on the count.',
      'The code is written in a small language-neutral notation — `let`, `while`, `show`, indentation for the body — rather than in any one real language.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself and stops at the fifth check.',
        'A Replay button and a playback strip sit below it. Once stopped, dragging the strip back lets a reader compare any two check cells and see the same 0 in both.',
        'The program is fixed; the fix (adding `i = i + 1` to the body) is not drawn and belongs to the article.',
      ],
    },

    useWhen: [
      'The reader wrote a while loop that hangs and needs a way to diagnose it: list what the condition reads, list what the body writes, and look for an overlap.',
      'Someone argues a loop is infinite because it ran for a long time. The caption separates the stopping of playback from the reason the loop cannot stop.',
    ],

    avoidWhen: [
      'The subject is recursion that fails to stop or a stack overflow. Nothing here makes calls or uses memory per pass.',
      'The article is about loops that end because the body updates the counter correctly, or about counting iterations. This loop never exits.',
      'The repetition comes from revisiting nodes in a cyclic graph rather than from a control statement.',
    ],

    contrastWith: [
      {
        concept: 'loopBack',
        note: 'Returning to the condition is how a loop repeats; whether the condition ever changes is what decides if the repeating ends. This is the second question.',
      },
      {
        concept: 'baseCase',
        note: 'Both describe code that never finishes, from different causes: here the body leaves the tested variable alone, there each call steps past the value that would have ended the chain. Only the recursive case exhausts a resource and crashes.',
      },
      {
        concept: 'markVisitedOrLoop',
        note: 'Both are non-termination, but a graph walk without a visited record repeats because of the shape of the data, while this loop repeats because of what its own body fails to update.',
      },
    ],
  },
};
