/**
 * rangeAndCandidates 개념 선언.
 *
 * canonical facet 은 `facet:rangeAndCandidates` — 요구 `^1.2.0` 이 두 끝(아래 1.2.0 포함 · 위 2.0.0 제외)으로 풀리고,
 * 공개된 버전 여덟이 작은 것부터 하나씩 대어져 Below · Inside · Above 셋으로 갈린다. 안에 든 넷 가운데 가장 큰
 * `1.9.4` 가 뽑힌다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 같은 묶음의 `semanticVersioning`(완제품)은 새 버전 하나를 받느냐를 받는 쪽 셋으로 견주고, `pinWhatWasChosen` 은 고른 것을
 * 다음 설치로 넘긴다. 이쪽은 **요구 하나가 공개 목록을 거르는 장면**이다 — 끝을 포함하느냐 빼느냐, 수로 견주느냐,
 * 안에 든 여럿 가운데 무엇을 뽑느냐. 그래서 definition 은 inclusive · exclusive · published versions · sorted into ·
 * highest qualifying 을 독점하고, publisher · lock · two requirements 를 쓰지 않는다.
 *
 * 전제 (설명 글 `rangeAndCandidates.md`): 범위 안 가장 큰 것을 고르는 것은 npm 의 기본 고르기다. 설치된 것 · 잠금을 먼저 쓰는
 * 일은 없다. 요구는 하나. 버전은 세 수. major 가 1 이라 0.x 캐럿 특례는 나오지 않는다. 범위 표기 `^` 는 실제 npm 표기 그대로다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const rangeAndCandidatesConcept: FacetConceptSource = {
  id: 'rangeAndCandidates',
  label: 'Caret Range: Which Published Versions Qualify',
  canonicalFacet: 'facet:rangeAndCandidates',

  surface: {
    definition:
      'A caret requirement like ^1.2.0 unfolds into an inclusive lower bound and an exclusive upper bound; each published version is compared numerically and sorted below, inside or above, and the highest qualifying one is selected.',
    exemplarKeywords: [
      'what does ^1.2.0 mean',
      'caret range',
      'version range in package.json',
      'npm semver range matching',
      'is 2.0.0 included in ^1.2.0',
      'upper bound excluded',
      'compare versions numerically 1.10.0 vs 1.9.4',
      'npm picks the highest matching version',
      'satisfying versions',
    ],
  },

  briefing: {
    observable: [
      'A Requirement card holds `^1.2.0`; a Published row holds eight versions in ascending order: `0.9.0` · `1.1.9` · `1.2.0` · `1.2.5` · `1.5.3` · `1.9.4` · `2.0.0` · `2.3.1`.',
      'The first step unfolds the requirement: "Lower end 1.2.0, included. Upper end 2.0.0, excluded." The two ends are marked "included" and "excluded", and three bins open: Below, Inside and Above.',
      'Then the versions leave the Published row one per step, smallest first, and drop into a bin with a judgement: "0.9.0 < 1.2.0 — below the range.", "1.2.0 ≤ 1.5.3 < 2.0.0 — inside.", "2.3.1 ≥ 2.0.0 — above the range."',
      'Both boundaries are in the data: `1.2.0` equals the lower end and lands Inside, `2.0.0` equals the upper end and lands Above.',
      'After eight judgements the bins hold 2 below, 4 inside and 2 above. The last step leads an arrow from the requirement to `1.9.4` with "Inside: 4. Largest: 1.9.4." — eleven steps counting the start.',
      'Choosing the largest version inside the range is npm’s default; nothing already installed or locked is consulted, and only one requirement is involved. Versions are three plain numbers and the 0.x caret rule does not arise.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one version per step, and stops after the pick.',
        'A Replay button and a playback strip sit below. Dragging back to steps 4 and 8 holds the two boundary cases, where a version equal to an end goes to opposite bins.',
        'The requirement and the eight versions are fixed, so every comparison line can be quoted as shown.',
      ],
    },

    useWhen: [
      'A reader thinks `^1.2.0` means exactly 1.2.0, and the article needs to show the whole set of published versions it admits and which one npm actually installs.',
      'The article warns about the edges of a range — lower end included, upper end excluded — and wants both edge cases landing in opposite bins.',
    ],

    avoidWhen: [
      'The article is about two packages asking for the same dependency with different ranges; there is a single requirement here.',
      'The subject is lock files or why a second install gets the same versions; nothing is locked or installed.',
      'The topic is range syntax beyond caret, such as `>=`, `||` or `x` wildcards, or pre-release versions.',
    ],

    contrastWith: [
      {
        concept: 'semanticVersioning',
        note: 'Both unfold a range into two ends. This claim filters a whole published list and picks one; that one asks whether a single new release is taken under a consumer’s policy.',
      },
      {
        concept: 'pinWhatWasChosen',
        note: 'Both rely on taking the highest version in range. This is the act of choosing; that is about recording the choice so later installs skip it.',
      },
      {
        concept: 'noOverlap',
        note: 'Here one range meets many versions and the verdict is per version. There two ranges meet each other and the verdict holds before any version is looked at.',
      },
    ],
  },
};
