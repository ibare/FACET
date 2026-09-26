/**
 * proposeAndPromise 개념 선언.
 *
 * canonical facet 은 `facet:proposeAndPromise` — 수락자 `A1` `A2` `A3`, 제안자 `P1`(번호 1 · 값 7)과 `P2`(번호 2 · 값 9).
 * 닿는 차례 여덟이 정해져 있다: `P1` prepare → `A1` · `A2`(과반) · `P2` prepare → `A2`(약속 1 → 2) · `A3`(과반) · `P1` accept →
 * `A1` 받아들임 · `A2` 거절(약속 2) · `P2` accept → `A2` · `A3` 받아들여 9 가 정해진다. `A1` 에 남은 (1, 7) 은 1 / 3 이라
 * 정해진 값이 아니다. 열 걸음, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `paxos` 는 닿는 차례를 손잡이로 옮겨도 값이 하나로 정해지는 것과, 늦은 제안자의 **이어받기**를 쥔다. 이쪽은
 * **약속이 더 작은 번호의 accept 를 막는다** 한 장면이고 이어받기는 그리지 않는다. 그래서 definition 은 phase one · promises ·
 * rejects any accept carrying a smaller number · blocked 를 독점하고, 차례 바꾸기 · 이어받기 · 정해진 값의 수는 쓰지 않는다.
 *
 * 전제 (설명 글 `proposeAndPromise.md`): 닿는 메시지 여덟만 골라 차례를 정했다. 실제로는 약속을 받은 제안자가 모든 수락자에게
 * accept 를 보내고 메시지가 사라지거나 늦기도 한다. 거절 응답이 제안자에게 돌아가는 길과 새 번호로 다시 시도하는 일은 덜었다.
 * 코드 패널은 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const proposeAndPromiseConcept: FacetConceptSource = {
  id: 'proposeAndPromise',
  label: 'Paxos Prepare and Promise (A Higher Number Blocks an Older Proposal)',
  canonicalFacet: 'facet:proposeAndPromise',

  surface: {
    definition:
      'In the first phase of Paxos an acceptor promises a proposal number and from then on rejects any accept carrying a smaller number, so an older proposal that had gathered promises is blocked from reaching a majority.',
    exemplarKeywords: [
      'Paxos prepare phase',
      'promise message',
      'proposal number',
      'ballot number',
      'acceptor rejects lower-numbered proposal',
      'phase 1a phase 1b',
      'prepare and accept',
      'preempted proposal',
    ],
  },

  briefing: {
    observable: [
      'Acceptors A1, A2 and A3 each show a Promised number and an Accepted pair, all "—" at first. Proposers P1 (number 1, Value 7) and P2 (number 2, Value 9) each track Promises and Accepts. "No acceptor has promised anything yet."',
      '"A1 promises number 1 to P1." and "A2 promises number 1 to P1." — "Promises for P1: 2 / 3, a majority. Value to send: 7, its own."',
      '"A2 raises its promise: number 1 → number 2 (P2)." From this moment A2 will no longer accept number 1. A3 promises number 2 as well: "Promises for P2: 2 / 3, a majority. Value to send: 9, its own."',
      'P1 now sends (1, 7): "A1 accepts (1, 7)." but "A2 refuses (1, 7): it already promised number 2." — the accept bounces off, and P1 stops at "Accepts for P1: 1 / 3".',
      '"A2 accepts (2, 9)." and "A3 accepts (2, 9)." — "Accepts for P2: 2 / 3, a majority. Chosen value: 9." The end: "Chosen (2, 9): accepted by 2 / 3." and "(1, 7) left on A1: accepted by 1 / 3. Majority: 2." Ten steps in all.',
      'The eight arriving messages and their order are fixed. In real Paxos a proposer sends accept to all acceptors and messages can be lost or delayed; the rejection reply travelling back to the proposer and a retry with a new number are left out. Had P2 gathered its promise from A1, the pair (1, 7) would have come back with it and changed what P2 sends — that branch is not drawn. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the ten steps by itself and stops once 9 is chosen.',
        'A Replay button and a playback strip sit below it. Holding the step where A2 raises its promise to 2, then the step where A2 refuses (1, 7), shows the cause and its effect two moves apart.',
      ],
    },

    useWhen: [
      'The article introduces the two phases of Paxos and needs to show what a promise actually commits an acceptor to: refusing every later accept with a smaller number.',
      'A reader asks how Paxos stops an older proposal that already had a majority of promises; the accept of (1, 7) being refused at A2 and stalling at 1 of 3 shows exactly that.',
    ],

    avoidWhen: [
      'The article is about why the chosen value stays unique under every interleaving, or about a proposer adopting a previously accepted value. Only one fixed order is shown and no value is adopted.',
      'The subject is Multi-Paxos, leaders or replicated logs. One value is decided once.',
      'The point is retries, livelock or message loss. No proposal is retried and every message arrives.',
    ],

    contrastWith: [
      {
        concept: 'paxos',
        note: 'Blocking lower-numbered accepts keeps an old proposal from finishing; uniqueness of the chosen value also needs promises to carry back already-accepted pairs so that a later proposer adopts them.',
      },
      {
        concept: 'splitBrain',
        note: 'A higher number overriding an older one is the same fencing idea as a higher Raft term making an old leader step down: whoever has seen the larger number refuses the smaller.',
      },
    ],
  },
};
