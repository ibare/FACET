/**
 * dependencyResolution 개념 선언.
 *
 * canonical facet 은 `facet:dependencyResolution` — `app` 이 `charts` 와 `table` 을 쓰고, 둘이 모두 `color` 를 부른다.
 * `charts` 는 `^3.2.0` 고정, `table` 의 범위는 손잡이(`^3.5.0` · `~3.4.0` · `^4.0.0`), 해결기도 손잡이(중첩 · 한 벌).
 * 여섯 조합이 한 벌 · 두 벌 · 실패로 갈린다. 코드 패널은 IR 하나를 여섯 언어로 옮긴 `resolve` 다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 같은 이름을 두 쪽이 부를 때의 세 끝을 하나씩 맡는다 — 한 벌로 모임(`diamondDependency`) · 한 벌로는 못
 * 채움(`noOverlap`) · 두 벌을 두고 각자 찾음(`twoCopiesCoexist`). 이쪽은 **두 손잡이를 돌려 그 셋을 한 판에서 오가는 것**,
 * 그리고 결과가 범위의 겹침만이 아니라 해결기의 방식에도 달렸다는 대비를 맡는다. 그래서 definition 은 strategy ·
 * overlap alone does not decide · never revisits its first pick 을 쥐고, 조각들이 독점한 converge · bounds cross ·
 * node_modules lookup climbs 를 쓰지 않는다.
 *
 * 전제 (설명 글 `dependencyResolution.md`):
 *  - 중첩은 npm 을 줄인 모형 — 끌어올리기(hoisting) · `npm dedupe` · `--prefer-dedupe` 가 없다. 두 벌은 "처음 고른 것을
 *    되짚지 않는다" 는 규칙 때문이지 npm 이 겹쳐도 늘 두 벌을 까는 것이 아니다.
 *  - 한 벌은 pip 처럼 한 환경에 한 버전만 두는 해결기를 줄인 모형 — 되짚으며 찾는 대신 구간 교차 한 번.
 *  - 범위 기호는 `^` · `~` 둘. 버전은 세 수를 수로 견준다. 새로 고를 때는 범위 안 가장 큰 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const dependencyResolutionConcept: FacetConceptSource = {
  id: 'dependencyResolution',
  label: 'Dependency Resolution: One Copy, Two Copies or Failure',
  canonicalFacet: 'facet:dependencyResolution',

  surface: {
    definition:
      'When two packages need the same dependency under different version ranges, whether one shared copy, two copies or a failure results depends on the resolver’s strategy, not on whether the ranges overlap alone.',
    exemplarKeywords: [
      'dependency resolution',
      'version conflict between dependencies',
      'npm vs pip dependency resolution',
      'nested dependencies vs single version',
      'why are there two versions of the same package',
      'duplicate packages in node_modules',
      'dependency hell',
      'resolver algorithm',
      'transitive dependency version',
      'npm dedupe',
    ],
  },

  briefing: {
    observable: [
      '`app` sits above `charts` 4.1.0 and `table` 2.3.0, both already in place; the question is only where `color` goes. Two slots wait for it: Top (`node_modules/color`) and Inside table (`node_modules/table/node_modules/color`).',
      'A number line of versions carries two range bands, `charts ^3.2.0` fixed and `table` set by the handle, over the published `color` versions 3.0.2 · 3.2.0 · 3.4.1 · 3.5.0 · 3.6.2 · 4.0.0. The overlap of the two bands narrows as the table range moves and disappears at `^4.0.0`.',
      'With the nested resolver, `charts` picks first — "charts ^3.2.0 → largest in range: 3.6.2 → node_modules/color" — then the top copy is checked against the table range. Inside, table reuses it; outside, table gets its own copy: "table ~3.4.0 → its own copy: 3.4.1 → node_modules/table/node_modules/color".',
      'With the single-copy resolver, the shared range is set first — "Shared range [3.4.0, 3.5.0)" for `~3.4.0` — and the largest version in it is used by both. With `^4.0.0` the shared range is empty and the round ends "No copy can satisfy both ranges → failed".',
      'The six outcomes: `^3.5.0` gives 1 copy under both resolvers (3.6.2); `~3.4.0` gives 2 copies nested (3.6.2 and 3.4.1) but 1 copy single (3.4.1); `^4.0.0` gives 2 copies nested (3.6.2 and 4.0.0) and failure single.',
      'Two readouts are counted per round: Copies (0 on failure) and Fit both ranges, the number of published `color` versions satisfying both ranges regardless of resolver. At the start (`~3.4.0`, nested) they read 2 and 1 — overlap exists, yet two copies are installed.',
      'The nested resolver is a reduced model of npm without hoisting, `npm dedupe` or `--prefer-dedupe`; its second copy comes from never revisiting the first pick. The single-copy resolver reduces a one-version-per-environment resolver such as pip to one range intersection instead of backtracking. Only `^` and `~` ranges appear.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "table range" (^3.5.0, ~3.4.0, ^4.0.0; starts at ~3.4.0) and "Resolver" (nested, single copy; starts at nested). Each round plays to its end and waits for the handles.',
        'The move that makes the idea land is leaving the range at `~3.4.0` and flipping the resolver: the copy count goes from 2 to 1 while Fit both ranges stays at 1. Then moving to `^4.0.0` shows nested still installing while single copy fails.',
        'The code panel, labelled "resolve — nested or single copy", shows `resolve`, which takes the published versions as a flat number array and two ranges, returns the copy count and writes which version each caller uses. It is one meaning written out in Python, JavaScript, TypeScript, Java, C++ and C#; the Fit both ranges count is not part of it.',
      ],
    },

    useWhen: [
      'The article compares how npm and pip handle two libraries that want different versions of the same dependency, and needs one set of ranges run through both strategies side by side.',
      'A reader assumes that overlapping version ranges always collapse to one installed copy, and the article needs the case where they overlap and still produce two.',
    ],

    avoidWhen: [
      'The article is about npm’s real hoisting layout, `npm dedupe` or peer dependencies; the nested model here leaves those out.',
      'The subject is a backtracking or SAT-based resolver exploring many candidates; the single-copy model solves by one range intersection.',
      'The topic is the order in which a build tool compiles dependent modules rather than which versions get installed.',
    ],

    contrastWith: [
      {
        concept: 'diamondDependency',
        note: 'Both have two packages asking for one dependency. That claim settles on the case where the first pick already satisfies the second request; this one varies range and strategy to show that the same overlap can end in one copy, two, or none.',
      },
      {
        concept: 'noOverlap',
        note: 'That claim is the single-copy failure on its own, derived from the two ranges’ ends. Here failure is one possible outcome, and a nested resolver avoids it for the same ranges.',
      },
      {
        concept: 'twoCopiesCoexist',
        note: 'Both install a second copy inside the requesting package. That claim goes on to how each package finds its copy at load time; this one is about when the second copy is needed at all.',
      },
      {
        concept: 'semanticVersioning',
        note: 'Semantic versioning concerns what one version number promises to one consumer; dependency resolution reconciles several consumers’ ranges for the same package.',
      },
      {
        concept: 'dependencyGraph',
        note: 'Both walk a graph of packages that depend on each other. A build dependency graph decides in what order things are built; resolution decides which versions exist and how many of each.',
      },
    ],
  },
};
