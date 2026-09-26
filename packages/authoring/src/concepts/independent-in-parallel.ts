/**
 * independentInParallel 개념 선언.
 *
 * canonical facet 은 `facet:independentInParallel` — 일꾼 넷에 대상 여섯(`lexer.o` 3 · `parser.o` 4 · `ast.o` 2 ·
 * `codegen.o` 6 · `libfront.a` 1 · `compiler` 2 초)을 올린다. 시각 0 에 입력 없는 넷이 한꺼번에 오르고, 4 초에
 * `parser.o` 가 끝나는 순간 `libfront.a` 가, 6 초에 `codegen.o` 가 끝나는 순간 `compiler` 가 곧바로 오른다.
 * 8 초에 끝 — 일의 합 18 초, 가장 긴 사슬 8 초. 걸음 여덟(처음 포함), 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `dependencyGraph` 는 일꾼 수를 손잡이로 돌려 끝 시각이 사슬의 바닥에서 멈추는 것을 보인다. 이 조각은 일꾼이
 * 넷으로 고정된 **한 판**에서 "서로 기다리지 않는 것은 같은 시각에 함께 흐르고, 기다리던 것은 마지막 입력이 끝나는 순간
 * 오른다" 는 장면 하나다. 끝에 사슬 길이가 글자로 뜨지만 그것을 움직이지는 않으므로, definition 은 same moment ·
 * side by side · the instant its last input finishes 를 쥐고 adding workers · floor · stops improving 을 쓰지 않는다.
 * `whoGoesFirst` 의 요구 왕복(깊이 먼저)과도 가르기 위해 requested · depth-first 를 쓰지 않는다.
 *
 * 전제 (설명 글 `independentInParallel.md`): 초는 예로 정한 값, 일꾼 사이에 결과를 주고받는 비용은 없다고 쳤다.
 * 준비된 것이 빈 일꾼보다 많으면 데이터 차례대로 오르지만 이 예에서는 그런 시각이 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const independentInParallelConcept: FacetConceptSource = {
  id: 'independentInParallel',
  label: 'Independent Targets Build at the Same Time',
  canonicalFacet: 'facet:independentInParallel',

  surface: {
    definition:
      'With several workers, build targets that need none of each other\'s output start at the same moment and run side by side, and a waiting target starts the instant its last input finishes.',
    exemplarKeywords: [
      'parallel build',
      'make -j4',
      'build jobs running concurrently',
      'independent targets compile at once',
      'concurrent compilation',
      'worker pool build',
      'task starts when its dependencies finish',
      'parallel task graph execution',
      'build farm workers',
    ],
  },

  briefing: {
    observable: [
      'Six targets start in a "Waiting to start" area; four worker lanes, "Worker 1" to "Worker 4", run along a clock from 0 to 8 s. A readout shows "Busy workers" and, at the start, "Not started: 6 · Free workers: 4".',
      'At 0 s all four targets without inputs move onto the lanes together: "0 s — started together: lexer.o · parser.o · ast.o · codegen.o". Busy workers reads 4, and the four bars grow as the clock runs.',
      '`ast.o` finishes at 2 s and `lexer.o` at 3 s, and their lanes fall idle; `libfront.a` still waits because `parser.o` is not done.',
      'At 4 s the caption reads "4 s — done: parser.o → started at once: libfront.a": the moment its last input finishes, `libfront.a` leaves the waiting area for a free lane. It finishes at 5 s.',
      'At 6 s `codegen.o` finishes and `compiler` starts at once; it ends at 8 s. The final caption reads "All built · End: 8 s · Work summed: 18 s · Longest chain: 8 s".',
      'Eight steps including the start. The durations are example values and passing results between workers is assumed to cost nothing; the screen does not footnote either point.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one step per moment on the clock when something starts or finishes, and stops when everything is built.',
        'A Replay button and a timeline strip sit below. Dragging the strip to the 4 s step holds the moment `parser.o` ends and `libfront.a` starts in the same instant.',
        'The targets, durations and the number of workers are fixed, so an article can quote every time and caption exactly.',
      ],
    },

    useWhen: [
      'The reader pictures a build as one compile after another, and the article needs targets that do not depend on each other visibly starting together on separate workers.',
      'The article explains that a target in a parallel build does not wait for a fixed stage to finish but starts as soon as its own inputs are done, and needs a moment where a finish and a start coincide.',
    ],

    avoidWhen: [
      'The article is about how many workers are worth adding or where extra workers stop helping. The worker count here never changes.',
      'The subject is data races or shared-memory threads. Targets here share nothing while they run.',
      'The point is which targets to rebuild after an edit. Everything here is built from scratch.',
    ],

    contrastWith: [
      {
        concept: 'dependencyGraph',
        note: 'That independent targets overlap is the mechanism; how far adding workers can shorten the build, and what finally limits it, is the question built on top of it.',
      },
      {
        concept: 'whoGoesFirst',
        note: 'A single builder follows one request down to the bottom and back; with several workers the order is replaced by readiness, and everything ready at the same moment starts together.',
      },
      {
        concept: 'topologicalSort',
        note: 'A topological order lines tasks up one after another. Running on several workers keeps the same precedence rule but lets every task with no unfinished input proceed at once.',
      },
    ],
  },
};
