/**
 * forwardingTable 개념 선언.
 *
 * canonical facet 은 `facet:forwardingTable` — 라우터 하나, 문 넷(eth0–eth3), 표 네 줄(두 직접 붙은 망 · `172.16.0.0/16`
 * 다음 라우터 `10.0.0.2` · 기본 줄 `0.0.0.0/0` 다음 라우터 `10.0.1.1`). `eth0` 으로 들어온 패킷 넷이 걸음마다 제
 * 줄을 찾아 서로 다른 문으로 흩어진다. 걸음 다섯, 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 형제 `longestPrefixMatch` 는 여러 줄이 동시에 맞을 때를 맡는다 — 이쪽의 표는 기본 줄을 뺀 셋이 겹치지 않게
 * 골라 그 규칙이 일어나지 않는다. 완제품 `ipRouting` 은 여러 라우터의 여정이다. 이쪽은 **한 라우터에서 표의 한 줄이
 * 나갈 문과 넘길 곳을 정하는 것** — definition 은 outgoing interface · next hop · directly connected · default route
 * 를 쥐고, longest · bits · TTL 을 쓰지 않는다.
 *
 * 전제: 주소는 문서용 · 사설 대역. 들어온 문은 판정에 쓰지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const forwardingTableConcept: FacetConceptSource = {
  id: 'forwardingTable',
  label: 'Router Forwarding Table (Interface and Next Hop)',
  canonicalFacet: 'facet:forwardingTable',

  surface: {
    definition:
      'A router\'s forwarding table maps destination networks to an outgoing interface and a next hop, delivering directly on an attached network or handing off to another router, with a default route catching everything else.',
    exemplarKeywords: [
      'forwarding table',
      'routing table entries',
      'next hop',
      'outgoing interface',
      'directly connected network',
      'default gateway',
      'default route 0.0.0.0/0',
      'route print',
      'ip route show',
    ],
  },

  briefing: {
    observable: [
      'Four packets from `192.168.10.5` queue at `eth0` ("Packets waiting at eth0: 4."). In the middle is the router with its table: `192.168.10.0/24` direct eth0 · `192.168.20.0/24` direct eth1 · `172.16.0.0/16` via `10.0.0.2` eth2 · `0.0.0.0/0` via `10.0.1.1` eth3. Below, a branch runs down from each exit to what lies beyond it.',
      'Each step the front packet enters, stops beside the row that takes it, then leaves through that row\'s exit and stacks on its branch.',
      'Packet 1 to `192.168.20.14`: "Destination 192.168.20.14 fits row 192.168.20.0/24. · Out through eth1, straight to 192.168.20.14 itself." Packet 2 to `172.16.4.9`: "Out through eth2, handed to router 10.0.0.2."',
      'Packet 3 to `198.51.100.23`: "No row fits 198.51.100.23; the default row 0.0.0.0/0 takes it. · Out through eth3, handed to router 10.0.1.1." Packet 4 to `192.168.20.99` fits the same row as packet 1 and follows it out eth1.',
      'The end shows two packets on eth1 and one each on eth2 and eth3; three exits used and none back out eth0. The table lists networks, not addresses, so four rows sort any number of packets. What happens beyond the next router is not in this table.',
      'Addresses are example values from documentation and private ranges. The three non-default rows were chosen not to overlap, so at most one of them fits any packet, and the incoming interface is not used in the decision.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one packet per step, and stops after the fourth.',
        'A Replay button and a playback strip sit below it. Dragging back to packet 3 holds the moment no network row fits and the default row takes over.',
        'The table and packets are fixed, so each row and exit can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces what a routing table holds and needs packets from one inbound interface fanning out to different exits by destination network.',
      'A reader is unsure what "next hop" versus "directly connected" means, and the article wants one packet delivered to its own address and another handed to a neighbouring router.',
    ],

    avoidWhen: [
      'The article is about choosing among overlapping prefixes. The rows here were picked not to overlap.',
      'The subject is how routes are learned — RIP, OSPF, BGP. The table is given and never changes.',
      'The point is switching by MAC address in a LAN. Decisions here use IP destination networks.',
    ],

    contrastWith: [
      {
        concept: 'longestPrefixMatch',
        note: 'Matching a destination to one network row is the basic lookup; longest prefix match is the rule that settles it when several rows contain the destination.',
      },
      {
        concept: 'ipRouting',
        note: 'One router\'s table decides only the next hop; routing as a whole is that decision repeated by each router along the way.',
      },
      {
        concept: 'hopByHop',
        note: 'A forwarding table is where a single router reads its next hop; hop-by-hop delivery is the principle that no router needs more than that.',
      },
    ],
  },
};
