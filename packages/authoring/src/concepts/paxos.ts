/**
 * paxos 개념 선언.
 *
 * canonical facet 은 `facet:paxos` — 수락자 `A1` `A2` `A3`, 제안자 `P1`(번호 1 · 값 7, `A1` `A2` 에 묻는다)과 `P2`(번호 2 · 값 9).
 * 메시지 여덟(prepare 넷 · accept 넷)이 한 걸음에 하나씩 닿는다. 손잡이 둘 — 앞선 P1 accept(0 · 1 · 2, 처음 1: `P2` 의 prepare
 * 쌍이 `P1` accept 둘 앞 · 가운데 · 뒤에 끼어든다) · P2 가 묻는 곳(`A2·A3` / `A1·A2`, 처음 `A1·A2`). 여섯 차례에서 정해진 값은
 * 9 또는 7 로, 튕긴 accept 는 0 ~ 2 로 옮겨 가지만 정해진 값의 수는 늘 1. 기본 판은 `P2` 가 `A1` 에서 (1, 7) 을 받아 제 값 9
 * 대신 7 을 이어받는다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 하나)
 *
 * 조각 `proposeAndPromise` 는 한 가지 차례에서 **약속이 옛 번호의 accept 를 막는** 장면이다(이어받기는 그리지 않는다). 이쪽은
 * **차례를 손잡이로 옮겨도 값이 하나로 정해지고, 그것은 이어받기 덕분**이라는 것을 쥔다. 그래서 definition 은 however ·
 * interleave · exactly one value · adopts the highest-numbered value 를 쥐고, 조각이 독점한 phase one · rejects any accept
 * carrying a smaller number · blocked 를 쓰지 않는다.
 *
 * 전제 (설명 글 `paxos.md`): 수락자 셋 · 제안자 둘로 줄였고 닿는 차례는 손잡이가 정한다. 학습자 · 거절 뒤 재시도 · 번호 다시
 * 고르기 · 메시지 유실과 지연은 덜었다. 정해짐은 수락자 상태를 한눈에 보고 센다. 코드 패널은 IR 하나를 여섯 언어로 옮긴 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const paxosConcept: FacetConceptSource = {
  id: 'paxos',
  label: 'Paxos (One Value Chosen Under Any Message Order)',
  canonicalFacet: 'facet:paxos',

  surface: {
    definition:
      'In Paxos, however the prepare and accept messages of two competing proposers interleave, exactly one value is chosen, because a later proposer adopts the highest-numbered value already accepted instead of its own.',
    exemplarKeywords: [
      'Paxos consensus',
      'Basic Paxos',
      'single-decree Paxos',
      'Lamport Paxos',
      'competing proposers',
      'dueling proposers',
      'safety of consensus',
      'value adoption in Paxos',
      'agreement on a single value',
      'Paxos made simple',
    ],
  },

  briefing: {
    observable: [
      'An "Arrival order" strip across the top lists the eight messages in the order they will land. Below are the Proposers P1 (number 1, value 7) and P2 (number 2, value 9) and the Acceptors A1, A2, A3, each showing what it has promised and accepted; a majority of 2 is marked.',
      'The first caption states the setting: "P1 accepts before P2 prepares: 1 · P2 asks: A1·A2". One message flies per step; a prepare returns as a promise, and when the acceptor has already accepted a pair, that pair rides back and sticks to the proposer\'s "carried" slot.',
      'Default round, ten steps: "P1 prepare(1) → A1 · promised 1 · carries nothing"; "P1 prepare(1) → A2 · promises: 2 / 2 · sends its own value 7"; P1 accept(1, 7) → A1 accepted; "P2 prepare(2) → A1 · promised 2 · carries (1, 7)"; "P2 prepare(2) → A2 · promises: 2 / 2 · sends 7, inherited from A1".',
      'At that inheriting step the value chip moves into P2\'s send slot and 9 becomes 7. Chips keep the colour of the proposer that first introduced the value, so P2 is seen carrying P1\'s colour.',
      'Then "P1 accept(1, 7) → A2 · rejected (promised 2)" bounces off; P2 accept(2, 7) is accepted by A1 and then by A2, "same pair on 2 of 2 needed · chosen: 7". The round ends "Chosen value: 7 (from step 8) · rejected accepts: 1 · values chosen: 1".',
      'Across the six orders: early 0 with A2·A3 or A1·A2 and early 1 with A2·A3 choose 9 at step 8 without inheriting; early 1 with A1·A2 chooses 7 by inheriting; early 2 chooses 7 already at step 4, and P2 inherits it. Rejected accepts range 0 to 2, and "Values chosen" is 1 in every case.',
      'Reduced to three acceptors and two proposers; the arrival order is set by the handles. Learners, retries after rejection, choosing a new number and message loss are left out, and "chosen" is judged by looking at all acceptors at once. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "P1 accepts first" 0, 1 or 2 (starting at 1) — how many of P1\'s accepts land before P2\'s prepares — and "P2 asks", A2·A3 or A1·A2 (starting A1·A2). On a change, P2\'s two prepares slide to a new place in the arrival strip and accepted pairs are drawn back before the new order plays.',
        'The move that makes the idea land is trying all six orders: the chosen value switches between 9 and 7 and the rejected count moves, while "Values chosen" never leaves 1; the orders where P2 asks A1 show why, as the carried (1, 7) replaces 9.',
        'Readouts under the controls: Rejected accepts, Values chosen and Inherited values.',
        'The code panel, labelled "Paxos in code", starts empty with a "+ Add language" button. It shows `runPaxos`, `preparePair`, `accept` and `chosen`, and carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why Paxos is safe — why two proposers racing cannot get two different values chosen — and needs the adoption of an already-accepted value shown across several message orders, not just one lucky run.',
      'A reader is puzzled that a proposer in Paxos may end up sending someone else\'s value; the default order, where P2 abandons 9 for the 7 it learned from A1, makes that the centre of the explanation.',
    ],

    avoidWhen: [
      'The article is about Multi-Paxos, leader-based log replication or Raft. A single value is decided and there is no log or stable leader.',
      'The subject is liveness, livelock between dueling proposers, or retries with higher numbers. Every order finishes in eight messages with no retry.',
      'The point is Byzantine agreement or message loss. Every message arrives and every participant follows the rules.',
    ],

    contrastWith: [
      {
        concept: 'proposeAndPromise',
        note: 'A promise to a higher number blocking an older accept is the first half of safety; carrying already-accepted values back in promises, so a later proposer adopts them, is the second half that keeps one chosen value.',
      },
      {
        concept: 'raft',
        note: 'Both depend on majorities that overlap. Paxos settles one value among concurrent proposers without a designated leader; Raft first elects a leader and then orders a whole log through it.',
      },
    ],
  },
};
