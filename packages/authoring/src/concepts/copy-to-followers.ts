/**
 * copyToFollowers 개념 선언.
 *
 * canonical facet 은 `facet:copyToFollowers` — 노드 셋(`n1` 리더 · `n2` `n3` 팔로워)이 빈 채로 시작한다. 쓰기 `a=1` 이
 * 리더에 먼저 적히고(사본 1), 두 팔로워에 한꺼번에 가서 사본 3, 셋 모두 적은 뒤에야 ok. `b=2` 도 같은 세 걸음. 그다음
 * 리더가 멈추고, 읽기 `b` 가 `n2` 로 가서 `2` 를 받는다(살아 있는 사본 2). 아홉 걸음, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `replication` 은 기다릴 팔로워 수를 손잡이로 두고 지연 · 옛 값 · 거절을 맞바꾼다. 이쪽은 그 가운데 **모두를
 * 기다리는** 끝 한 장면이고, 주장은 "사본이 여럿이라 리더가 멈춰도 값이 남아 읽힌다" 하나다. 그래서 definition 은
 * every follower · stops · still answers 를 독점하고, 몇을 기다리느냐 · 지연 · 옛 값 · 갈라짐은 쓰지 않는다.
 *
 * 전제 (설명 글 `copyToFollowers.md`): 동기 복제로 줄였다. 시각과 지연은 없고 리더가 멈춘 뒤 새 리더를 뽑는 일도 그리지
 * 않는다. 코드 패널은 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const copyToFollowersConcept: FacetConceptSource = {
  id: 'copyToFollowers',
  label: 'Copy Every Write to the Followers (Synchronous Replication)',
  canonicalFacet: 'facet:copyToFollowers',

  surface: {
    definition:
      'In synchronous leader-follower replication the leader writes a value, sends it to every follower, and replies ok only once all hold it, so after the leader stops a follower still answers the read.',
    exemplarKeywords: [
      'synchronous replication',
      'leader-follower replication',
      'primary and replica',
      'master-slave replication',
      'redundant copies',
      'replica survives node failure',
      'read from a replica after the primary fails',
      'high availability through replicas',
    ],
  },

  briefing: {
    observable: [
      'Three nodes stand beside a client: `n1` marked leader, `n2` and `n3` marked follower. "Every node is empty."',
      '"Write a=1 lands on the leader first. Copies: 1" — the value appears only on `n1`. Next, "The leader sends a=1 to every follower at once. Copies: 3", and both followers show `a=1`.',
      'Only then does the ok travel back: "Reply comes back only after all have written: ok. Copies: 3". The write `b=2` goes through the same three steps.',
      '"Node n1 stops." The leader is marked stopped; its values are still drawn on it, but it no longer answers.',
      '"Read b goes to n2. Answer: 2. Live copies: 2" — the read is served by a follower that received the copy earlier. Nine steps in all.',
      'Replication is reduced to its simplest form: no clock or delays, and no election of a new leader after `n1` stops. In asynchronous replication, where the leader replies before the followers have written, a follower can briefly hold an old value; that does not happen here. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the nine steps by itself and stops after the read on `n2`.',
        'A Replay button and a playback strip sit below it. Holding the step where the ok returns shows all three nodes already holding the value; holding the last step shows the answer coming from a follower while the leader is stopped.',
      ],
    },

    useWhen: [
      'The article introduces replication by its purpose — keep copies so a node can fail without losing data — and needs the smallest case where the leader stops and a follower still serves the value.',
      'A reader asks what "synchronous" means for replication; the ok that waits until every node shows the value makes the order of events visible.',
    ],

    avoidWhen: [
      'The article is about replication lag, stale reads or eventual consistency. Every follower has the value before the ok, so no stale read occurs.',
      'The subject is failover, promotion of a new leader, or consensus. After the leader stops nothing is elected; a follower simply answers a read.',
      'The point is the latency cost of waiting for followers. There is no clock or delay here.',
    ],

    contrastWith: [
      {
        concept: 'replication',
        note: 'Waiting for every follower is one setting of how many copies a write waits for; the broader concept weighs that setting against faster answers that leave fewer copies.',
      },
      {
        concept: 'replicationLag',
        note: 'Replying only after every follower has written means no read can find an old value; replying first lets reads on followers return the previous value until the copy arrives.',
      },
      {
        concept: 'majorityDecides',
        note: 'Waiting for all nodes means one silent follower stalls the reply; a consensus commit waits only for a majority, so it continues with nodes down.',
      },
    ],
  },
};
