/**
 * agreeOnOneValue 개념 선언.
 *
 * canonical facet 은 `facet:agreeOnOneValue` — 받는 쪽 다섯(`n1`..`n5`, 과반 3)과 제안자 둘. P1(번호 1 · 값 5)의 5 가
 * `n1` `n2` `n3` 에 받아들여져 걸음 3 에 정해진다. 뒤에 온 P2(번호 2 · 값 8)는 `n3` `n4` `n5` 에 무엇을 받아들였는지
 * 묻고, 겹친 자리 `n3` 이 돌려준 5 를 제 값 대신 나른다. 8 은 끝까지 어디에도 놓이지 않는다. 스스로 재생하고 멈춘다(걸음 열하나).
 *
 * ── 묶음 안에서의 자리
 *
 * 토픽 판정에서 합의(consensus) 완제품이 버려져 origin 을 `consistencyModel` 로 옮겼다 — 합의는 **정한다**,
 * 가십은 모일 뿐이다. 이쪽의 주장은 하나 — **한번 정해진 값은 바뀌지 않고, 그것을 지키는 것은 두 과반이 겹친 한 자리**다.
 * 이웃 분야 `paxos`(databases)가 "두 제안자의 메시지가 어떻게 엇갈려도 하나만 정해진다" 를, `proposeAndPromise` 가
 * 번호 약속을, `majorityDecides` 가 과반에서 커밋하는 까닭을 쥐고 있으므로, definition 은 decided · never changes ·
 * overlap 쪽 낱말을 독점하고 interleave · promise · prepare 를 쓰지 않는다.
 *
 * 전제 (화면 각주 없음 — 설명 글 `agreeOnOneValue.md`):
 *  - 한 번 정하는 합의(Paxos 의 한 칸)를 줄인 모형이다. 번호 약속 · 리더 뽑기 · 로그 여러 칸은 그리지 않는다.
 *  - 서버 죽음 · 메시지 잃음이 없다. 걸음의 차례는 예로 정한 것이지 시각이 아니다.
 *  - 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const agreeOnOneValueConcept: FacetConceptSource = {
  id: 'agreeOnOneValue',
  label: 'Consensus: A Decided Value Never Changes (Quorum Overlap)',
  canonicalFacet: 'facet:agreeOnOneValue',

  surface: {
    definition:
      'Once a majority of acceptors hold a value it is decided and stays fixed, because any later majority overlaps that one in at least one acceptor, which reports the value to the next proposer.',
    exemplarKeywords: [
      'distributed consensus',
      'agreement on a single value',
      'quorum intersection',
      'any two majorities overlap',
      'safety property of consensus',
      'chosen value is immutable',
      'single-decree Paxos',
      'acceptors and proposers',
      'why consensus needs a majority quorum',
      'two proposers different values',
    ],
  },

  briefing: {
    observable: [
      'Five boxes under "Acceptors · majority: 3" start empty (–). Two proposers sit beside them: "Proposer P1 · ballot 1 · carries 5" and "Proposer P2 · ballot 2 · carries 8". A row "Decided value at each step" has one cell per step, 0 to 10.',
      'P1 sends 5 to `n1`, `n2`, `n3` in turn ("n1 accepts ballot 1, value 5. · Holding 5: 1/5"). When `n3` accepts at step 3 the count reaches 3/5 and "Decided value: 5" appears; from that step on every cell in the decided row reads 5.',
      'P2 does not send its 8 at once. It first asks `n3`, `n4`, `n5` "what have you accepted?"; an "Answers" panel fills with `n3` → 5 · ballot 1, `n4` → –, `n5` → –.',
      'At step 7 `n3` is marked "overlap" and P2\'s value changes: "P2 carries 5 instead of its own 8. · Highest ballot among the answers: 1, from n3". The 8 stays visible beside P2, set aside.',
      'P2 then sends 5 with ballot 2 to `n3`, `n4`, `n5`. At `n3` only the ballot changes ("n3 accepts ballot 2, value 5 — before: ballot 1, value 5."), and "Holding 8: 0/5" stays at zero to the end.',
      'The run ends after eleven steps counting the start with all five acceptors holding 5 (`n1`, `n2` at ballot 1; `n3`, `n4`, `n5` at ballot 2) and exactly one decided value throughout.',
      'This is a reduced model of a single consensus decision, one slot of Paxos: proposers do not collect promises that block older ballots, there is no leader election and no multi-entry log, and no node fails or loses a message. Each step is one message arriving, in an order chosen for the example rather than a timeline. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays the eleven steps by itself and stops after `n5` accepts.',
        'A Replay button and a playback strip sit below it. Dragging back to step 7 holds the moment P2\'s 8 is replaced by 5 while `n3` is marked as the overlap.',
        'The proposers, ballots and values are fixed, so an article can quote each caption and count exactly.',
      ],
    },

    useWhen: [
      'The article must justify why consensus is safe — why a second proposer arriving later cannot overturn a value already chosen — and wants the one acceptor shared by both majorities to be the reason on display.',
      'A reader asks why a majority, rather than any fixed group, is used: the point to land is that any two majorities of five share a member, so the earlier decision is always heard.',
    ],

    avoidWhen: [
      'The subject is leader election, log replication or Raft terms. Only one value is decided and there is no leader.',
      'The article is about the prepare/promise phase, how stale ballots are rejected, or liveness with dueling proposers. Neither appears here.',
      'The topic is failures, partitions or message loss. Every message arrives and no acceptor crashes.',
    ],

    contrastWith: [
      {
        concept: 'paxos',
        note: 'Both rest on a later proposer adopting a value already accepted. Paxos as a protocol covers competing proposers whose messages interleave in any order; the claim here is narrower — a decided value is final, and the overlap of majorities is what keeps it so.',
      },
      {
        concept: 'proposeAndPromise',
        note: 'Promises stop an older proposal from completing after a newer one has started. The overlap argument protects a value that has already been decided, whatever older proposals do.',
      },
      {
        concept: 'majorityDecides',
        note: 'Committing at a majority explains why the slowest nodes need not be waited for. Overlapping majorities explain why a decision made that way can never be contradicted.',
      },
      {
        concept: 'consistencyModel',
        note: 'Consensus settles on a value and never revises it. Gossip settles on nothing; copies simply come together over time, and reads can be stale while they do.',
      },
      {
        concept: 'eventuallyAgrees',
        note: 'Replicas under last-writer-wins can each hold a different value and later overwrite each other. Under consensus no value is overwritten once it is decided.',
      },
    ],
  },
};
