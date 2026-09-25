/**
 * echoAndReply 개념 선언.
 *
 * canonical facet 은 `facet:echoAndReply` — `10.1.1.5` 가 `192.0.2.8` 에게 식별자 4321 로 에코 요청 넷(seq 1–4)을
 * 1000 ms 간격으로 보낸다. 같은 식별자 · seq 의 답으로 짝을 맞춰 제 시계로 RTT 를 재고(24 · 31 · 27 ms), seq 3 은
 * 기한 2900 ms 까지 답이 없어 잃음. 합계 보냄 4 · 받음 3 · 잃음 25%, 최소 · 평균 · 최대 24 · 27.33 · 31 ms.
 * 걸음 다섯, 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 카탈로그에서 icmp 토픽이 `ipRouting` 완제품에 합쳐졌다. ICMP 의 두 쓰임이 조각 둘로 갈린다 — 이쪽은 **에코 요청 ·
 * 답의 짝 맞추기와 시간 재기**, 형제 `ttlExpiredReports` 는 수명이 다한 라우터가 돌려보내는 오류 알림이다.
 * definition 은 echo request · echo reply · identifier and sequence number · round-trip time · deadline 을 쥐고,
 * TTL · 라우터 · 길 낱말을 쓰지 않는다.
 *
 * 전제: 상대는 받는 즉시 되돌린다(처리 0). 지연 · seq 3 잃음은 예로 정한 값. 시각은 표시값이며 실제 ms 로 흐르지
 * 않는다. 늦은 답 · 중복 답은 다루지 않는다. 주소는 사설 · 문서용 대역.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const echoAndReplyConcept: FacetConceptSource = {
  id: 'echoAndReply',
  label: 'Ping: ICMP Echo Request and Reply',
  canonicalFacet: 'facet:echoAndReply',

  surface: {
    definition:
      'Ping sends ICMP echo requests carrying an identifier and sequence number; the target returns echo replies with the same numbers, letting the sender pair them, time the round trip on its own clock, and count losses after a deadline.',
    exemplarKeywords: [
      'ping',
      'ICMP echo request',
      'ICMP echo reply',
      'type 8 type 0',
      'round-trip time',
      'RTT',
      'packet loss percentage',
      'ping timeout',
      'min/avg/max',
      'is the host alive',
    ],
  },

  briefing: {
    observable: [
      'A Sender `10.1.1.5` and a Target `192.0.2.8`, with four rows seq 1–4 and a clock "now … ms". The opening caption reads "To 192.0.2.8: echo requests with id 4321, one every 1000 ms · Deadline: 900 ms after each send".',
      'Each request travels to the target, turns there ("turned at 11 ms") and comes back as a reply with the same id and seq. The row fills with send and receive times and the round trip: "seq 1: sent at 0 ms; the reply with the same id and seq arrived at 24 ms · Round trip: 24 − 0 = 24 ms". Seq 2 gives 31 ms, seq 4 gives 27 ms.',
      'Seq 3 is sent at 2000 ms and vanishes on the way; its row shows "deadline 2900 ms · no reply": "Counted as lost — the sender cannot tell whether the request or the reply went missing".',
      'Both times in each round trip are read on the sender\'s own clock; the target\'s clock is never used.',
      'The summary reads "Sent: 4 · received: 3 · lost: 25% · Over the replies — min 24 · avg 27.33 · max 31 ms", with the min and max rows marked. Statistics are taken over the replies only.',
      'The target replies instantly (processing time 0). The one-way delays and the loss of seq 3 are example values; times are displayed values and the animation does not run in real milliseconds. Late or duplicate replies are not modelled.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one echo per step, and stops on the summary.',
        'A Replay button and a playback strip sit below it. Dragging back to seq 3 holds the moment the deadline passes with an empty row.',
        'Times and addresses are fixed, so every RTT and the 25% loss can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains what ping actually measures and needs requests and replies paired by sequence number with round-trip times computed on the sender\'s clock.',
      'A reader asks why ping reports loss without knowing which direction failed, and the article wants a request that times out with no way to tell.',
    ],

    avoidWhen: [
      'The article is about traceroute or discovering routers on a path. Only two hosts appear here.',
      'The subject is TCP retransmission timeouts or RTT estimation for congestion control. These are ICMP echoes with a fixed deadline.',
      'The point is network latency components such as propagation or queueing delay. The delays are given, not explained.',
    ],

    contrastWith: [
      {
        concept: 'ttlExpiredReports',
        note: 'An echo reply is the target\'s own answer to a query; Time Exceeded is an error report from a router that discarded a packet. Both are ICMP, but one is solicited and the other is a side effect.',
      },
      {
        concept: 'ipRouting',
        note: 'Ping checks reachability end to end without saying how the packet travelled; routing is the per-router forwarding that makes that path.',
      },
    ],
  },
};
