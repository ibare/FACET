/**
 * sendAndForget 개념 선언.
 *
 * canonical facet 은 `facet:sendAndForget` — `192.0.2.10:50000` 이 `198.51.100.20:5004` 로 데이터그램 d1 ~ d6 을 틱마다
 * 하나씩 보낸다. 보낸 자리는 곧 비고(사본 없음), d3 은 길에서 떨어지고, 지연 1 인 d5 가 지연 3 인 d4 를 앞지른다.
 * 앱은 d1 · d2 · d5 · d4 · d6 을 닿는 대로 받는다. 돌아오는 길로는 아무것도 오지 않는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `tcpHandshake`(완제품)는 TCP 와 UDP 를 한 판에서 견준다. 이쪽은 UDP 하나만 두고 "잃거나 뒤바뀌면 누가 무엇을
 * 하는가 — 아무도 하지 않는다" 를 쥔다. 그래서 definition 은 keeps no copy · receives nothing back · never replaced 를
 * 독점하고, TCP · 비용 · 늦음과 견주는 말은 쓰지 않는다.
 *
 * 전제 (설명 글 `sendAndForget.md`): 틱은 모형의 시각. 지연과 사라지는 데이터그램은 예로 정한 값. 주소는 문서용 대역.
 * 같은 틱에 닿음과 떠남이 겹치면 닿음을 먼저 센다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const sendAndForgetConcept: FacetConceptSource = {
  id: 'sendAndForget',
  label: 'UDP Send and Forget',
  canonicalFacet: 'facet:sendAndForget',

  surface: {
    definition:
      'A UDP sender transmits each datagram once, keeps no copy and receives nothing back, so a lost datagram is never replaced and one that is overtaken reaches the application out of order.',
    exemplarKeywords: [
      'UDP datagram',
      'connectionless',
      'fire and forget',
      'best-effort delivery',
      'no acknowledgment',
      'no retransmission',
      'datagram loss',
      'out-of-order datagrams',
      'application must handle loss',
      'unreliable delivery',
    ],
  },

  briefing: {
    observable: [
      'The sender row holds d1 to d6. From tick 1 one leaves per tick and its slot empties at once — "Sent: d1 (no copy kept)" — while "Waiting at the sender" counts down.',
      'd3 leaves as "Sent: d3 (lost on the way)" and falls off the path, marked "lost"; its place stays empty to the end.',
      'd4, with delay 3, leaves at tick 4; d5, with delay 1, leaves at tick 5, passes d4 on the path and arrives at tick 6. d4 arrives at tick 7 and the caption reads "The app takes: d4 (behind d5)".',
      'd6 arrives at tick 8 and the run ends. The receiving app took d1, d2, d5, d4, d6 in that order, and the tally reads "Sent: 6 · Reached the app: 5 · Sent again: 0". Nothing ever travels back to the sender.',
      'Ticks are model time, one step per tick. The delays and the lost datagram are fixed example values, and the addresses `192.0.2.10:50000` and `198.51.100.20:5004` are documentation ranges. When an arrival and a departure fall on the same tick, the arrival is counted first. The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'The screen plays the eight ticks by itself and stops after d6 arrives.',
        'A Replay button and a playback strip sit below it. The moment worth dragging back to is tick 6, when d5 has overtaken d4 and reached the app first while d3 is already gone.',
        'The datagrams, delays and loss are fixed, so the arrival order and the final tally can be quoted exactly.',
      ],
    },

    useWhen: [
      'The reader expects the network or the protocol to notice a missing datagram and send it again. The empty return path and "Sent again: 0" show that nothing does.',
      'The article states that an application running over UDP must detect loss and reordering itself, and needs a concrete run where both happen and neither is corrected.',
    ],

    avoidWhen: [
      'The article is about how TCP recovers lost or reordered data. No acknowledgment or resending appears.',
      'The subject is a protocol built on UDP that adds its own retries or ordering, such as QUIC or DNS over UDP with timeouts.',
      'The article is about multicast or broadcast delivery. There is one sender and one receiver.',
    ],

    contrastWith: [
      {
        concept: 'tcpHandshake',
        note: 'Sending without copies or acknowledgments is UDP described on its own terms. Setting it beside TCP turns the question into what that saving is worth against the time and packets reliability costs.',
      },
      {
        concept: 'sequenceNumber',
        note: 'Numbering and acknowledging bytes is exactly what lets a sender learn that a gap exists. Without it, a gap is known, if at all, only to the receiving application.',
      },
      {
        concept: 'portDemultiplex',
        note: 'Choosing the receiving application by port is something UDP does do. What it leaves out is any report back to the sender about whether a datagram arrived.',
      },
    ],
  },
};
