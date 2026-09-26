/**
 * noOverlap 개념 선언.
 *
 * canonical facet 은 `facet:noOverlap` — `cli → parser ^1.4.0` · `server → parser ~1.2.3`, `parser` 는 한 벌만. 두 요구가
 * 두 끝으로 풀리고, 함께 쓸 구간의 아래 끝이 더 높은 `1.4.0` 으로 올라가고 위 끝이 더 낮은 `1.3.0` 으로 내려와 엇갈린다.
 * 해결기는 버전을 고르지 못하고 부딪힌 두 요구를 알린다. 공개 목록은 한 번도 보지 않는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 같은 이름을 두 쪽이 부르는 세 끝 가운데 **한 벌로는 못 채우는 끝**이다. `rangeAndCandidates` 는 요구 하나가 후보를 거르고,
 * 이쪽은 요구 둘이 서로를 자른다 — 후보가 무엇이든 소용없다. 그래서 definition 은 intersection · higher lower bound ·
 * lower upper bound · cross · unsatisfiable · conflict 를 독점하고, 후보 하나하나 · 가장 큰 것 뽑기 · 폴더 · 다시 씀을
 * 쓰지 않는다. 같은 major 인데도 틸드가 minor 를 묶어 만나지 않는다는 것이 데이터의 뜻이다.
 *
 * 전제 (설명 글 `noOverlap.md`): 한 이름에 한 버전만 두는 해결기(pip 의 한 환경처럼). 두 벌을 따로 두는 길은 다루지 않는다.
 * 버전은 세 수, 범위는 `^` · `~` 뿐, 0.x 캐럿 특례는 데이터에 없다. 세로축 높이는 버전의 차례이지 거리가 아니다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const noOverlapConcept: FacetConceptSource = {
  id: 'noOverlap',
  label: 'Version Conflict: Two Ranges With No Common Version',
  canonicalFacet: 'facet:noOverlap',

  surface: {
    definition:
      'With one version allowed per package, two constraints are satisfiable only if the higher lower bound stays below the lower upper bound; when those bounds cross the intersection is empty and resolution fails, whatever versions are published.',
    exemplarKeywords: [
      'version conflict',
      'incompatible version requirements',
      'ResolutionImpossible',
      'pip dependency conflict',
      'cannot satisfy both requirements',
      'range intersection is empty',
      'caret and tilde do not overlap',
      'unsatisfiable dependency constraints',
      'dependency conflict error',
    ],
  },

  briefing: {
    observable: [
      'The start shows two requests, `cli → parser ^1.4.0` and `server → parser ~1.2.3`, a column marked "usable by both", and the rule "parser — one copy only". The vertical axis points to higher versions going up.',
      'Each request unfolds into two ends: "cli ^1.4.0: from 1.4.0 (included) up to 2.0.0 (excluded)." and "server ~1.2.3: from 1.2.3 (included) up to 1.3.0 (excluded)." Both are major 1, yet the tilde closes at 1.3.0.',
      'In the shared column the lower end rises from the floor: "Shared lower end: the higher of the lower ends — 1.4.0 (cli)." The upper end comes down from the ceiling: "Shared upper end: the lower of the upper ends — 1.3.0 (server)."',
      'The raised lower end passes the lowered upper end. The last step reads "Cannot resolve parser — cli wants ^1.4.0, server wants ~1.2.3" with "Lower end 1.4.0 ≥ upper end 1.3.0: no version is left between them." The gap runs from 1.3.0 up to just before 1.4.0; six steps counting the start.',
      'No list of published versions is ever shown or consulted: once the shared range is empty, no candidate could fit. The resolver keeps one version per package, as in a pip environment; placing a second copy elsewhere is not part of this model. Heights on the axis follow version order, not distance.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself and stops on the conflict message.',
        'A Replay button and a playback strip sit below. Dragging between the fourth and fifth steps shows the lower end already at 1.4.0 before the upper end drops to 1.3.0 beneath it.',
        'The two requests are fixed, so every end and message can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains a dependency conflict error from a resolver that keeps one version per package, and needs to show that the cause lies in the two ranges themselves, not in missing releases.',
      'A reader assumes two requirements with the same major version must be compatible, and the article needs a tilde range that closes before the caret range opens.',
    ],

    avoidWhen: [
      'The article is about npm installing two copies to sidestep a conflict; no second copy is placed here.',
      'The subject is a resolver backtracking through older versions of other packages to find a working combination; only two fixed requests are compared.',
      'The topic is binary search or halving an interval; this interval shrinks from two requirements’ ends, not by halves.',
    ],

    contrastWith: [
      {
        concept: 'rangeAndCandidates',
        note: 'There one range sorts many published versions one at a time. Here two ranges cut each other down and the verdict needs no version at all.',
      },
      {
        concept: 'diamondDependency',
        note: 'Both have two callers asking for one name. There one pick satisfies both; here the shared range is empty before any pick is possible.',
      },
      {
        concept: 'twoCopiesCoexist',
        note: 'Both start from ranges that cannot share a version. This claim stops at failure under a one-copy rule; that one lets each caller keep its own copy.',
      },
      {
        concept: 'halveTheRange',
        note: 'Both shrink an interval until it can hold nothing. Halving removes half of the candidates with each probe; here the interval shrinks only because each requirement contributes one end.',
      },
    ],
  },
};
