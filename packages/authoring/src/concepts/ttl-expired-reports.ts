/**
 * ttlExpiredReports 개념 선언.
 *
 * canonical facet 은 `facet:ttlExpiredReports` — `10.0.0.5` 가 `192.0.2.77` 로 TTL 1 · 2 · 3 · 4 탐침을 차례로 보낸다.
 * 앞의 셋은 R1 · R2 · R3 에서 수명이 다해 그 라우터가 ICMP type 11(시간 초과)을 제 주소로 돌려보내고, TTL 4 는
 * 목적지에 닿아 type 3 code 3(포트 닿을 수 없음)이 와서 멈춘다. 걸음 다섯, 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * icmp 토픽이 `ipRouting` 에 합쳐졌다. 완제품 `ipRouting` 은 TTL 이 줄다 0 에서 버려지는 것까지 보이지만 보낸
 * 쪽으로 가는 알림은 그리지 않는다. 형제 `echoAndReply` 는 에코 짝 맞추기다. 이쪽은 **버리면서 알리는 것과 그
 * 알림으로 길을 캐는 traceroute** 하나 — definition 은 decrements · discards at zero · Time Exceeded · own address ·
 * probes TTL 1, 2, 3 을 쥐고, echo · RTT · loss 를 쓰지 않는다.
 *
 * 전제: TTL 마다 탐침 하나(실제는 셋) · 왕복 시간 없음. 알리는 주소는 들어온 쪽 인터페이스. 포트 33434 부터는
 * 관례값. 모든 라우터가 답한다. 주소는 사설 · 문서용 대역.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const ttlExpiredReportsConcept: FacetConceptSource = {
  id: 'ttlExpiredReports',
  label: 'TTL Expiry and Traceroute (ICMP Time Exceeded)',
  canonicalFacet: 'facet:ttlExpiredReports',

  surface: {
    definition:
      'Each router decrements a packet\'s TTL and discards it at zero, sending an ICMP Time Exceeded message from its own address; traceroute sends probes with TTL 1, 2, 3 to learn each router along the path.',
    exemplarKeywords: [
      'traceroute',
      'tracert',
      'ICMP time exceeded',
      'type 11',
      'TTL expired in transit',
      'hop limit',
      'discover routers on a path',
      'port unreachable type 3',
      'why traceroute shows asterisks',
    ],
  },

  briefing: {
    observable: [
      'A path runs Sender `10.0.0.5` → R1 → R2 → R3 → Destination `192.0.2.77`. The opening caption: "Probes go out with TTL 1 first, then one more each time."',
      'The TTL 1 probe (port 33434) dies at R1: "Probe TTL 1: its life runs out at R1 and it is dropped. · Answer back: Time Exceeded · 10.0.0.1", and a return tagged "type 11 code 0" carries R1\'s address back to the sender.',
      'TTL 2 (port 33435) survives R1 with 1 left and dies at R2, which answers from `172.16.8.1`; TTL 3 (port 33436) reaches R3, which answers from `198.51.100.1`. Each probe gets one router further.',
      'TTL 4 (port 33437) passes R1–R3 at 3, 2, 1 and reaches the destination with TTL 1 left, since the destination does not forward. It answers "type 3 code 3" Port Unreachable, and "The destination answered, so probing stops."',
      'The end reads "Probes sent: 4 · routers that sent Time Exceeded: 3"; the discovered path is `10.0.0.1`, `172.16.8.1`, `198.51.100.1`, `192.0.2.77`.',
      'One probe per TTL (real traceroute sends three) and no round-trip times. Each router answers from the interface the probe came in on. Ports from 33434 follow traceroute convention; all routers answer here, though some real routers stay silent and show as `*`. Addresses are from private and documentation ranges.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one probe per step, and stops once the destination answers.',
        'A Replay button and a playback strip sit below it. Dragging back to the TTL 4 probe holds the moment the answer changes from Time Exceeded to Port Unreachable.',
        'Addresses, ports and codes are fixed, so each probe and reply can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains how traceroute works and needs probes of rising TTL each drawing a Time Exceeded reply from one router further along.',
      'A reader asks what happens to a packet whose TTL runs out, and the article wants the discard paired with the report sent back to the source.',
    ],

    avoidWhen: [
      'The article is about ping, round-trip time or packet loss. Only TTL expiry reports appear.',
      'The subject is routing loops or how TTL prevents them. The path here is straight and loop-free.',
      'The point is IPv6 hop limit specifics or ICMP rate limiting. Neither is shown.',
    ],

    contrastWith: [
      {
        concept: 'echoAndReply',
        note: 'Ping asks the destination a question and pairs the answers; traceroute provokes errors from routers on the way and reads their addresses.',
      },
      {
        concept: 'ipRouting',
        note: 'TTL decreasing per hop is part of forwarding; turning each expiry into a report is what exposes the otherwise invisible path.',
      },
      {
        concept: 'hopByHop',
        note: 'Hop-by-hop delivery means each router acts alone; the TTL counter is the one field every hop changes, and its expiry is what makes a single hop answer.',
      },
    ],
  },
};
