/**
 * macIsLocal 개념 선언.
 *
 * canonical facet 은 `facet:macIsLocal` — 보내는 호스트(192.168.1.5)에서 라우터 둘을 거쳐 받는 호스트(172.16.5.20)
 * 까지 링크 셋을 지난다. IP 쌍은 끝까지 그대로이고, MAC 쌍은 라우터에 닿을 때마다 남겨지고 다음 링크의 새 쌍이 붙는다.
 * 첫 링크의 받는 이 MAC 은 받는 호스트가 아니라 라우터 1 의 `00:1b:21:3a:40:01`. 링크 3 · MAC 쌍 3 · MAC 주소 6 · IP 쌍 1.
 *
 * ── 묶음 안에서의 자리
 *
 * 합친 토픽 mac 에서 옮겨 완제품 `arp` 아래 든다. 완제품은 링크마다 묻는 수를 세고, 이웃 `askWhoHas` · `arpCache` 는
 * MAC 을 알아내는 방법과 적어 두는 방법을 말한다. 이쪽의 주장은 **프레임의 주소 쌍은 제 링크를 벗어나지 못하고 패킷의
 * 주소 쌍만 끝까지 간다** 하나다 — 어떻게 알았는지는 묻지 않는다. 그래서 definition 은 IP pair unchanged · MAC pair
 * replaced · each link · router's interface 쪽 낱말을 쥐고, 물음 · 방송 · 표 · 캐시는 쓰지 않는다.
 *
 * 전제 (설명 글 `macIsLocal.md` 가 밝힌 것): IP 머리는 주소 두 칸만 — TTL 감소와 체크섬 재계산은 그리지 않는다 ·
 * 라우터가 다음 MAC 을 어떻게 알았는지(ARP)와 어느 라우터로 넘길지(라우팅 표)는 다루지 않는다 · 주소는 예로 정한 값.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const macIsLocalConcept: FacetConceptSource = {
  id: 'macIsLocal',
  label: 'A MAC Address Only Works on Its Own Link',
  canonicalFacet: 'facet:macIsLocal',

  surface: {
    definition:
      'Sending to another network, the packet’s source and destination IP addresses cross every link unchanged, while each router drops the incoming frame’s MAC pair and attaches a new one naming the two interfaces of the next link.',
    exemplarKeywords: [
      'MAC address changes at every hop',
      'IP address stays the same end to end',
      'destination MAC is the router',
      'layer 2 vs layer 3 addressing',
      'router rewrites the Ethernet header',
      'router interface MAC addresses',
      'frame vs packet addresses',
      'why a MAC address is not enough to reach the internet',
    ],
  },

  briefing: {
    observable: [
      'Four devices in a row — Sending host, Router 1, Router 2, Receiving host — joined by link 1, link 2, link 3. Each router has two interfaces with different MACs (Router 1: `00:1b:21:3a:40:01` on link 1, `00:1b:21:3a:40:02` on link 2).',
      'Step 0: "Packet at Sending host · IP from 192.168.1.5 to 172.16.5.20".',
      'Link 1: "the destination MAC belongs to Router 1, not Receiving host" — the frame reads `3c:52:82:1a:7e:05` → `00:1b:21:3a:40:01` above the unchanged IP line.',
      'At each router: "the link 1 MAC pair stays behind; a new pair for link 2 goes on". Link 2 carries `00:1b:21:3a:40:02` → `f0:9f:c2:11:08:0e`; link 3 carries `f0:9f:c2:11:08:0f` → `a4:83:e7:6c:d2:31`, and "only now does the destination MAC belong to Receiving host".',
      'The run ends with "Links: 3 · MAC pairs: 3 · MAC addresses: 6 · IP pairs: 1". Seven steps in all.',
      'The IP header shows only its two addresses; in reality each router also decrements the TTL and recomputes the checksum. How each router learned the next MAC, and how it chose the next router, are outside this run; the path is fixed and all addresses are examples. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, seven steps, and stops when the receiving host has the packet.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to the step at Router 1 holds the old MAC pair left behind beside the new one going on, with the IP line identical on both.',
        'The devices and addresses are fixed, so every address can be quoted exactly as it appears.',
      ],
    },

    useWhen: [
      'The reader believes the destination MAC on a packet leaving their laptop is the web server’s, and needs to see that it is the router’s.',
      'An article distinguishes layer-2 and layer-3 addressing and wants a single journey where one pair of addresses is rewritten three times and the other never.',
    ],

    avoidWhen: [
      'The topic is how the MAC addresses are discovered or cached. They are already known.',
      'The subject is NAT, where the IP addresses themselves are rewritten. Here the IP pair never changes.',
      'The article is about switches inside one LAN, which forward frames without replacing the MAC pair.',
    ],

    contrastWith: [
      {
        concept: 'arp',
        note: 'Link-local addressing is the reason a sender must learn a MAC for every link; counting those lookups with and without a cache is the cost that follows from it.',
      },
      {
        concept: 'askWhoHas',
        note: 'Replacing the MAC pair at each router assumes the router knows the next MAC. Asking the segment who owns an IP is how that knowledge is obtained.',
      },
      {
        concept: 'hopByHop',
        note: 'Moving across hops can be described by when each link is busy or by what each frame is addressed to. Per-link addressing is about the labels a frame carries on each link, not the timing of the crossing.',
      },
      {
        concept: 'ipRouting',
        note: 'Routing decides which neighbour comes next using the unchanged destination IP. Per-link addressing is what happens after that decision: the frame is readdressed to that neighbour’s interface.',
      },
    ],
  },
};
