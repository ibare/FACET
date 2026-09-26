/**
 * replicationLag 개념 선언.
 *
 * canonical facet 은 `facet:replicationLag` — 노드 셋(`n1` 리더 · `n2` `n3` 팔로워)이 `x=5` 로 시작한다. 0 ms 에 쓰기
 * `x=8` 이 리더에 오고 곧바로 ok. 새 값은 `n2` 에 200 ms, `n3` 에 500 ms 에 닿는다. 읽기 셋 — 100 ms `n2` → 5,
 * 300 ms `n3` → 5(그때 `n2` 는 이미 8), 600 ms `n3` → 8. 옛 값 읽기 2 / 3. 일곱 걸음, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `replication` 은 기다릴 팔로워 수를 돌린다. 이쪽은 **아무도 기다리지 않는** 끝 한 장면이고, 주장은
 * "ok 뒤에도 팔로워 읽기는 한동안 옛 값을 준다 · 어느 팔로워냐에 따라 답이 갈린다" 하나다. 그래서 definition 은
 * immediately · later · different delays · previous value 를 독점하고, 멈춤 · 갈라짐 · 기다리는 수는 쓰지 않는다.
 *
 * 전제 (설명 글 `replicationLag.md`): 지연 200 · 500 ms 는 예로 정한 값(실제로는 늘 달라지고 몇 초 넘게 벌어지기도 한다).
 * 비동기 복제로 줄였다. 코드 패널은 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const replicationLagConcept: FacetConceptSource = {
  id: 'replicationLag',
  label: 'Replication Lag (Stale Reads from Followers)',
  canonicalFacet: 'facet:replicationLag',

  surface: {
    definition:
      'With asynchronous replication the leader acknowledges a write immediately and followers receive it later, each after a different delay, so a read sent to a follower before its copy arrives returns the previous value.',
    exemplarKeywords: [
      'replication lag',
      'asynchronous replication',
      'eventual consistency',
      'stale read from a read replica',
      'read-your-writes violation',
      'replica delay',
      'Seconds_Behind_Master',
      'reading from replicas returns old data',
      'monotonic reads',
    ],
  },

  briefing: {
    observable: [
      'Three rows along a time axis marked 0 to 600 ms: `n1` leader, `n2` and `n3` follower, with a client. "Before the write, every node holds x=5."',
      '"0 ms · write x=8 lands on leader n1" and at once "ok at once · nodes already at x=8: 1 / 3" — the client has its ok while both followers still hold 5.',
      '"100 ms · read x at n2 → x=5", tagged Old value. At 200 ms "the new value reaches n2: x=8" with "Lag: 200 ms".',
      '"300 ms · read x at n3 → x=5", again Old value — at that moment `n2` already holds 8, so the answer depends on which follower the read reaches.',
      'At 500 ms the new value reaches `n3` (Lag: 500 ms), and "600 ms · read x at n3 → x=8" is a New value with 3 / 3 nodes at x=8. A tally shows 2 of 3 reads returned the old value. Seven steps in all.',
      'The delays of 200 ms and 500 ms are example values chosen to make the gap visible; real lag varies with network and follower load and can exceed several seconds. Replication is reduced to one leader, two followers and one write. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the seven steps by itself and stops after the 600 ms read.',
        'A Replay button and a playback strip sit below it. Holding the 300 ms read shows one follower already at 8 and the other still at 5 while the client already has its ok.',
      ],
    },

    useWhen: [
      'The article warns that reading from replicas can return data older than a write that has already been confirmed, and needs the gap between the ok and the arrival on each follower drawn on a clock.',
      'A reader wants to see why two reads right after the same write can disagree: one follower has caught up, the other has not.',
    ],

    avoidWhen: [
      'The article is about network partitions or the CAP theorem. The network never splits; the copies arrive, only late.',
      'The subject is conflict resolution between writers. There is a single write on a single leader.',
      'The point is synchronous replication or quorum settings. The leader never waits for any follower.',
    ],

    contrastWith: [
      {
        concept: 'replication',
        note: 'Not waiting is one setting of how many followers a write waits for. The broader concept compares it with settings that answer later but leave fewer stale readers.',
      },
      {
        concept: 'copyToFollowers',
        note: 'When the reply waits for every follower, no follower can be behind a confirmed write; answering first is what opens the window of stale reads.',
      },
      {
        concept: 'partitionForcesChoice',
        note: 'Lag is temporary: the copy is on its way and reads become fresh. Under a partition the copy cannot arrive at all, and the node must choose between an old answer and none.',
      },
    ],
  },
};
