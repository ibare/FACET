/**
 * dependencyGraph 개념 선언.
 *
 * canonical facet 은 `facet:dependencyGraph` — 대상 여섯(`lexer.o` · `parser.o` · `ast.o` · `codegen.o` · `libfront.a` ·
 * `compiler`)을 일꾼 줄에 올려 시각을 따라 세운다. 손잡이 둘은 일꾼 수(1 · 2 · 3 · 4 · 6, 처음 2)와 `codegen.o` 가
 * 걸리는 초(6 · 3, 처음 6). 끝 시각 선이 일꾼을 늘릴수록 왼쪽으로 미끄러지다 가장 긴 사슬의 바닥 선(8 초 또는 7 초)에
 * 닿아 멈추고, `codegen.o` 를 줄이면 사슬 표시가 다른 길로 옮겨 가며 바닥이 내려온다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `whoGoesFirst` 는 요청 하나가 깊이 먼저 내려갔다 올라오는 한 줄 차례(일꾼 하나)를, `independentInParallel` 은
 * 일꾼 넷에서 서로 기다리지 않는 대상이 같은 시각에 함께 흐르는 한 판을 말한다. 이쪽은 **손잡이로 일꾼 수를 돌려**
 * 끝 시각이 어디서 더는 줄지 않는지, 사슬 위의 대상을 줄이면 바닥이 어떻게 옮겨 가는지를 맡는다. 그래서 definition 은
 * adding workers · stops improving · floor · shortening a target on it 쪽 낱말을 쥐고, 조각들이 쥔 depth-first ·
 * built last · same moment · the instant its input finishes 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `dependencyGraph.md` 가 밝힌 것):
 *  - 초는 예로 정한 값. 일꾼 사이의 통신 · 디스크 다툼은 없다고 친다.
 *  - make `-j` 꼴의 목록 스케줄링 — 준비된 것을 데이터에 적힌 차례로 빈 일꾼에 올린다. 실제 도구는 더 긴 것을 먼저
 *    올리는 등 달리 고를 수 있고, 그러면 같은 일꾼 수에서도 끝 시각이 바뀔 수 있다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const dependencyGraphConcept: FacetConceptSource = {
  id: 'dependencyGraph',
  label: 'Dependency Graph (Workers vs the Longest Chain)',
  canonicalFacet: 'facet:dependencyGraph',

  surface: {
    definition:
      'Adding parallel workers to a build shortens its finish time only until it reaches the floor set by the longest chain of dependent durations; after that, only shortening a target on that chain helps.',
    exemplarKeywords: [
      'critical path',
      'critical path of a build',
      'make -j',
      'parallel build speedup',
      'why more cores do not make the build faster',
      'build parallelism limit',
      'list scheduling',
      'makespan',
      'total work vs span',
      'build DAG',
      'dependency graph of targets',
      'speed up the slowest target',
    ],
  },

  briefing: {
    observable: [
      'Six targets are listed on the left with their inputs and durations: `lexer.o` 3 s, `parser.o` 4 s, `ast.o` 2 s and `codegen.o` 6 s need nothing; `libfront.a` 1 s needs the first three; `compiler` 2 s needs `libfront.a` and `codegen.o`. On the right, worker lanes run along a time axis in seconds.',
      'A band marked "← longest chain" picks out the chain whose durations add up most. With `codegen.o` at 6 s it is `codegen.o → compiler`, 8 s; with 3 s it moves to `parser.o → libfront.a → compiler`, 7 s. That total stands as a floor line on the time axis.',
      'Each round plays second by second. With the default 2 workers: "At 0 s · started: lexer.o, parser.o", while `ast.o` and `codegen.o` carry a "waiting" tag; at 3 s `ast.o` starts, at 4 s `codegen.o`, at 5 s `libfront.a`, at 10 s `compiler`. The round ends "Finish at 12 s — 4 s above the longest chain, 8 s".',
      'Three readouts carry the round: Finish time, Most at once and Total work. Total work is 18 s with `codegen.o` at 6 and 15 s at 3; one worker always finishes at exactly the total work.',
      'Stepping the workers from 1 to 2, 3, 4 and 6 with `codegen.o` at 6 gives finish times 18, 12, 10, 8, 8. At 4 the finish line meets the floor and is marked "stopped at the floor"; at 6 no bar moves and the two extra lanes stay empty, because only four targets can ever run at once here.',
      'With `codegen.o` at 3 the finish times are 15, 9, 7, 7, 7: the floor drops to 7 and is already reached at 3 workers.',
      'When more targets are ready than there are free workers, the one listed earlier in the data goes first. The durations are example values and workers are assumed not to slow each other down; the screen does not footnote either point.',
    ],

    screen: {
      affordances: [
        'Playback controls (play, step, pause, reset, speed) and two handles: a "Workers" slider with positions 1, 2, 3, 4 and 6 (starting at 2), and a "codegen.o seconds" slider with 6 and 3 (starting at 6). Each change replays one round and then waits.',
        'The move that makes the idea land is stepping Workers upward and watching the finish line slide left until it touches the floor line and stops; then switching `codegen.o` to 3 s shows the chain band jump to a different path and the floor move down.',
        'The code panel, titled "List scheduling", starts empty with a "+ Add language" button; the chosen language shows a function that computes the same schedule over arrays and returns the finish time, highlighting starts and finishes as they happen. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article claims that throwing more cores or CI runners at a build will keep making it faster, and needs to show the point where the finish time stops moving and why.',
      'A reader is deciding whether to parallelize further or to speed up one slow target, and the article wants the case where shortening a target on the longest chain lowers the floor that no number of workers could.',
    ],

    avoidWhen: [
      'The article is about ordering tasks so each comes after its inputs, with no notion of time or workers. The durations and lanes here would be noise.',
      'The subject is a dependency cycle or a build that refuses to start. Every graph here is acyclic and finishes.',
      'The point is smarter scheduling heuristics such as longest-first. Ready targets are always taken in listed order.',
    ],

    contrastWith: [
      {
        concept: 'whoGoesFirst',
        note: 'The order in which a single builder visits and completes targets is a question with one worker; with several, the question becomes how long the whole takes and what bounds it from below.',
      },
      {
        concept: 'independentInParallel',
        note: 'That unrelated targets run at the same time is the premise; the bound on how much that helps, and what moves the bound, is the further claim.',
      },
      {
        concept: 'topologicalSort',
        note: 'A topological order says only which target may come after which. Scheduling adds durations and a worker count, and asks when the last one ends.',
      },
      {
        concept: 'nobodyCanBeFirst',
        note: 'A cyclic graph has no schedule at all; the finish-time bound assumes the graph is acyclic and asks how fast it can be built.',
      },
    ],
  },
};
