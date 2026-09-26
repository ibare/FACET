/**
 * nobodyCanBeFirst 개념 선언.
 *
 * canonical facet 은 `facet:nobodyCanBeFirst` — 규칙 다섯(`app ← ui.o · net.o`, `ui.o ← ui.c`, `net.o ← net.c · proto.h`,
 * `proto.h ← schema.txt · codegen`, `codegen ← net.o`). 도구가 `app` 에서 깊이 먼저 그래프를 읽으며 들어간 대상을
 * "Waiting" 더미에 쌓고, 아래를 다 본 대상은 "Checked" 로 뺀다. `codegen` 의 입력에서 아직 더미에 있는 `net.o` 에 다시 닿아
 * `net.o -> proto.h -> codegen -> net.o` 를 알리고 멈춘다. 고리 길이 3, 세운 것 0. 걸음 아홉(처음 포함), 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리 — 버린 토픽의 조각
 *
 * catalog `origin` 은 완제품 판정에서 버린 `circular-dependency` 토픽을 가리킨다 (concept-meta-batch-protocol 규칙 2).
 * 완제품 개념이 없으므로 조각 개념만 쓰고, 가장 가까운 완제품 `dependencyGraph` 와 `contrastWith` 로 잇는다.
 * 같은 묶음의 `whoGoesFirst` 가 깊이 먼저 내려갔다 **올라오는** 장면이라면, 이쪽은 내려가다 **제 발자국을 밟아** 올라오지 못하는
 * 장면이다. 그래서 definition 은 cycle · still waiting · reports the loop · builds nothing 을 쥐고, built last · shared input
 * 을 쓰지 않는다. 이웃 `cycleBlocksOrder`(진입 차수를 떼어 내는 절차가 중간에 멈춤)와도 "깊이 먼저 찾아 경로를 보고" 로 가른다.
 *
 * 전제 (설명 글 `nobodyCanBeFirst.md`): 도구는 ninja · Bazel 꼴로, 무엇이든 세우기 전에 그래프를 끝까지 읽고 고리를 만나면
 * 멈춘다. make 는 다르다 — 고리를 만나면 화살 하나를 버리고 경고를 남긴 뒤 계속 세운다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const nobodyCanBeFirstConcept: FacetConceptSource = {
  id: 'nobodyCanBeFirst',
  label: 'Circular Build Dependency: Nothing Can Be Built First',
  canonicalFacet: 'facet:nobodyCanBeFirst',

  surface: {
    definition:
      'When build rules form a cycle, a tool that walks the inputs before building anything reaches a target still waiting on its own inputs, reports the loop as the path back to it, and builds nothing.',
    exemplarKeywords: [
      'circular dependency',
      'dependency cycle detected',
      'ninja: error: dependency cycle',
      'Bazel cycle in dependency graph',
      'make circular dependency dropped',
      'generated header depends on its own consumer',
      'code generator cycle',
      'break a circular dependency',
      'cyclic build graph',
      'back edge in dependency graph',
    ],
  },

  briefing: {
    observable: [
      'Five rules are listed: `app ← ui.o · net.o`, `ui.o ← ui.c`, `net.o ← net.c · proto.h`, `proto.h ← schema.txt · codegen`, `codegen ← net.o`. The run starts with "Requested: app"; a middle column is labelled "Waiting" and another "Checked".',
      'Each target the tool enters is pushed onto the Waiting pile: "Enter: app", then "Enter: ui.o · input of app". `ui.o` has only a source below it, so it leaves the pile with "No cycle below: ui.o" and moves to Checked.',
      'Going down the other side the pile grows to `app`, `net.o`, `proto.h`, `codegen` ("Enter: codegen · input of proto.h").',
      'Looking at the input of `codegen`, the tool arrives at `net.o` a second time while it is still on the pile: "Reached again: net.o · still waiting".',
      'The part of the pile from `net.o` to the top is lifted out as the cycle and reported as `net.o -> proto.h -> codegen -> net.o`. The run ends "Cycle length: 3 · Built: 0" — even `ui.o`, which has nothing to do with the loop, is checked but not built, because this tool reads the whole graph before building anything.',
      'Nine steps including the start. The tool is modelled on ninja and Bazel, which stop at a cycle; make instead drops one edge of the loop, prints a warning and keeps building, so its build may succeed with a stale input. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one step per entry, check or revisit, and stops on the cycle report.',
        'A Replay button and a timeline strip sit below. Dragging the strip to the "Reached again" step holds the moment `net.o` is found still on the Waiting pile.',
        'The rules and the request are fixed, so an article can quote every caption and the reported path exactly.',
      ],
    },

    useWhen: [
      'The article shows a build that fails with a dependency-cycle error — often from a code generator whose output feeds the target it depends on — and needs the tool walking into its own path and reporting it.',
      'A reader wants to know why a cycle blocks even the parts of a build that are not in the loop, and why a tool would rather stop than guess.',
    ],

    avoidWhen: [
      'The article is about import cycles between modules at runtime, where a language may still load partially initialized modules. Nothing here is loaded; it is a build refusing to start.',
      'The subject is package version conflicts or resolution failures. The loop here is between build targets, not package versions.',
      'The point is make\'s behaviour on a cycle. The tool here stops; make would drop an edge and continue.',
    ],

    contrastWith: [
      {
        concept: 'dependencyGraph',
        note: 'Scheduling targets on workers presumes an acyclic graph; a cycle removes the premise, so there is no start time for any target in it.',
      },
      {
        concept: 'whoGoesFirst',
        note: 'The same depth-first descent that normally hits bottom and builds on the way back up instead meets a target it has not finished, so there is no way back up.',
      },
      {
        concept: 'cycleBlocksOrder',
        note: 'Both say a ring of dependencies leaves no valid order. Peeling off nodes with no remaining inputs shows it as a procedure that stalls; a depth-first check finds the ring directly and can name its members.',
      },
      {
        concept: 'waitCycle',
        note: 'A deadlock is a cycle that forms at run time among threads already holding locks. A dependency cycle is in the rules themselves and is caught before any work starts.',
      },
    ],
  },
};
