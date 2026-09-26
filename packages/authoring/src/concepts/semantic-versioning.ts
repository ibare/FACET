/**
 * semanticVersioning 개념 선언.
 *
 * canonical facet 은 `facet:semanticVersioning` — 꾸러미 `units` 하나, 받는 쪽에 깔린 `1.4.2`. 손잡이 둘로
 * 내보낸 바뀜(고침 · 기능 추가 · 호환 깨짐)과 받는 쪽(`^1.4.2` · `~1.4.2` · `^1.4.2` + 잠금)을 고르면, 한 판에 새 버전
 * 하나가 나오고 받는 쪽이 그것을 깔거나 제자리에 둔다. 코드 패널은 IR 하나를 여섯 언어로 옮긴 `receive` 다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 각각 한 장면이다 — 내보내는 쪽이 자리를 올림(`threeNumbers`) · 범위 하나가 공개된 후보를 거름
 * (`rangeAndCandidates`) · 잠금 파일이 고른 것을 다음 설치에 넘김(`pinWhatWasChosen`). 이쪽은 **두 쪽 사이의 약속**을
 * 맡는다 — 바뀜의 무게를 돌리면 오르는 자리가, 받는 쪽을 돌리면 같은 새 버전을 받느냐가 갈린다. 그래서 definition 은
 * publisher · consumer · agreement · taken or held back 을 쥐고, 조각들이 독점한 heaviest · resets to zero ·
 * inclusive/exclusive bound · highest inside · reproducible 을 쓰지 않는다.
 *
 * 전제 (설명 글 `semanticVersioning.md` 가 밝힌 것 — 화면은 각주가 없다):
 *  - 버전은 세 수. 프리릴리스 · 빌드 표식 · 앞붙이 `v` 는 없다. 0.x 의 `^` 특례는 데이터에 없고 코드 패널의 `upperPart` 만 푼다.
 *  - 새 버전은 한 판에 하나라 "범위 안 가장 큰 것 고르기" 가 나오지 않는다.
 *  - 잠금 파일은 이름 · 버전 두 칸으로 줄였다. 잠긴 버전은 늘 범위 안이라 `npm install`(범위를 다시 풀어 잠금을 고친다)과
 *    `npm ci`(어긋나면 오류로 멈춘다)가 갈리는 경우가 나오지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const semanticVersioningConcept: FacetConceptSource = {
  id: 'semanticVersioning',
  label: 'Semantic Versioning: Publisher Bumps, Consumer Ranges and Lock Files',
  canonicalFacet: 'facet:semanticVersioning',

  surface: {
    definition:
      'Semantic versioning as an agreement between publisher and consumer: the kind of change decides which version number the publisher raises, and the consumer’s caret or tilde range, or a lock file, decides whether that release is taken.',
    exemplarKeywords: [
      'semver',
      'semantic versioning',
      'major minor patch',
      'caret vs tilde',
      '^ vs ~ in package.json',
      'will npm update pick up this release',
      'breaking change needs a major version',
      'package-lock.json',
      'npm install vs npm ci',
      'dependency version contract',
    ],
  },

  briefing: {
    observable: [
      'One package, `units`, with `1.4.2` installed on the receiving side. Each round publishes one new version and the receiver either installs it or keeps what it has.',
      'At the top, three cells hold the version digits labelled major, minor and patch. A `+1` mark moves to the digit the published change raises and the cells to its right drop to 0: Fix gives `1.4.3`, New feature gives `1.5.0`, Breaking change gives `2.0.0`. The caption reads, for example, "New feature: minor +1 · dropped to 0: patch".',
      'Below, a number line with the ticks 1.4.2 · 1.4.3 · 1.5.0 · 2.0.0 shows the receiver’s range as two ends, lower closed and upper open — "^1.4.2 → [1.4.2, 2.0.0)" or "~1.4.2 → [1.4.2, 1.5.0)" — and the new version’s dot is judged "inside" or "above the range".',
      'A version equal to the upper end is outside: `~1.4.2` rejects `1.5.0` and `^1.4.2` rejects `2.0.0`. Inside, the Installed marker moves ("Installed moves: 1.4.2 → 1.5.0"); outside it stays ("Installed stays: 1.4.2").',
      'Across the nine combinations, the `^` receiver takes two releases (fix and feature), the `~` receiver takes one (fix), and the `^` + lock receiver takes none.',
      'With the lock, the lock file is read before any range is worked out — "Lock file read first: units 1.4.2" — and the round ends one step sooner with "Installed stays at the locked version: 1.4.2", even when the new version `1.4.3` lies inside the range.',
      'Two readouts are per round, not cumulative: Accepted is 0 or 1, and Digits reset to 0 counts right-hand digits that were not already 0 (0 for fix, 1 for feature, 2 for breaking from `1.4.2`).',
      'Versions are three plain numbers compared numerically; pre-release tags, build metadata and the 0.x caret rule do not appear in the data. The lock file is reduced to a name and a version, and the locked version always lies inside the range.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Published change" (Fix, New feature, Breaking change; starts at New feature) and "Receiver" (^ range, ~ range, ^ + lock; starts at ^ range). Each round plays to its end and waits for the handles.',
        'The move that makes the idea land is holding the change fixed and switching the receiver: the same `1.5.0` is taken by `^`, refused by `~` at the boundary, and never even compared under the lock.',
        'The code panel, labelled "Receive a release", shows `receive`, which bumps a digit, returns early when a lock is present, and otherwise computes the upper end with `upperPart` and compares. It is one meaning written out in Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why a library author must bump major for a breaking change, and needs to show on the consumer side that `^` and `~` ranges only protect them if the publisher keeps that promise.',
      'A reader wonders why a teammate’s install did not pick up a fix that the range clearly allows, and the article wants to set range-based acceptance next to a lock file that overrides it.',
    ],

    avoidWhen: [
      'The article is about pre-release tags, build metadata or the special caret rule for 0.x versions; none of these appear in the data.',
      'The subject is how a resolver picks among many published versions or reconciles several packages asking for the same dependency. Only one new version and one receiver exist per round.',
      'The topic is version control history, release branches or git tags rather than package version numbers.',
    ],

    contrastWith: [
      {
        concept: 'threeNumbers',
        note: 'Both raise a digit and zero the ones to its right. That claim is about the publisher’s side alone and how the heaviest change in a batch wins; this one is about the promise the digit carries to whoever consumes it.',
      },
      {
        concept: 'rangeAndCandidates',
        note: 'Both turn a range into a lower and an upper end. There the question is which of many published versions qualify and which is picked; here it is whether one new release gets taken at all.',
      },
      {
        concept: 'pinWhatWasChosen',
        note: 'Both say a lock file outranks the range. That claim follows the lock across two installs to show reproducibility; here the lock is one consumer policy weighed against plain ranges for a single release.',
      },
      {
        concept: 'dependencyResolution',
        note: 'Semantic versioning fixes what a version number promises to a single consumer; dependency resolution asks what happens when several consumers ask for the same package with different ranges.',
      },
    ],
  },
};
