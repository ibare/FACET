/**
 * keepOldVersion 개념 선언.
 *
 * canonical facet 은 `facet:keepOldVersion` — 줄 `tea` 30(틱 1 부터). 틱 2 `W2(tea=35)` 가 시작 틱 빈 새 판을 얹고, 틱 3 `C2` 가 30 의
 * 끝 틱과 35 의 시작 틱에 같은 3 을 찍는다. 틱 4 `W3(tea=40)` · 틱 5 `C3` 가 한 번 더. 끝에 판 셋, 지금 판 40. 네 걸음, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `mvcc` 는 스냅샷 수명과 청소를, 형제 `readSeesSnapshot` 은 읽는 쪽이 판을 고르는 일을 쥔다. 이쪽은 **쓰는 쪽** — 덮지 않고
 * 얹는다, 커밋 틱이 두 판의 경계를 한꺼번에 찍는다 — 만 쥔다. 그래서 definition 은 never overwrites · appends · stamps · end · start ·
 * without gap or overlap 을 독점하고, snapshot · vacuum · reader 를 쓰지 않는다.
 *
 * 전제 (설명 글 `keepOldVersion.md`): 틱은 사건마다 하나 오르는 차례 수. 청소는 그림 밖. 값과 틱은 예.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const keepOldVersionConcept: FacetConceptSource = {
  id: 'keepOldVersion',
  label: 'An Update Adds a Version Instead of Overwriting',
  canonicalFacet: 'facet:keepOldVersion',

  surface: {
    definition:
      'Under multiversioning an update never overwrites a row in place; it appends a new version, and its commit stamps one tick as both the old version\'s end and the new one\'s start, leaving no gap or overlap.',
    exemplarKeywords: [
      'row versions',
      'version chain',
      'append-only update',
      'no update in place',
      'xmin and xmax',
      'begin and end timestamps',
      'tuple versioning',
      'temporal validity interval',
      'copy-on-write rows',
    ],
  },

  briefing: {
    observable: [
      'A column of versions for row `tea` has Start tick and End tick fields; a tick counter runs above. At tick 1 there is one version, 30, start 1, end ∞, marked "Current": "Row tea before any change. Versions: 1."',
      '"W2(tea=35): a new version is stacked on top. Versions: 2." The 35 belongs to T2, its start tick is still blank, and 30 below stays current and unchanged.',
      '"C2 at tick 3: version 30 ends, version 35 begins. Versions: 2." The same number 3 is written into 30\'s end and 35\'s start at once, and "Current" moves to 35.',
      '"W3(tea=40)" stacks a third version at tick 4; "C3 at tick 5: version 35 ends, version 40 begins. Versions: 3." The final stack is 30 from 1 to before 3, 35 from 3 to before 5, 40 from 5 onward.',
      'Because each boundary is written by one commit, the intervals touch with no gap and no overlap, so exactly one version is current at any tick. Overwriting in place would have left 40 alone.',
      'Ticks count events, not clock time. Cleaning up old versions and choosing which version a reader sees are outside this picture. Values are chosen for the example. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays the four steps by itself and stops after the second commit.',
        'A Replay button and a playback strip sit below it. Holding an uncommitted write shows the new version stacked on top with an empty start tick while the old one is still current.',
      ],
    },

    useWhen: [
      'The article introduces multiversion storage and needs the basic write path: nothing is overwritten, and each version records the span of time it was current.',
      'A reader asks how a database can know which value was valid at a given moment; the shared commit tick that closes one version and opens the next is the answer.',
    ],

    avoidWhen: [
      'The article is about which version a particular transaction reads. No reader appears here.',
      'The subject is vacuum, garbage collection or table bloat. Old versions are never removed in this picture.',
      'The point is concurrent writers conflicting on the same row. The two writers here never overlap.',
    ],

    contrastWith: [
      {
        concept: 'readSeesSnapshot',
        note: 'Appending versions with validity intervals is the write side; the read side is choosing the one version whose interval covers a transaction\'s snapshot.',
      },
      {
        concept: 'mvcc',
        note: 'Keeping old versions is the mechanism; how many must be kept, and when cleanup may drop them, depends on the snapshots still open.',
      },
      {
        concept: 'lostUpdate',
        note: 'A lost update is an overwrite that silently discards another change; keeping versions makes every committed value remain, each tied to the interval when it was current.',
      },
    ],
  },
};
