/**
 * askWhoHas 개념 선언.
 *
 * canonical facet 은 `facet:askWhoHas` — 한 세그먼트의 호스트 다섯 가운데 `192.168.10.5` 가 `192.168.10.23` 의 MAC 을
 * 찾는다. 요청이 방송 MAC `ff:ff:ff:ff:ff:ff` 로 넷에게 동시에 닿고, 셋은 제 IP 가 아니라 버리고, 주인 하나만 묻는
 * 이의 MAC 으로 곧장 답한다. 묻는 이는 `192.168.10.23 → 00:0c:29:8f:31:6b` 를 얻는다. 선 위 프레임 둘.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `arp` 는 여러 링크 · 여러 보냄에 걸쳐 물음을 세고, 이웃 `arpCache` 는 답이 표에 적혀 뒤 물음을 없애는 것을,
 * `macIsLocal` 은 링크마다 MAC 쌍이 바뀌는 것을 말한다. 이쪽의 주장은 **물음은 모두에게 퍼지고 답은 주인 하나에서
 * 묻는 이 하나에게만 돌아온다** 하나다. 그래서 definition 은 broadcast · everyone on the segment · discards ·
 * owner replies directly 쪽 낱말을 쥐고, 표 · 캐시 · 라우터 · 게이트웨이 · 셈(몇 번)은 쓰지 않는다.
 *
 * 전제 (설명 글 `askWhoHas.md` 가 밝힌 것): 전달은 한 걸음 안에 끝난다 · 주인이 묻는 이를 제 표에 적는 일과 구경꾼의
 * 표 고침은 보이지 않는다(이웃 개념의 몫) · 호스트 번호는 가리키려고 붙인 것 · 주소는 사설 대역의 예.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const askWhoHasConcept: FacetConceptSource = {
  id: 'askWhoHas',
  label: 'ARP Request: Ask Everyone, Only the Owner Answers',
  canonicalFacet: 'facet:askWhoHas',

  surface: {
    definition:
      'An ARP request asking who has an IP address is broadcast to the whole segment; every host but the owner discards it, and the owner replies directly to the asker with its MAC.',
    exemplarKeywords: [
      'ARP request and reply',
      'who has 192.168.10.23',
      'broadcast MAC ff:ff:ff:ff:ff:ff',
      'unicast ARP reply',
      'target MAC 00:00:00:00:00:00',
      'ARP opcode 1 and 2',
      'resolve IP to MAC',
      'ARP packet fields',
      'RFC 826',
    ],
  },

  briefing: {
    observable: [
      'Five hosts on one segment, the Asker and Host 1 to Host 4, each with its IP and MAC. Step 0: "The asker knows an IP but not its MAC. Wanted: 192.168.10.23".',
      'Beside them, the request is laid out field by field: an Ethernet header with Dest MAC `ff:ff:ff:ff:ff:ff` and Source MAC `b8:27:eb:4d:19:a2`, then the ARP fields — op 1, Sender MAC and IP, Target MAC `00:00:00:00:00:00` (shown as ?), Target IP `192.168.10.23`.',
      'Step 1: "The broadcast request spreads. Received: 4" — every host except the asker gets it at the same moment.',
      'Step 2: "Each compares the wanted IP with its own. Dropped: 3 · Owner: …" — Hosts 1, 3 and 4 are marked dropped, and Host 2, the owner `192.168.10.23`, is marked mine.',
      'Step 3: "The owner answers straight to the asker’s MAC. Received: 1" — the ARP reply (op 2) is addressed to `b8:27:eb:4d:19:a2`, not broadcast, and only the asker receives it.',
      'Step 4: "Learned: 192.168.10.23 → 00:0c:29:8f:31:6b · Frames on the wire: 2".',
      'Delivery is treated as instant. In practice the owner also records the asker from the request, and hosts that already list the asker refresh that entry; those table updates are not part of this run. Host numbers are only labels, and the addresses are private examples. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, five steps including the start, and stops when the asker holds the MAC.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to step 2 holds the three dropped hosts next to the single owner.',
        'The hosts and addresses are fixed, so every field value can be quoted exactly as it appears.',
      ],
    },

    useWhen: [
      'The reader knows a host needs a MAC address to send on Ethernet and asks how it gets one when it only knows the IP.',
      'An article dissects the ARP packet and wants to show the request going to the broadcast address with an empty target MAC, and the reply coming back addressed to one host.',
    ],

    avoidWhen: [
      'The topic is caching ARP answers or how often ARP runs. One exchange on one segment is shown.',
      'The subject involves routers, gateways or other subnets. All five hosts share one segment.',
      'The article is about ARP spoofing or duplicate address detection. Exactly one host owns the address and it answers truthfully.',
    ],

    contrastWith: [
      {
        concept: 'arpCache',
        note: 'The request-and-reply exchange is how an address is learned; remembering it is a separate step that decides whether the exchange has to happen again for the next frame.',
      },
      {
        concept: 'arp',
        note: 'One exchange on one segment explains the mechanism. Across a routed path, the same exchange repeats on each link and targets the next hop rather than the final destination, which changes how many are needed.',
      },
      {
        concept: 'macIsLocal',
        note: 'Resolving an address answers how a sender learns a neighbour’s MAC. That the MAC is only valid on that one link is why the neighbour it asks for is often a router and not the final host.',
      },
    ],
  },
};
