/**
 * sequenceNumber 개념 선언.
 *
 * canonical facet 은 `facet:sequenceNumber` — 바이트 번호 줄(1001 부터) 위로 길이 500 · 500 · 300 · 500 · 200 의 조각
 * 다섯이 1 · 3 · 4 · 2 · 5 차례로 떨어진다. 확인 번호 바늘(다음에 기다리는 바이트)은 빈자리 앞 1501 에 세 번 멈춰
 * 섰다가, 조각 2 가 앉는 순간 2801 로 1300 바이트를 한 번에 건너뛴다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `tcpHandshake`(완제품)는 쥐기 · 기한 · 재전송을 묶은 신뢰 전달 전체를 UDP 와 견준다. 이쪽은 **번호 하나가 무엇을
 * 말하는가** 만 — 바이트를 세고, 다음 기다리는 바이트를 말하며, 빈자리에서 멈췄다가 건너뛴다. 그래서 definition 은
 * next byte expected · stays put · jumps 를 독점하고, 잃음 · 재전송 · 중복 확인은 쓰지 않는다(그 셋째를 읽는 것은
 * 형제 `backOffOnLoss`).
 *
 * 전제 (설명 글 `sequenceNumber.md`): 첫 바이트 1001 · 조각 길이 · 도착 차례는 예로 정한 값. 한 방향만, 잃음 ·
 * 재전송 · 타이머 · SACK 없음. 도착마다 곧바로 확인 하나(지연 확인 없음). 한 걸음 = 조각 하나 닿고 확인이 돌아가기까지.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const sequenceNumberConcept: FacetConceptSource = {
  id: 'sequenceNumber',
  label: 'TCP Sequence Numbers and Cumulative Acknowledgment',
  canonicalFacet: 'facet:sequenceNumber',

  surface: {
    definition:
      'TCP numbers bytes, and the cumulative acknowledgment names the next byte expected: it stays put while segments past a gap are held, then jumps over all their bytes once the gap fills.',
    exemplarKeywords: [
      'sequence number',
      'acknowledgment number',
      'cumulative acknowledgment',
      'next expected byte',
      'byte stream numbering',
      'out-of-order segments',
      'ACK number does not count segments',
      'receiver holds out-of-order data',
      'ack jumps after gap filled',
      'TCP segment seq field',
    ],
  },

  briefing: {
    observable: [
      'A byte line starts at 1001, and each segment\'s width on it is its byte count: segment 1 covers 1001–1500, segment 2 1501–2000, segment 3 2001–2300, segment 4 2301–2800, segment 5 2801–3000. Below the line a needle reads "Next expected byte: 1001".',
      'Segments arrive in the order 1, 3, 4, 2, 5, each dropping onto its place ("Segment 1 arrived, bytes 1001–1500"). After segment 1 the caption reads "Acknowledgment: 1001 → 1501 (bytes moved: 500)" — one segment moves the number by 500, not by 1.',
      'Segments 3 and 4 land past an empty stretch marked "gap" and are marked "held". The needle only trembles in place: the acknowledgment stays 1501 for three arrivals in a row.',
      'When segment 2 lands the gap closes, and the needle slides over the held segments in one move — "Acknowledgment: 1501 → 2801 (bytes moved: 1300)". Segment 5 then takes it to 3001, 2000 bytes received in all.',
      'A stack under the line, "Acknowledgment sent back on each arrival", keeps one bar per arrival: 1501, 1501, 1501, then a long 2801, then 3001 — equal bars and then a step.',
      'The first byte number 1001, the segment lengths and the arrival order are fixed example values; real TCP picks its first number at random. Only one direction is shown, nothing is lost, there is no timer, resending or selective acknowledgment, and every arrival is acknowledged at once. The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'The screen plays the five arrivals by itself, one arrival and its acknowledgment per step, and stops after segment 5.',
        'A Replay button and a playback strip sit below it. The moment worth dragging back to is the arrival of segment 2, where the needle leaves 1501 and clears 1300 bytes in one slide.',
        'Lengths, numbers and arrival order are fixed, so every range and acknowledgment can be quoted exactly.',
      ],
    },

    useWhen: [
      'The reader thinks an acknowledgment counts segments, or confirms the last segment received. The needle moving 500 for one segment and 1300 for another arrival corrects both at once.',
      'The article explains how segments that arrive early are kept by the receiver but not acknowledged until the bytes before them are in.',
    ],

    avoidWhen: [
      'The subject is selective acknowledgment (SACK), which reports blocks past a gap. Only the single cumulative number is shown.',
      'The article is about recovering from loss — timers, retransmission, or reading repeated acknowledgments as a signal. Nothing is lost here; segment 2 is only late.',
      'The subject is sequence-number wraparound or guessing sequence numbers in an attack.',
    ],

    contrastWith: [
      {
        concept: 'threeWaySync',
        note: 'The handshake only agrees on where the numbering starts. What the numbers then say about received bytes, and how one number acknowledges everything before it, is this claim.',
      },
      {
        concept: 'tcpHandshake',
        note: 'Cumulative acknowledgment is one mechanism. Reliable delivery combines it with holding, timeouts and resending, and is weighed by the time and packets it costs.',
      },
      {
        concept: 'backOffOnLoss',
        note: "A repeated acknowledgment number is just the receiver's honest report that a gap remains. Reading the third repeat as a loss and cutting the sending rate is a sender-side decision built on top of that report.",
      },
    ],
  },
};
