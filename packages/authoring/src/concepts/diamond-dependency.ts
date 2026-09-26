/**
 * diamondDependency 개념 선언.
 *
 * canonical facet 은 `facet:diamondDependency` — `app → charts ^4.0.0` · `app → table ^2.1.0`, 그리고 `charts → color ^3.2.0` ·
 * `table → color ^3.5.0`. 부름이 너비 우선으로 하나씩 풀리며 화살이 뻗는다. 먼저 온 `charts` 가 `color 3.6.2` 를 고르고,
 * 나중 온 `table` 은 그것을 제 범위에 대 보고 다시 쓴다. 두 갈래가 한 점으로 모여 다이아몬드가 된다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 같은 이름을 두 쪽이 부르는 세 끝 가운데 **한 벌로 모이는 끝**이다. `noOverlap` 은 못 채우는 끝, `twoCopiesCoexist` 는 두 벌을
 * 두는 끝, `dependencyResolution`(완제품)은 손잡이로 셋을 오간다. 이쪽의 동사는 "모인다" — 나중 부름이 새로 고르지 않고
 * 이미 고른 것을 가리킨다. 그래서 definition 은 diamond · shared transitive dependency · converge · reuses the version
 * already chosen 을 독점하고, 구간의 끝 · 폴더 자리 · 찾기 · 해결기 방식을 쓰지 않는다.
 *
 * 전제 (설명 글 `diamondDependency.md`): 새로 고를 때는 범위 안 가장 큰 것(npm 기본). 놓기 규칙은 줄인 모형 — 이미 있는 이름은
 * 범위 안이면 다시 쓴다. 실제 끌어올리기는 더 복잡하다. 폴더 자리는 그리지 않는다. 버전은 세 수, 0.x · 프리릴리스 없음.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const diamondDependencyConcept: FacetConceptSource = {
  id: 'diamondDependency',
  label: 'Diamond Dependency Converging on One Version',
  canonicalFacet: 'facet:diamondDependency',

  surface: {
    definition:
      'In a diamond dependency two direct dependencies share a transitive one; resolved breadth first, the later request checks the version already chosen against its own range and reuses it, so the graph converges on one installed copy.',
    exemplarKeywords: [
      'diamond dependency',
      'diamond dependency problem',
      'shared transitive dependency',
      'two libraries depend on the same library',
      'dependency tree',
      'npm ls',
      'deduplicated dependency',
      'breadth-first dependency resolution',
      'indirect dependency',
    ],
  },

  briefing: {
    observable: [
      'The start shows `app` with two unresolved calls, `charts ^4.0.0` and `table ^2.1.0`, and the note "Its calls are resolved one at a time, breadth first."',
      'Each step sends one arrow out to its target. The first three pick fresh versions with "Not installed yet — pick the highest in range": `charts` 4.1.0, `table` 2.3.0, and then from `charts → color ^3.2.0`, `color` 3.6.2 out of the published 3.0.2 · 3.2.0 · 3.4.1 · 3.5.0 · 3.6.2 · 4.0.0.',
      'The fourth arrow, `table → color ^3.5.0`, lands on the `color` box that already stands and is tagged "in range — reused": "Already chosen: 3.6.2 — inside this range, so it is reused, not picked again."',
      'Two arrows now meet at one `color` box, closing the diamond. The last step sends dots along both incoming arrows into it and reads "Callers: 2 · Copies: 1 · Installed packages: 3" — three packages, four calls, six steps counting the start.',
      'Only `charts ^3.2.0` guided the pick; `3.6.2` happens to fit the narrower `^3.5.0` as well because the widest range’s highest version was taken. Picking the highest version in range is npm’s default; the reuse rule is a reduced model of npm’s placement, and folders are not drawn.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one call per step, and stops after the diamond closes.',
        'A Replay button and a playback strip sit below. Dragging to the fourth step holds the moment the second arrow reaches an existing box instead of creating a new one.',
        'Names, ranges and published versions are fixed, so every caption can be quoted as shown.',
      ],
    },

    useWhen: [
      'The article introduces the diamond dependency shape and needs the ordinary, happy ending where both paths share one copy before it discusses what can go wrong.',
      'A reader asks why a package listed by two dependencies appears only once in the tree, and the article wants the second request shown reusing the first one’s pick.',
    ],

    avoidWhen: [
      'The article is about a diamond whose ranges cannot share a version; here the second range is satisfied by the first pick.',
      'The subject is where packages end up on disk, hoisting or `node_modules` layout; no folders appear.',
      'The topic is build order in a module graph, where diamonds raise questions of what to compile first rather than which version to install.',
    ],

    contrastWith: [
      {
        concept: 'dependencyResolution',
        note: 'That concept holds that ranges and resolver strategy together decide between one copy, two copies or failure. This one is only the case where the first pick already fits the second caller.',
      },
      {
        concept: 'twoCopiesCoexist',
        note: 'Same breadth-first order and the same reuse check. Here the check passes and paths converge; there it fails and a second copy is placed inside the caller.',
      },
      {
        concept: 'noOverlap',
        note: 'Here one version satisfies both callers without anyone computing a shared range. There the shared range is computed first and turns out empty.',
      },
      {
        concept: 'topologicalSort',
        note: 'A diamond in a build or task graph is about ordering: the shared node must come before both of its dependents. A diamond in package resolution is about how many versions of the shared node are installed.',
      },
    ],
  },
};
