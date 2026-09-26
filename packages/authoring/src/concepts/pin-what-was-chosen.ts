/**
 * pinWhatWasChosen 개념 선언.
 *
 * canonical facet 은 `facet:pinWhatWasChosen` — 요구 `dates ~1.3.0` · `logger ^2.1.0`, 잠금 파일 없음. 첫 설치가 범위 안 가장 큰
 * `1.3.2` · `2.3.4` 를 고르고, 두 줄이 잠금 파일로 옮겨 적힌다. 범위 안의 새 버전 `1.3.3` · `2.4.0` 이 나온 뒤 둘째 설치는
 * 잠금을 먼저 읽어 첫 설치와 같은 둘을 깐다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `rangeAndCandidates` 는 고르는 일, 이쪽은 **고른 것을 적어 두고 다음에 다시 쓰는 일**이다. `semanticVersioning`(완제품)도
 * 잠금을 받는 쪽 한 칸으로 두지만 설치 한 번 안에서다 — 이쪽은 설치 두 번을 잇는다. 그래서 definition 은 records ·
 * later install · reproducible · newer releases left unused 를 독점하고, 올림 · 경계 포함/제외 · 후보 거르기를 쓰지 않는다.
 *
 * 전제 (설명 글 `pinWhatWasChosen.md`): 범위 안 가장 큰 것 고르기는 npm 의 기본. 잠금 파일은 이름 · 버전 두 칸으로 줄였다
 * (실제는 받을 주소 · 무결성 해시 · 아래층 의존까지 적는다). 잠긴 버전이 요구 범위를 벗어나면 `npm install` 은 그 줄을 새로
 * 풀어 잠금을 고치고 `npm ci` · `pnpm install --frozen-lockfile` 은 멈춘다 — 이 데이터에는 그런 일이 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pinWhatWasChosenConcept: FacetConceptSource = {
  id: 'pinWhatWasChosen',
  label: 'Lock File Pins the Versions an Install Chose',
  canonicalFacet: 'facet:pinWhatWasChosen',

  surface: {
    definition:
      'A lock file records the exact versions a first install selected, and a later install reads those lines before resolving any range, so newer releases that fit the range stay unused and installs are reproducible.',
    exemplarKeywords: [
      'lockfile',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'why commit the lock file',
      'reproducible installs',
      'works on my machine different dependency versions',
      'npm ci',
      'pinned dependency versions',
      'deterministic builds',
    ],
  },

  briefing: {
    observable: [
      'The screen starts with "No lockfile yet. Requirements are ranges." A Published shelf lists `dates ~1.3.0` with 1.2.9 · 1.3.0 · 1.3.2 · 1.4.0 and `logger ^2.1.0` with 2.0.0 · 2.1.0 · 2.3.4 · 3.0.0. Three columns wait: First install, Lockfile ("none yet") and Second install.',
      'The first install resolves each range in one step: "First install — dates ~1.3.0: highest in range, 1.3.2." and then logger `2.3.4`. `1.4.0` and `3.0.0` sit at the upper ends and are not taken.',
      'The two chosen lines move across in one step: "Written to the lockfile — lines: 2."',
      'Two new versions appear on the shelf, `1.3.3` and `2.4.0`, each tagged "in range": "New versions published: 2 · inside the range: 2."',
      'The second install reads the lock first for each package — "Second install — dates: read from the lockfile first, 1.3.2." — and gets `1.3.2` and `2.3.4` again. The new versions are relabelled "in range, not picked".',
      'The run ends with "Same as first install: 2/2 · new in range, not picked: 2." after seven steps counting the start.',
      'Picking the highest version in range is npm’s default. The lock file is reduced to a name and a version per line; real lock files also store the download source, an integrity hash and nested dependencies. The locked versions always stay inside the requirements here, so the case where `npm install` rewrites the lock and `npm ci` stops does not arise.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself and stops after the second install.',
        'A Replay button and a playback strip sit below. Dragging between step 2 and step 6 sets the first install’s picks beside the second install’s, with the two in-range newcomers left on the shelf.',
        'The requirements and published versions are fixed, so each caption can be quoted as shown.',
      ],
    },

    useWhen: [
      'The article argues for committing the lock file and needs the case where, without it, two installs from the same `package.json` would get different versions.',
      'A reader asks why a teammate did not receive a patch release that the range clearly allows, and the article needs the install that reads the lock before the range.',
    ],

    avoidWhen: [
      'The article is about what happens when the requirement is edited so the locked version falls outside it; that mismatch does not occur here.',
      'The subject is the contents of a real lock file such as integrity hashes, resolved URLs or the nested tree.',
      'The topic is conflicting ranges between packages or duplicate installed copies.',
    ],

    contrastWith: [
      {
        concept: 'rangeAndCandidates',
        note: 'Both take the highest version inside a range. That claim is the choosing itself; this one is what happens the next time, when the recorded choice outranks the range.',
      },
      {
        concept: 'semanticVersioning',
        note: 'Both put a lock above the range. There the lock is one receiver policy weighed against one release; here the point is repeatability across two installs separated by new releases.',
      },
      {
        concept: 'incrementalBuild',
        note: 'Both reuse an earlier result instead of recomputing. A lock reuses a past decision even when a newer one would be allowed; an incremental build reuses past outputs only while their inputs are unchanged.',
      },
    ],
  },
};
