/**
 * threeNumbers 개념 선언.
 *
 * canonical facet 은 `facet:threeNumbers` — 처음 버전 `1.4.2` 에서 내보냄 넷. 내보냄마다 바뀐 것들이 종류(고침 · 기능 추가 ·
 * 호환 깨짐)의 길로 들어오고, 그 가운데 가장 무거운 하나가 올릴 자리를 고른다. 오른 자리의 오른쪽은 0 으로 떨어진다.
 * 끝 버전 `2.0.1`. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 같은 묶음의 `semanticVersioning`(완제품)은 내보내는 쪽과 받는 쪽의 약속 전체를 보이고, `rangeAndCandidates` 와
 * `pinWhatWasChosen` 은 받는 쪽의 장면이다. 이쪽은 **내보내는 쪽 혼자의 일** — 한 번에 여럿이 바뀌었을 때 가장 무거운
 * 것 하나가 자리를 정하고 가벼운 고침은 묻힌다는 것 — 만 쥔다. 그래서 definition 은 heaviest · several changes in one
 * release · resets to zero · absorbed 를 독점하고, range · consumer · lock · accept 를 쓰지 않는다.
 *
 * 전제 (설명 글 `threeNumbers.md`): 버전은 세 수이고 1 이상에서 시작해 0.x 관례가 나오지 않는다. 바뀜의 종류는 이미
 * 정해졌다고 둔다. 프리릴리스 · 빌드 표식은 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const threeNumbersConcept: FacetConceptSource = {
  id: 'threeNumbers',
  label: 'Which Version Number a Release Bumps',
  canonicalFacet: 'facet:threeNumbers',

  surface: {
    definition:
      'When one release bundles several changes, only the heaviest kind picks the number to increment — breaking raises major, a feature minor, a fix patch — and every number to its right resets to zero.',
    exemplarKeywords: [
      'how to bump a version',
      'when to increment major minor or patch',
      'version bump rules',
      'patch resets to zero after a minor bump',
      'release with a fix and a feature',
      'breaking change bumps major',
      'npm version major minor patch',
      'changelog to version number',
      'semver increment',
    ],
  },

  briefing: {
    observable: [
      'Three cells show the current version, labelled Major, Minor and Patch, starting at `1.4.2`. Under each cell runs a lane for the kind of change that raises it: Breaking change under Major, New feature under Minor, Fix under Patch.',
      'Each release first brings its changes into their lanes with a tag such as "Release 2 · changes: 2 · heaviest: New feature". The next step raises that digit with a `+1` mark and states "raised: Minor · dropped to 0: Patch".',
      'Four releases play out: Timeout fix gives `1.4.2 → 1.4.3`; Retry added with Typo fix gives `1.4.3 → 1.5.0`; Callback style removed with Streams added and Memory leak fix gives `1.5.0 → 2.0.0`; Header fix gives `2.0.0 → 2.0.1`.',
      'In the second release the typo fix does not raise Patch on its own: the version is `1.5.0`, not `1.5.1`, because the minor bump resets Patch to 0 and the fix sinks with it.',
      'In the third release Minor 5 drops to 0 while Patch was already 0, so only one digit is counted as dropped. A chain of versions `1.4.2 → 1.4.3 → 1.5.0 → 2.0.0 → 2.0.1` grows along the top.',
      'The run ends with "Releases: 4 · changes: 7 · drops to 0: 2" after nine steps counting the start. The versions start above 1.0.0, so the 0.x convention does not arise, and the kind of each change is given rather than decided on screen.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, two steps per release, and stops after `2.0.1`.',
        'A Replay button and a playback strip sit below. Dragging the strip to the second release holds the moment the typo fix enters the Fix lane yet the version lands on `1.5.0`.',
        'The releases and their change lists are fixed, so every version, lane and caption can be quoted exactly as shown.',
      ],
    },

    useWhen: [
      'The article gives version bump rules and needs a case where one release mixes a fix with a feature, so the reader sees the fix does not earn its own patch number.',
      'A reader asks why patch went back to 0 after a minor release, and the article wants the reset shown digit by digit across a sequence of releases.',
    ],

    avoidWhen: [
      'The article is about which versions a `^` or `~` range accepts, or about installing and locking dependencies. Only the publishing side is shown.',
      'The subject is pre-release tags, build metadata or 0.x versions.',
      'The topic is deciding whether a given change is breaking; here each change arrives already labelled with its kind.',
    ],

    contrastWith: [
      {
        concept: 'semanticVersioning',
        note: 'Both raise a digit by the weight of a change. This claim ends at the publisher and adds the rule that the heaviest change in a batch decides; that one follows the new number to a consumer who takes or refuses it.',
      },
      {
        concept: 'rangeAndCandidates',
        note: 'This is how version numbers are produced; that is how a requirement reads them back. The numbering rule here is what makes a caret range safe to accept.',
      },
    ],
  },
};
