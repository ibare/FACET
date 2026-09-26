/**
 * readSeesSnapshot 개념 선언.
 *
 * canonical facet 은 `facet:readSeesSnapshot` — 줄 `seats` 12(틱 1 부터). 틱 2 TA 시작(스냅샷 2), 틱 3 TW 가 9 를 씀(떠 있는 판),
 * 틱 4 TW 커밋(12 `[1, 4)` · 9 `[4, ∞)`), 틱 5 TB 시작(스냅샷 5), 틱 6 TA 읽기 → 12, 틱 7 TB 읽기 → 9. 여섯 걸음, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `mvcc` 는 스냅샷 수명과 청소를, 형제 `keepOldVersion` 은 쓰는 쪽을 쥔다. 이쪽은 **읽는 쪽 규칙** — 스냅샷 = 시작 틱, 보이는
 * 판 = 구간이 스냅샷을 덮는 판 — 과, 그 결과 **두** 트랜잭션이 같은 줄에서 다른 값을 받으면서 아무도 기다리지 않는 장면을 쥔다.
 * 그래서 definition 은 interval covers · the tick it began · two concurrent readers · no one blocks 를 독점하고, appends · stamps ·
 * vacuum · reclaim 을 쓰지 않는다.
 *
 * 전제 (설명 글 `readSeesSnapshot.md`): 트랜잭션 단위 스냅샷(PostgreSQL REPEATABLE READ 같은). 문장마다 잡는 엔진이면 TA 는 9 를 받는다.
 * 쓰기끼리의 충돌 · 청소는 다루지 않는다. 틱 · 값은 예.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const readSeesSnapshotConcept: FacetConceptSource = {
  id: 'readSeesSnapshot',
  label: 'A Reader Sees the Version Current at Its Snapshot',
  canonicalFacet: 'facet:readSeesSnapshot',

  surface: {
    definition:
      'A snapshot read returns the version whose validity interval covers the tick its transaction began, so readers that started at different ticks receive different versions and nobody blocks.',
    exemplarKeywords: [
      'snapshot isolation',
      'snapshot read',
      'consistent read',
      'MVCC visibility rules',
      'readers do not block writers',
      'point-in-time view',
      'transaction start timestamp',
      'why two sessions see different values',
      'read view',
    ],
  },

  briefing: {
    observable: [
      'A tick ruler runs 1 to 7 and ∞ above a band for row `seats`, which starts as one version, 12, from tick 1 onward: "Row seats before any transaction. Value: 12."',
      '"Tick 2: TA begins. Snapshot: 2." A marker for TA is pinned at tick 2 and stays there as time moves on.',
      '"Tick 3: TW writes 9. A new version, not yet committed." The 9 floats above the band, labelled "uncommitted", covering no tick.',
      '"Tick 4: TW commits. Old value 12 ends here; new value 9 starts here." The 9 drops into the band: 12 covers `[1, 4)`, 9 covers `[4, ∞)`. "Tick 5: TB begins. Snapshot: 5."',
      '"Tick 6: TA reads with snapshot 2 → 12." — although it is now tick 6 and 9 has been committed, TA drops straight down from 2 and lands in 12. "Tick 7: TB reads with snapshot 5 → 9." The end caption reads "Same row seats: TA → 12, TB → 9."',
      'No step waits: TW writes while TA is open, and the reads proceed while TW\'s version exists. The snapshot is taken at transaction start, as in PostgreSQL\'s REPEATABLE READ; with a snapshot per statement TA would read 9. Write-write conflicts and cleanup are not shown. Values and ticks are chosen for the example. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays the six events by itself and stops after TB\'s read.',
        'A Replay button and a playback strip sit below it. Holding TA\'s read shows its line going down from tick 2 past the committed 9 to land in 12.',
      ],
    },

    useWhen: [
      'The article explains snapshot isolation and needs the visibility rule applied to a concrete case: which version a reader gets depends on when it started, not on when it reads.',
      'A reader is puzzled that two sessions query the same row at almost the same moment and see different values, and neither is blocked or wrong.',
    ],

    avoidWhen: [
      'The article is about one transaction reading a row twice and getting different values. Each reader here reads once, and a repeat would give the same value.',
      'The subject is write skew or conflicts between concurrent writers. Only one writer appears.',
      'The point is statement-level snapshots as in READ COMMITTED. The snapshot here is fixed at transaction start.',
    ],

    contrastWith: [
      {
        concept: 'keepOldVersion',
        note: 'Versions with validity intervals exist because writes append instead of overwrite; the snapshot rule is what makes those intervals useful to readers.',
      },
      {
        concept: 'mvcc',
        note: 'Choosing a version by snapshot is the read rule; keeping each snapshot alive has a storage cost, since every version it might still need must survive cleanup.',
      },
      {
        concept: 'nonRepeatableRead',
        note: 'Under a transaction snapshot, values differ only between transactions that began at different times; a non-repeatable read is values differing inside a single transaction.',
      },
      {
        concept: 'sharedVsExclusive',
        note: 'With locks, a reader and a writer on the same row conflict and one must wait; with snapshots the reader simply uses an older version.',
      },
    ],
  },
};
