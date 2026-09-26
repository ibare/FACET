/**
 * splitBrain 개념 선언.
 *
 * canonical facet 은 `facet:splitBrain` — Raft 노드 다섯, 리더 `S1`, 모두 term 2, 1 번 칸 `(2, x=1)` 확정. 0 ms 에
 * `S1 S2 | S3 S4 S5` 로 갈라진다. 210 ms 에 `S3` 이 term 3 리더가 되어 리더가 둘. 250 ms `y=1` → `S1` 은 사본 2 / 5 로 확정 못 함,
 * 260 ms `y=2` → `S3` 은 사본 3 / 5 로 확정. 300 ms 에 이음이 붙고 320 ms 하트비트(term 3)에 `S1` 이 물러나며 `(2, y=1)` 이
 * `(3, y=2)` 로 덮인다. 열 걸음, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `raft` 는 멈춘 노드로 과반 문턱을 보이고 갈라짐을 그리지 않는다. 이쪽은 **갈라진 뒤 리더가 둘이 되어도 굳는 값은
 * 하나**라는 한 장면이다. 그래서 definition 은 two leaders · different terms · lower-term leader steps down · uncommitted
 * entries are overwritten 을 독점하고, 타이머 세부 · 표 하나하나 · 멈춘 수 조절은 쓰지 않는다.
 *
 * 전제 (설명 글 `splitBrain.md`): 선출 타이머(S3 170 · S4 250 · S5 220 ms) · 편도 20 ms · 쓰기 시각은 예. 선출과 로그 맞추기는
 * 각각 한 걸음으로 줄였다. 옛 리더가 갈라진 동안 읽기에 옛 값을 주는 문제(리스 · 읽기 확인)는 다루지 않는다. 코드 패널은 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const splitBrainConcept: FacetConceptSource = {
  id: 'splitBrain',
  label: 'Split Brain in Raft (Two Leaders, One Committed Value)',
  canonicalFacet: 'facet:splitBrain',

  surface: {
    definition:
      'A network partition can leave two Raft leaders in different terms, but only the side holding a majority can commit; when the network heals, the lower-term leader steps down and its uncommitted entries are overwritten.',
    exemplarKeywords: [
      'split brain',
      'two leaders after a network partition',
      'stale leader',
      'higher term wins',
      'minority partition cannot commit',
      'leader steps down',
      'uncommitted write lost',
      'partition heals',
      'fencing by term number',
    ],
  },

  briefing: {
    observable: [
      'Five nodes S1 to S5 each show a role, a term and their log slots; the leader stands one level higher. Committed entries have solid outlines, uncommitted ones dashed. At the start "Leader: S1 · term 2" and "Slot 1 (2, x=1) · copies: 5 / 5 · committed".',
      '"0 ms · the network splits: S1 S2 | S3 S4 S5" — the group physically moves apart with a "cut" between. "Majority: 3 · group sizes: 2 | 3." S2 keeps hearing S1\'s heartbeats.',
      '"170 ms · S3 timer runs out → candidate, term 3", then "210 ms · votes: 3 (S3 S4 S5) · majority: 3 → leader: S3". "Leaders: 2" lists S1 (term 2) and S3 (term 3); neither hears the other.',
      '"250 ms · write y=1 → S1 (term 2) · slot 2" reaches S2 only: "Copies: 2 / 5 (S1 S2) · majority: 3 → not committed", drawn dashed. "260 ms · write y=2 → S3 (term 3) · slot 2" reaches S4 and S5: "Copies: 3 / 5 (S3 S4 S5) · majority: 3 → committed", drawn solid.',
      '"300 ms · the network heals." "320 ms · heartbeat from S3 (term 3) → S1": "S1: leader → follower · term 2 → 3". Its log is matched: "Slot 2: (2, y=1) erased · (3, y=2) written". S2 is matched the same way.',
      'The end: one leader, S3, and all five logs equal (2, x=1) (3, y=2): "Same log: 5 / 5 · committed up to slot 2" and "Committed and never erased: (2, x=1) (3, y=2)". Only y=1, which never reached a majority, is erased — its client never got a commit reply. Ten steps in all.',
      'Election timers, the 20 ms one-way delay and the write times are example values. The election and the log matching are each condensed into one step. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the ten steps by itself and stops with a single leader and identical logs.',
        'A Replay button and a playback strip sit below it. Holding the 260 ms step shows two leaders side by side, one dashed entry and one solid entry in the same slot.',
      ],
    },

    useWhen: [
      'The article addresses the fear that a network partition lets two leaders accept conflicting writes, and needs the case where two leaders do exist but only the majority side\'s write is committed.',
      'A reader asks what happens to a write accepted by an old leader that was cut off; the dashed entry being erased when the higher term arrives, with its client never told it succeeded, answers it.',
    ],

    avoidWhen: [
      'The article is about stale reads served by an old leader, leases or read-index checks. No reads are performed.',
      'The subject is split brain in active-passive failover setups without consensus, where both sides may really commit. Here the minority side cannot commit anything.',
      'The point is the step-by-step vote exchange or the backward walk of log repair. Each is condensed into a single step.',
    ],

    contrastWith: [
      {
        concept: 'raft',
        note: 'The majority threshold, counted against stopped nodes, gives the number of failures a cluster survives; counted against a partition, it explains why only one side can commit.',
      },
      {
        concept: 'electALeader',
        note: 'An ordinary election produces the only leader. An election on one side of a partition produces a second one, and the term number is what later decides between them.',
      },
      {
        concept: 'partitionForcesChoice',
        note: 'Both start from a split network. For writes, consensus answers the consistency-or-availability question by letting only the majority side proceed, while the minority side keeps accepting writes that can never commit.',
      },
      {
        concept: 'logReplicateInOrder',
        note: 'Replacing the old leader\'s uncommitted entry is an instance of log repair; the general procedure walks back through several mismatching entries to find where the logs agree.',
      },
    ],
  },
};
