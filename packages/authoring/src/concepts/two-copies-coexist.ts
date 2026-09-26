/**
 * twoCopiesCoexist 개념 선언.
 *
 * canonical facet 은 `facet:twoCopiesCoexist` — `forms → utils ^2.0.0` · `router → utils ^1.2.0`. 먼저 풀린 `forms` 의 `utils 2.1.0`
 * 이 꼭대기 `node_modules/utils` 에 앉고, 나중 `router` 는 그것이 범위 밖이라 `node_modules/router/node_modules/utils` 에
 * `1.8.0` 을 따로 놓는다. 그다음 찾기 — `forms` 는 제 안쪽이 비어 한 칸 올라가 2.1.0 을, `router` 는 제 안쪽에서 바로 1.8.0 을
 * 만난다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 같은 이름을 두 쪽이 부르는 세 끝 가운데 **두 벌을 두는 끝**이고, 주인공은 **어디에 두었고 어떻게 찾는가**다.
 * `diamondDependency` 와 풀이 차례 · 놓기 규칙이 같아서 가장 쉽게 겹친다 — 저쪽은 다시 씀으로 모이고, 이쪽은 안쪽 자리와
 * 위로 올라가는 찾기다. 그래서 definition 은 nested node_modules · requesting package's folder · module lookup climbs ·
 * each loads a different copy 를 독점하고, breadth first · converge · 구간의 끝 · 해결기 비교를 쓰지 않는다.
 *
 * 전제 (설명 글 `twoCopiesCoexist.md`): 놓기는 npm 끌어올리기의 줄인 모형 — 실제 npm 은 놓인 것을 옮기기도 하고 중간 폴더도 다시
 * 쓴다. 새로 고를 때 범위 안 가장 큰 것. 찾기는 두 자리(제 안쪽 · 꼭대기)만 그린다 — 실제 Node 는 파일 시스템 맨 위까지 한 칸씩
 * 계속 올라가고 전역 폴더도 본다. 버전은 세 수, 0.x 범위 없음.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const twoCopiesCoexistConcept: FacetConceptSource = {
  id: 'twoCopiesCoexist',
  label: 'Nested node_modules: Two Versions of One Package Side by Side',
  canonicalFacet: 'facet:twoCopiesCoexist',

  surface: {
    definition:
      'npm places an incompatible second version of a package inside the requesting package’s own node_modules, and Node’s module lookup starts in each package’s folder and climbs upward, so two packages load different copies of one name.',
    exemplarKeywords: [
      'nested node_modules',
      'two versions of the same package installed',
      'node_modules/foo/node_modules/bar',
      'how require finds a module',
      'Node module resolution algorithm',
      'npm hoisting',
      'duplicate dependency versions',
      'which copy does require load',
      'npm ls shows two versions',
    ],
  },

  briefing: {
    observable: [
      'The start shows an `app/` folder with calls `→ forms ^5.0.0` and `→ router ^3.0.0`, an empty top `node_modules/`, and the readout "Copies of utils: 0".',
      'Four placement steps follow, one call each. `forms` 5.2.0 and `router` 3.4.1 take top slots; each hangs its own folder below with its call and its own inner `node_modules/`. Then "Call: forms → utils ^2.0.0 · No utils at the top yet — newest in range: 2.1.0 · node_modules/utils".',
      'For `router → utils ^1.2.0` the top slot is taken: "Top utils 2.1.0 is outside ^1.2.0 — placed separately inside router: 1.8.0" at `node_modules/router/node_modules/utils`. The card drops down into router’s inner slot and the readout becomes "Copies of utils: 2".',
      'Three lookup steps follow. `forms` first probes `node_modules/forms/node_modules/utils`, finds "none", and goes "Nothing here — one level up", then reaches `node_modules/utils` with "Found: 2.1.0". `router` finds "Found: 1.8.0" in its own inner folder without climbing. Inner folders sit below the top, so one level up is drawn going up.',
      'The final screen keeps both copies and both lookup trails; eight steps counting the start. Which copy took the top slot followed the resolution order, not the version numbers.',
      'The placement rule is a reduced model of npm’s hoisting, which can also move placed packages and reuse intermediate folders. Lookup is drawn over two places only; real Node keeps climbing one folder at a time up to the file system root and also checks global folders. Picking the newest version in range is npm’s default.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, four placements then three lookups, and stops.',
        'A Replay button and a playback strip sit below. Dragging between the fifth and seventh steps sets forms’ two-hop climb beside router’s one-hop find.',
        'Package names, ranges and folder paths are fixed, so each path can be quoted exactly as it appears.',
      ],
    },

    useWhen: [
      'The article explains why `node_modules` contains nested copies of a package and needs both halves: where npm puts the second copy, and how each package ends up loading its own.',
      'A reader is puzzled that two parts of one app use different versions of the same library, and the article wants lookup shown starting from the caller’s folder and moving up.',
    ],

    avoidWhen: [
      'The article is about package managers that allow only one version per environment, such as pip; there the same ranges would fail.',
      'The subject is pnpm’s symlinked store, Yarn Plug’n’Play or detailed hoisting heuristics.',
      'The topic is ES module import maps or bundler aliasing rather than folder-based lookup.',
    ],

    contrastWith: [
      {
        concept: 'diamondDependency',
        note: 'Same resolution order and reuse check. There the check passes and one copy serves both; here it fails, so the claim shifts to placement and lookup.',
      },
      {
        concept: 'noOverlap',
        note: 'Both begin with ranges that share no version. Under a one-copy rule that is the end; with nested folders it becomes two installed copies.',
      },
      {
        concept: 'methodLookupUp',
        note: 'Both search upward and stop at the first match, so a nearer definition wins. Method lookup climbs a class hierarchy; module lookup climbs directories from the caller’s location.',
      },
      {
        concept: 'keepOldVersion',
        note: 'Both keep more than one version of the same thing at once. There versions are told apart by time; here by which folder the request starts from.',
      },
    ],
  },
};
