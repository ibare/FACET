/**
 * majorityDecides 개념 선언.
 *
 * canonical facet 은 `facet:majorityDecides` — 리더 `S1`(term 4)이 0 ms 에 쓰기 `z=9` 를 로그 1 번 칸에 적고 팔로워에게
 * 보낸다. 응답은 `S2` 30 · `S3` 50 · `S4` 90 ms, `S5` 는 처음부터 멈춰 답이 없다. 50 ms 에 사본 3 / 5 로 과반 — 확정, 손님에게
 * ok. 90 ms 의 넷째 응답은 아무것도 바꾸지 않는다. 일곱 걸음, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `raft` 는 노드 수와 멈춤을 돌려 문턱이 옮겨 가는 것을 보인다. 이쪽은 **쓰기 하나가 확정되는 순간** 한 장면이고,
 * 주장은 "과반째 사본에서 확정되고 나머지는 기다리지 않는다" 다. 그래서 definition 은 log entry · the moment · copies ·
 * slowest or crashed follower · later acknowledgements 를 독점하고, 표 · 선출 · 노드 수 조절은 쓰지 않는다.
 *
 * 전제 (설명 글 `majorityDecides.md`): 응답 시각은 예로 정한 왕복 지연. 실제 AppendEntries 는 하트비트와 함께 여러 번 오가고
 * 리더는 commitIndex 를 다음 메시지로 알린다 — 그 세부를 덜었다. 코드 패널은 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const majorityDecidesConcept: FacetConceptSource = {
  id: 'majorityDecides',
  label: 'A Majority of Copies Commits a Raft Log Entry',
  canonicalFacet: 'facet:majorityDecides',

  surface: {
    definition:
      'A Raft leader commits a log entry the moment copies of it exist on a majority of nodes, without waiting for the slowest or a crashed follower; later acknowledgements change nothing.',
    exemplarKeywords: [
      'commit a log entry',
      'commit index',
      'majority quorum',
      'AppendEntries acknowledgement',
      'replicated log',
      'quorum write',
      'why a majority is enough',
      'overlapping quorums',
      'write survives follower failure',
    ],
  },

  briefing: {
    observable: [
      '"Leader: S1, term 4. Log: empty. Down from the start: S5." Five nodes with a client; S5 is marked down. Counters read "copies: 0 / 5" and "majority: 3".',
      '"0 ms: write z=9 arrives at S1, goes into log slot 1. Copies: 1 / 5." The entry shows as (4, z=9). Then "0 ms: the leader sends z=9 to every follower. Never arrives: S5."',
      '"30 ms: reply from S2. Copies: 2 / 5, below the majority 3."',
      '"50 ms: reply from S3. Copies: 3 / 5, majority 3 reached — committed, ok to the client." The leader\'s entry is marked "committed · 50 ms" and an ok goes to the client.',
      '"90 ms: reply from S4. Copies: 4 / 5. Commit time: 50 ms." The fourth copy changes nothing. The last step: "No reply ever: S5. Copies: 4 / 5, committed at 50 ms." Seven steps in all.',
      'The reply times 30, 50 and 90 ms are example round-trip delays. In real Raft AppendEntries travels repeatedly alongside heartbeats and the leader tells followers the commit index in later messages; only the counting of copies is kept here. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the seven steps by itself and stops with S5 still silent.',
        'A Replay button and a playback strip sit below it. Holding the 50 ms step shows the commit happening while S4 has not replied and S5 never will.',
      ],
    },

    useWhen: [
      'The article defines when a write in a Raft-based store such as etcd counts as committed, and needs the exact reply that crosses the majority, with a slower reply and a dead node left out of the wait.',
      'A reader asks why a consensus log keeps accepting writes with nodes down; the entry committed at 3 of 5 while one node never answers shows it.',
    ],

    avoidWhen: [
      'The article is about how the leader was elected. The leader is given from the start.',
      'The subject is repairing a follower whose log disagrees with the leader. Every follower that answers simply appends the one entry.',
      'The point is choosing cluster size or how many failures are tolerable. The cluster is fixed at five with one node down.',
    ],

    contrastWith: [
      {
        concept: 'raft',
        note: 'The commit rule fixes one moment for one entry; the fault-tolerance view asks how that moment shifts with cluster size and failures, and when it never comes.',
      },
      {
        concept: 'electALeader',
        note: 'The same majority threshold governs elections, but an election counts votes to choose a leader, while a commit counts copies to make an entry permanent.',
      },
      {
        concept: 'copyToFollowers',
        note: 'Waiting for every copy makes one silent node block every write; waiting for a majority keeps writes flowing and still guarantees any future majority includes a node with the entry.',
      },
    ],
  },
};
