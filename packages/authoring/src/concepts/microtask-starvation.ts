/**
 * microtaskStarvation 개념 선언.
 *
 * canonical facet 은 `facet:microtaskStarvation` — `step` 이 스스로를
 * `queueMicrotask` 로 다시 세우며 여덟 번 도는 동안(한 번에 7ms 씩 스택을 쥔다),
 * 지나는 프레임 경계마다 렌더가 시도조차 안 되고, 마이크로 줄이 완전히 빌 때(=
 * 여덟 번째 실행이 다시 세우지 않을 때)에야 한 번 렌더가 일어나 화면 값이 곧장
 * 마지막 값으로 뛴다.
 *
 * ── 묶음 안에서의 자리
 *
 * `yieldToRender` 의 거울상 — 같은 "일을 쪼개 이어 건다" 는 그림에서 마이크로
 * 줄로 이으면 몇 번을 쪼개든 렌더가 단 한 번도 못 끼어든다는 실패 사례다.
 * definition 의 주어를 "스스로를 마이크로 줄에 다시 세우는 걸음" 에 두어, 성공
 * 사례(`yieldToRender`, 태스크 줄)·비교 전체(`cooperativeYielding`, 두 API +
 * 다섯 쪼갬 크기)·쪼개지 않은 기준선(`longTaskBlocks`, 태스크 줄에 하나)과
 * 어휘를 나눴다. "지난 경계가 지워지지 않고 쌓인다" 와 "화면이 건너뛴다" 는
 * 이 조각만의 관찰이라 다른 셋에는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const microtaskStarvationConcept: FacetConceptSource = {
  id: 'microtaskStarvation',
  label: 'Microtask Starvation (Requeuing Never Yields to Render)',
  canonicalFacet: 'facet:microtaskStarvation',

  surface: {
    definition:
      'A step that requeues its own continuation on the microtask queue instead of finishing the task keeps control past every frame boundary in between, so no render is attempted until the microtask queue finally empties, at which point the screen jumps straight to the final value with every intermediate value having never appeared.',
    exemplarKeywords: [
      'queueMicrotask self-requeue',
      'microtask queue never empties',
      'starves rendering',
      'frame boundaries pass with no paint',
      'screen jumps to the final value',
      'run-to-completion extended by microtasks',
      'why chunking through microtasks does not help',
    ],
  },

  briefing: {
    observable: [
      'Seven lines of code sit at the top, with the handler line highlighted while a click is processed and the step\'s body lines highlighted while a run executes.',
      'A pill labeled "step" next to "Microtask queue" is filled solid while a continuation is queued and turns to a dashed outline once the queue is empty.',
      'A DOM number and a Screen number are shown side by side; while they differ, a dashed line and a "Gap {n}" label connect them, and the gap only ever grows until the very end.',
      'A frame-boundary timeline at the bottom marks every boundary the run crosses, colored by what happened to it: a border color while still ahead, a danger color the moment it passes with no render, and a success color only if a render later covers it.',
      'A caption narrates each run: "A run holds the stack for {ms}ms" together with the current DOM value, then either that a boundary just passed unrendered while the screen stayed put, that the step is about to requeue itself, or that it is not requeuing this time.',
      'The DOM number climbs step by step across all eight runs while the Screen number stays at its starting value the entire time; only on the final step, once the microtask queue empties, does the screen number jump straight to the last DOM value and every previously-danger-colored boundary turn success at once.',
    ],

    screen: {
      affordances: [
        'The screen plays the click and all eight runs on its own and stops right after the single render at the end.',
        'A Replay button and a timeline strip sit below it; dragging the strip to any run holds the DOM/Screen gap and the row of missed boundaries exactly as they stood at that point.',
      ],
    },

    useWhen: [
      'The article treats queueMicrotask as another way to break up work like setTimeout, and needs the counterexample: the microtask queue never empties mid-run, so control never returns to the browser to paint.',
      'The reader needs proof that specific intermediate values were never shown — the timeline marks each passed boundary as unrendered before the one render at the end covers all of them at once.',
      'The point is that a queue choice, not the presence of chunking, decides whether a render can occur — here the work is visibly split into eight runs and still nothing renders in between.',
    ],

    avoidWhen: [
      'The article wants to vary how many runs there are or how long each one holds the stack — this piece fixes both (eight runs, 7ms each).',
      'The subject is the task queue or setTimeout — no setTimeout appears anywhere in this piece, only a single queueMicrotask self-requeue.',
      'The point is microtask ordering in general, such as why a `.then()` callback runs before a `setTimeout` callback — this is one specific self-requeuing chain, not a comparison of queue priority.',
    ],

    contrastWith: [
      {
        concept: 'yieldToRender',
        note: 'The mirrored piece: the same shape of chunked work continued through setTimeout instead of queueMicrotask lets a render cut in between chunks. Here every frame boundary in between passes with nothing painted, and the queue chosen is the entire difference.',
      },
      {
        concept: 'cooperativeYielding',
        note: 'This is the queueMicrotask corner of that broader comparison, held at one fixed per-step cost and run count, showing the freeze in closer detail — every individual frame boundary it skips rather than just a longest-wait number.',
      },
      {
        concept: 'longTaskBlocks',
        note: 'Both end in one long wait with nothing interleaved, but there a single task simply was never split; here the work is nominally split into eight microtask runs and freezes anyway, because none of those runs ever lets go of the queue.',
      },
    ],
  },
};
