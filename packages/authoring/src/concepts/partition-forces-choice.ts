/**
 * partitionForcesChoice 개념 선언.
 *
 * canonical facet 은 `facet:partitionForcesChoice` — 노드 셋이 `x=1` 로 이어져 있다가 `n1 n2 | n3` 로 갈라진다(끊긴 이음 2).
 * 쓰기 `x=2` 가 `n1` 에 와 `n2` 까지만 퍼진다. 읽기 `x` 가 `n3` 에 오고 물어볼 노드는 0. 같은 한 읽기의 두 결말이 나란히 —
 * C: 오류를 돌려준다 · A: `x=1` 로 답한다(마지막 쓰기는 2). 여섯 걸음, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `replication` 은 쓰기 쪽에서 기다릴 팔로워 수가 그 고름을 미리 정하는 것을 보인다. 이쪽은 **끊긴 노드에 온 읽기
 * 하나**가 오류냐 옛 값이냐를 고를 수밖에 없다는 CAP 한 장면이다. 그래서 definition 은 cut off · read · error ·
 * cannot do both 를 독점하고, 리더 · 팔로워 · 기다림 · 지연은 쓰지 않는다.
 *
 * 전제 (설명 글 `partitionForcesChoice.md`): CAP 정리를 읽기 하나로 줄였다. 갈라짐은 끝까지 붙지 않고 따라잡기는 다루지
 * 않는다. 노드 셋과 값 1 · 2 는 예. 시각은 없다. 코드 패널은 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const partitionForcesChoiceConcept: FacetConceptSource = {
  id: 'partitionForcesChoice',
  label: 'A Network Partition Forces a Choice (CAP at One Read)',
  canonicalFacet: 'facet:partitionForcesChoice',

  surface: {
    definition:
      'When a network partition cuts a node off from the side that received the latest write, a read arriving at that node must either return an error or answer with its outdated value; it cannot do both.',
    exemplarKeywords: [
      'CAP theorem',
      'Brewer\'s theorem',
      'network partition',
      'partition tolerance',
      'consistency vs availability',
      'CP vs AP systems',
      'split network',
      'refuse or serve stale data',
      'linearizability under partition',
    ],
  },

  briefing: {
    observable: [
      '"Nodes: 3. All links are up." Three nodes `n1`, `n2`, `n3` each hold `x=1`.',
      '"The network splits: n1 n2 | n3. Links cut: 2." Nothing crosses between the two sides from here on.',
      '"Write x=2 lands on n1. Reached: n1, n2. Blocked: n3." The values are now `n1` 2, `n2` 2, `n3` 1; the copy toward `n3` drops at the cut.',
      '"Read x arrives at n3. Nodes it can reach: 0." `n3` cannot ask the other side whether its value is current.',
      'Two outcomes appear side by side for this same read. "C: consistency" — "Choice C: n3 cannot confirm it is current, so it returns an error." "A: availability" — "Choice A: n3 answers x=1. Latest write: 2."',
      'The two branches are not two reads; they are the two endings open to one read. The CAP theorem is reduced to that single read: the partition is something that happens, not something chosen, and it never heals within the scene, so catching up afterwards is not shown. Three nodes and the values 1 and 2 are examples; there is no clock. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the six steps by itself and stops with both outcomes shown.',
        'A Replay button and a playback strip sit below it. Holding the read step shows `n3` with no reachable node before either outcome appears.',
      ],
    },

    useWhen: [
      'The article states the CAP theorem and needs one concrete moment where consistency and availability cannot both be kept, rather than the usual three-letter triangle.',
      'A reader thinks a system can simply pick all three of C, A and P; the cut-off node with no way to reach the latest write shows that once the partition happens only two endings are left.',
    ],

    avoidWhen: [
      'The article is about the PACELC extension or latency trade-offs without a partition. The only situation shown is a partition.',
      'The subject is how nodes reconcile after the network heals. The partition never ends here.',
      'The point is replication settings or quorum sizes. No leader, follower count or wait is involved.',
    ],

    contrastWith: [
      {
        concept: 'replication',
        note: 'At a single read the choice looks like a decision made in the moment; at the write it becomes a setting fixed in advance, where requiring more copies than can be reached refuses the write.',
      },
      {
        concept: 'replicationLag',
        note: 'A lagging follower returns old data only until the copy arrives; a partitioned node cannot receive it at all, which is why answering and being current become mutually exclusive.',
      },
      {
        concept: 'splitBrain',
        note: 'Both begin with a split network. Choosing between error and old value concerns one read on the cut side; a consensus group avoids that dilemma for writes by letting only the majority side commit.',
      },
    ],
  },
};
