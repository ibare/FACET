/**
 * whoGoesFirst 개념 선언.
 *
 * canonical facet 은 `facet:whoGoesFirst` — `app` 을 세워 달라는 요청이 `app ← main.o · util.o`,
 * `main.o ← main.c · config.h`, `util.o ← util.c · config.h`, `config.h ← config.in` 을 따라 깊이 먼저 내려가고,
 * 세움은 가장 아래(`config.h`)에서 시작해 요구가 온 길을 거슬러 올라온다. 세운 차례 `config.h` · `main.o` · `util.o` ·
 * `app`, 두 번째로 닿은 `config.h` 는 "이미 섰다" 로 지나간다. 걸음 열(처음 포함), 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `dependencyGraph` 는 일꾼 수를 돌려 끝 시각과 가장 긴 사슬을 견주고, 짝 조각 `independentInParallel` 은
 * 시계 위에서 함께 흐르는 일을 본다. 이쪽은 시간도 일꾼도 없이 **한 요청의 왕복 차례** 하나다 — 먼저 요구된 것이
 * 나중에 선다. 그래서 definition 은 requested · descends depth-first · on the way back up · built last · shared input
 * once 를 쥐고, workers · finish time · longest chain 을 쓰지 않는다.
 *
 * 전제 (설명 글 `whoGoesFirst.md` 가 밝힌 것): make 꼴 — 입력은 규칙에 적힌 차례로 하나씩 끝까지 내려갔다 온다.
 * 소스(`main.c` · `util.c` · `config.in`)는 이미 있어 걸음을 쓰지 않는다. 한 번에 하나씩 세운다. 고리가 없는 데이터다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const whoGoesFirstConcept: FacetConceptSource = {
  id: 'whoGoesFirst',
  label: 'Build Order: The Requested Target Is Built Last',
  canonicalFacet: 'facet:whoGoesFirst',

  surface: {
    definition:
      'Asked for one target, a make-style build descends depth-first through its inputs and builds on the way back up, so the requested target is built last and a shared input only once.',
    exemplarKeywords: [
      'make target prerequisites',
      'Makefile build order',
      'what does make build first',
      'prerequisites are built before the target',
      'recursive dependency resolution in make',
      'post-order build',
      'shared header built once',
      'already up to date prerequisite',
      'build a target from a Makefile rule',
    ],
  },

  briefing: {
    observable: [
      'Targets and sources stand as a tree under `app`: `app` needs `main.o` and `util.o`; `main.o` needs `main.c` and `config.h`; `util.o` needs `util.c` and `config.h`; `config.h` needs `config.in`. The three files without rules carry a "source" tag. A "Build order" row with slots 1 to 4 sits underneath.',
      'The run starts with "Requested: app". A bold arrow goes down one level at a time and the caption names who is waiting on what — "Waiting: app ← main.o · util.o", then `main.o`, then `config.h ← config.in`. Each target entered gets a `↓` number on its left for the order it was asked for.',
      'At the bottom `config.h` is built first ("Built: config.h · order 1"), then `main.o` (order 2). The arrow is withdrawn one level each time, and the built name moves into the Build order row with a `↑` number on its right.',
      'The arrow then goes down to `util.o`, reaches `config.h` a second time and shows "Already built: config.h — not built again". `util.o` is built (order 3) and finally `app` (order 4).',
      'At the end `app` carries `↓1` and `↑4`: first requested, last built. Ten steps including the start; four targets built, one skipped as already built, three sources never built.',
      'Inputs are visited in the order the rule lists them; a different listing would change the build order, but a target always comes after its inputs. Sources are assumed to exist already, targets are built one at a time, and the rules contain no cycle. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one step per descent or build, and stops after `app` is built.',
        'A Replay button and a timeline strip sit below. Dragging the strip back to step 7 holds the moment `config.h` is reached again and passed over.',
        'The rules and the request are fixed, so an article can quote every caption and order number exactly as it appears.',
      ],
    },

    useWhen: [
      'The reader expects a build tool to start with the target they named, and the article needs to show the request going down to the bottom and the actual building coming back up.',
      'The article explains why a header used by two objects is not rebuilt twice in one build, and wants the second arrival at it shown as a skip.',
    ],

    avoidWhen: [
      'The subject is running targets concurrently or how long a build takes. Nothing here runs at the same time and there are no durations.',
      'The article is about deciding what to rebuild after an edit. Every target here is built from nothing in one run.',
      'The point is a dependency cycle. This graph has none.',
    ],

    contrastWith: [
      {
        concept: 'dependencyGraph',
        note: 'With one builder the only question is sequence; once there are several workers the question becomes elapsed time and the chain that bounds it.',
      },
      {
        concept: 'independentInParallel',
        note: 'Both respect the rule that a target follows its inputs. One follows a single request down and back up; the other starts every target that is ready at the same moment.',
      },
      {
        concept: 'topologicalSort',
        note: 'Both yield an order in which every target follows its inputs. Topological sorting peels off nodes with nothing left to wait for; a demand-driven build reaches that order by recursion from one requested goal, and never touches targets the goal does not need.',
      },
      {
        concept: 'nobodyCanBeFirst',
        note: 'The descent here always hits bottom and turns back; with a cycle it walks into a target that is still waiting, and no build order exists.',
      },
    ],
  },
};
