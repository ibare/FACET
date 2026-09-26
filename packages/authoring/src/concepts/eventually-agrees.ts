/**
 * eventuallyAgrees 개념 선언.
 *
 * canonical facet 은 `facet:eventuallyAgrees` — 리더 없는 사본 넷(`n1`..`n4`)이 키 `x` 를 `0` · 도장 0 으로 들고,
 * 쓰기 셋(7 · 4 · 9)이 서로 다른 사본에 떨어지고 주고받기 넷이 도장 큰 쪽으로 둘을 맞춘다. 서로 다른 값의 수가
 * 1 → 2 → 3 → 2 → 3 → 2 → 2 → 1 로 오르내리다 쓰기가 멈춘 뒤 넷이 9 로 모인다. 스스로 재생하고 멈춘다(걸음 여덟).
 *
 * ── 묶음 안에서의 자리
 *
 * `consistencyModel`(완제품)은 쓰기 하나를 가십으로 퍼뜨리며 퍼뜨림 수와 통을 맞바꾼다 — 값이 겨루지 않는다.
 * 이쪽은 **서로 다른 사본이 따로 받은 쓰기가 겨루는 장면**이다. 그래서 definition 은 different replicas accept
 * writes · higher timestamp · writes stop · earlier writes lost 쪽 낱말을 쥐고, fanout · 통 · 버전 번호를 들고
 * 다니는 읽기를 쓰지 않는다.
 *
 * 전제 (화면 각주 없음 — 설명 글 `eventuallyAgrees.md`):
 *  - 시각은 없다. 일어나는 일 일곱의 차례와 누가 누구와 주고받는지는 데이터가 준다(무작위 가십을 흉내 내지 않는다).
 *  - 도장은 데이터가 준다. 도장을 어떻게 얻는지는 다루지 않는다. 같은 도장이면 사본 번호가 큰 쪽이 이기는 규칙을
 *    두었지만 이 데이터에는 없다.
 *  - 마지막 도장이 이긴다(LWW)는 쓰기를 잃는다 — 7 과 4 가 사라진다.
 *  - 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const eventuallyAgreesConcept: FacetConceptSource = {
  id: 'eventuallyAgrees',
  label: 'Eventual Consistency (Last-Writer-Wins Anti-Entropy)',
  canonicalFacet: 'facet:eventuallyAgrees',

  surface: {
    definition:
      'When different replicas accept writes independently their values diverge; pairwise exchanges that keep the higher timestamp bring every replica to the last-written value once writes stop, discarding earlier concurrent writes.',
    exemplarKeywords: [
      'eventual consistency',
      'last-writer-wins',
      'LWW register',
      'anti-entropy',
      'multi-master replication',
      'divergent replicas',
      'lost update under LWW',
      'Cassandra last write wins',
      'Riak',
      'replicas converge when writes stop',
    ],
  },

  briefing: {
    observable: [
      'Four replicas `n1`..`n4` each show `x =` 0 and "stamp 0" ("Replicas: 4. No leader — any replica takes a write."). A panel on the right, "Distinct values", lists each value present and how many replicas hold it.',
      '"A write lands on n1." with `x = 7, stamp 1`, then one lands on `n3` with `x = 4, stamp 2`. Distinct values rise from 1 to 2 to 3.',
      '"n1 ↔ n3 exchange values. The larger stamp wins." Both become `x = 4, stamp 2`, and distinct values fall to 2. The 7 is now gone from every replica.',
      'A write lands on `n4` with `x = 9, stamp 3 — no writes after this`, and distinct values climb back to 3: agreement reached by one exchange is undone by the next write.',
      'Three more exchanges follow — `n2` ↔ `n4`, `n1` ↔ `n2`, `n3` ↔ `n4` — and each spreads 9 to one more replica ("holding it: 2 of 4", "3 of 4", "4 of 4"). Every exchange changes at least one side.',
      'The run ends after eight steps counting the start with all four at `x = 9, stamp 3` and "Distinct values" 1. The writes 7 and 4 were accepted by replicas but are on none of them at the end.',
      'There is no clock here, only the order of seven given events, and who exchanges with whom is fixed by the data rather than chosen at random as gossip would. The stamps are given too; how they would be produced is not shown. Equal stamps would be settled by the higher replica number, a rule the data never exercises. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays the eight steps by itself and stops once all four replicas hold 9.',
        'A Replay button and a playback strip sit below it. Dragging between step 3 and step 4 shows the count of distinct values dropping and then rising again while writes are still arriving.',
        'The events, values and stamps are fixed, so an article can quote each caption and the replica states exactly.',
      ],
    },

    useWhen: [
      'The article defines eventual consistency precisely — convergence is promised only after writes stop — and needs a case where replicas agree, disagree again on a new write, and then settle.',
      'A reader must see that last-writer-wins convergence silently drops writes: two values that replicas accepted are gone from every copy once they agree.',
    ],

    avoidWhen: [
      'The subject is leader-follower replication or replication lag. Here writes land on different replicas and replicas reconcile among themselves.',
      'The article is about CRDTs, version vectors or keeping both conflicting values. Only a single-winner timestamp rule is applied.',
      'The topic is how gossip picks partners or how fast it spreads. The exchanges here are a fixed list.',
    ],

    contrastWith: [
      {
        concept: 'consistencyModel',
        note: 'With a single write, convergence is only a question of spreading speed and message cost. With independent writes it also needs a rule for which value survives, and that rule decides what is lost.',
      },
      {
        concept: 'agreeOnOneValue',
        note: 'Consensus fixes one value before anyone treats it as final and never replaces it. Last-writer-wins lets replicas hold different values and then overwrites the losers after the fact.',
      },
      {
        concept: 'happensBefore',
        note: 'Last-writer-wins trusts a total order of stamps. Causal ordering shows that some writes have no before-or-after at all, which is exactly the case where one of them is thrown away.',
      },
      {
        concept: 'readYourWrite',
        note: 'Convergence describes the replicas once writes stop. A session guarantee describes what one client may read while they are still converging.',
      },
    ],
  },
};
