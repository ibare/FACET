/**
 * logReplicateInOrder 개념 선언.
 *
 * canonical facet 은 `facet:logReplicateInOrder` — 리더 `S1` 의 로그 다섯 칸 (1, x=1) · (1, y=2) · (2, x=3) · (3, z=5) · (3, y=7),
 * 팔로워 `S2` 는 앞 세 칸이 같고 4 번 칸이 (2, q=8). nextIndex 6 에서 시작해 물음(앞 칸 번호 · 임기)을 한 칸씩 뒤로 물린다 —
 * 5 번 없음 거절 · 4 번 임기 2 ≠ 3 거절 · 3 번 임기 2 맞음. `S2` 가 (2, q=8) 을 지우고 4 · 5 번 칸을 차례로 적는다. 보낸 물음 3 ·
 * 거절 2 · 지운 칸 1 · 적은 칸 2. 열 걸음, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `raft` 는 과반 문턱과 버티는 멈춤을 보이고 로그는 한 칸뿐이다. 이쪽은 **어긋난 팔로워 로그를 리더에 맞추는 절차**
 * 한 장면이다. 그래서 definition 은 diverges · probes backward · previous index and term · deletes its conflicting suffix ·
 * index order 를 독점하고, 과반 · 확정 · 선출 · 표는 쓰지 않는다.
 *
 * 전제 (설명 글 `logReplicateInOrder.md`): 로그는 예. 물음 하나가 실제로는 AppendEntries 요청과 응답의 한 왕복이고, 맞는 자리를
 * 찾은 뒤 칸들은 한 요청에 실려 한꺼번에 적힌다 — 여기서는 칸마다 한 걸음으로 펼쳤다. 임기 단위로 건너뛰는 최적화 · 확정 ·
 * 리더 교체는 다루지 않는다. 코드 패널은 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const logReplicateInOrderConcept: FacetConceptSource = {
  id: 'logReplicateInOrder',
  label: 'Raft Log Repair (Walk Back, Then Append in Order)',
  canonicalFacet: 'facet:logReplicateInOrder',

  surface: {
    definition:
      'When a Raft follower\'s log diverges from the leader\'s, the leader probes backward with the previous entry\'s index and term until they match, then the follower deletes its conflicting suffix and appends the leader\'s entries in index order.',
    exemplarKeywords: [
      'log matching property',
      'nextIndex',
      'prevLogIndex and prevLogTerm',
      'AppendEntries consistency check',
      'conflicting log entries',
      'truncate follower log',
      'log reconciliation',
      'uncommitted entry overwritten',
      'follower catches up with leader',
    ],
  },

  briefing: {
    observable: [
      'Two rows of numbered slots #1 to #6: S1 leader above, S2 follower below. Each entry shows its term and command. The leader holds term 1 x=1, term 1 y=2, term 2 x=3, term 3 z=5, term 3 y=7; the follower holds the same first three and term 2 q=8 in slot #4.',
      'A nextIndex marker sits under the leader\'s row: "nextIndex = 6 — one past the leader\'s last entry".',
      'Each probe comes down from the leader to the follower\'s slot of the same number, labelled "term N?": "AppendEntries — previous entry #5, term 3" with "Entries carried: 0" gets "S2 has no entry #5 — rejected"; "nextIndex 6 → 5".',
      'The second probe, previous entry #4 term 3 carrying 1 entry, gets "S2 entry #4 is term 2, the leader\'s is term 3 — rejected"; "nextIndex 5 → 4". Rejected probes bounce back up and leave a "rejected" mark at slots #5 and #4, tracing the walk backward.',
      'The third probe, previous entry #3 term 2 carrying 2 entries, gets "Entry #3 matches (term 2)". Then "S2 deletes from entry #4 on · deleted: 1" — term 2 q=8 drops away, marked deleted.',
      '"S2 writes entry #4: (term 3, z=5)" and "S2 writes entry #5: (term 3, y=7)" come down one per step. The end: "Both logs are equal through entry #5" and "Sent: 3 · rejected: 2 · deleted: 1 · written: 2". Ten steps in all.',
      'The logs are examples. Each probe is really one AppendEntries request and reply across the network, and once the match is found the entries travel in one request; here the round trip is one step and each written entry gets its own step. The optimization that skips back a whole term at a time is not used. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the ten steps by itself and stops when both logs match.',
        'A Replay button and a playback strip sit below it. Holding the step after the second rejection shows the two rejected marks and the nextIndex marker at #4, just before the match.',
      ],
    },

    useWhen: [
      'The article explains how Raft brings a lagging or divergent follower back in line, and needs nextIndex, the previous-entry index and term check, and the truncation of a stale entry laid out slot by slot.',
      'A reader asks what happens to an entry a follower received from an old leader that was never committed; the q=8 entry being deleted and replaced shows it.',
    ],

    avoidWhen: [
      'The article is about committing entries or counting a majority. Only one follower is shown and nothing is counted toward a quorum.',
      'The subject is leader election or how the divergence arose. The leader and both logs are given at the start.',
      'The point is log compaction or snapshots. Every entry stays in the log.',
    ],

    contrastWith: [
      {
        concept: 'raft',
        note: 'The majority threshold decides whether the cluster can make progress; log repair decides that, once it does, every follower ends with exactly the leader\'s sequence of entries.',
      },
      {
        concept: 'majorityDecides',
        note: 'An entry on a majority is committed and can never be the one erased. The entry erased during repair is one that never reached a majority.',
      },
      {
        concept: 'splitBrain',
        note: 'A partition is one way a follower comes to hold entries the current leader does not have; repairing the log is how those entries are found and replaced after the fact.',
      },
    ],
  },
};
