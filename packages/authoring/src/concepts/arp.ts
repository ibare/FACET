/**
 * arp 개념 선언.
 *
 * canonical facet 은 `facet:arp` — 호스트 A(192.168.1.5)가 같은 상대에게 세 번 보낼 때 ARP 로 몇 번 묻는가.
 * 손잡이 둘 — 목적지(같은 망 C 192.168.1.9 · 다른 망 B 172.16.5.20) × ARP 캐시(없음 · 있음). 다른 망이면 첫 물음이
 * 목적지가 아니라 기본 게이트웨이 R1(192.168.1.1)을 찾고, 링크마다 그 링크의 두 끝이 다시 묻는다.
 * 방송 물음 3 · 1 (같은 망) / 9 · 3 (다른 망), MAC 쌍 1 → 3, IP 쌍은 늘 1.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 각각 한 장면이다 — 한 세그먼트에서 방송 물음이 퍼지고 주인만 답함(`askWhoHas`) · 물음 하나로 두 표에 줄이
 * 적히고 뒤 보냄이 표에서 꺼냄(`arpCache`) · 링크마다 MAC 쌍이 바뀌고 IP 쌍은 그대로(`macIsLocal`, 합친 토픽 mac 에서
 * 옮김). 이쪽은 **목적지의 망과 캐시를 돌려 물음의 수와 물음의 대상이 갈리는 것**을 맡는다. 그래서 definition 은
 * counting · gateway · per link · links × sends 쪽 낱말을 쥐고, 조각들이 독점한 세그먼트 전체 · 버림 · 주인의 답 ·
 * 두 끝의 표 · IP 쌍 불변은 쓰지 않는다. 합친 토픽 mac 의 낱말(MAC 주소 · 2 층 주소)은 exemplarKeywords 가 품는다.
 *
 * 전제 (설명 글 `arp.md` 가 밝힌 것):
 *  - "캐시 없음" 은 견주려고 세운 가정 — 실제 호스트는 늘 캐시를 쓴다. 표의 줄은 만료되지 않는다.
 *  - 다음 홉은 주어진다 (라우팅 표 · 가장 긴 일치는 ip-routing). TTL · 체크섬은 그리지 않는다.
 *  - 모든 인터페이스는 /24. 주소는 예로 정한 사설 대역.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이라 언어별로 다른 뜻을 보이지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const arpConcept: FacetConceptSource = {
  id: 'arp',
  label: 'ARP and MAC Addresses: Counting Lookups Across Links',
  canonicalFacet: 'facet:arp',

  surface: {
    definition:
      'Counting ARP broadcasts over repeated sends: for an off-subnet destination the host resolves its default gateway, each later link resolves its own next hop, and caching cuts the count from links × sends to links.',
    exemplarKeywords: [
      'ARP',
      'address resolution protocol',
      'default gateway MAC address',
      'same subnet or different subnet',
      'MAC address vs IP address',
      'layer 2 address',
      'how many ARP requests',
      'ARP broadcast traffic',
      'arp -a',
      'subnet mask decides who to ask',
    ],
  },

  briefing: {
    observable: [
      'Hosts A, C and B and routers R1, R2 over three links, each interface labelled with its IP and a shortened MAC (A 192.168.1.5 …:7e:05, C 192.168.1.9, R1 192.168.1.1 / 10.0.12.1, R2 10.0.12.2 / 172.16.5.1, B 172.16.5.20). Each device has an ARP table box, "no table" when the cache is off. A Data frame panel shows the frame’s MAC line and IP line.',
      'Step 0 compares A’s address with the destination octet by octet. For B: "First 3 octets differ · ask for: 192.168.1.1 (the gateway)". For C: "First 3 octets match · ask for: 192.168.1.9 (the destination)".',
      'Each following step is one hop of one send: "Send 1 · hop 1 · link 1 · A → R1". Without a table entry, "Broadcast (to ff:ff:ff:ff:ff:ff) · who has 192.168.1.1? · heard by: … · reply from: R1"; on link 1 host C also hears the question. With a cached entry, "From the table: … → … · no broadcast".',
      'Across hops the Data frame’s MAC line changes on every link (…:7e:05 → …:40:01, then …:40:02 → …:08:0e, then …:08:0f → …:d2:31) while the IP line stays 192.168.1.5 → 172.16.5.20.',
      'The round ends with "Done · IP pairs: 1 · MAC pairs: … · broadcasts: …". Three sends: same network 3 broadcasts without a cache, 1 with; other network 9 without, 3 with. MAC pairs 1 or 3, frames on the wire 9 · 5 · 27 · 15.',
      'Running without a cache is an assumption made for comparison; real hosts always cache, and real entries expire after minutes while these never do. The next hop at each router is given rather than looked up, every interface is /24, and all addresses are private examples. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Destination" (Same network, Other network; starts at Other network) and "ARP cache" (Off, On; starts at Off). Each round plays to the end and waits for the handles.',
        'Readouts: Broadcasts, From table, MAC pairs, Frames.',
        'The move that makes the idea land is flipping Destination: the first question’s arrow moves from C to the gateway R1 and the second and third links light up. Then turn the cache On and watch the broadcasts of the second and third sends disappear.',
        'The code panel, labelled "Counting ARP questions", starts empty with a "+ Add language" button and shows the per-hop lookup loop in Python, JavaScript, TypeScript, Java, C++ or C#, highlighting the line of the current step.',
      ],
    },

    useWhen: [
      'The reader expects a host to ARP for the final destination’s MAC and needs to see that, for an off-subnet address, it asks for the default gateway instead, and every router asks again on its own link.',
      'An article estimates how much ARP traffic a conversation generates and wants the numbers with and without caching across a multi-router path.',
      'A text introduces MAC and IP addresses together and needs one run in which both appear on every frame, with only one of them changing.',
    ],

    avoidWhen: [
      'The topic is ARP spoofing, gratuitous ARP or proxy ARP. Every question has exactly one honest owner.',
      'The subject is IPv6 neighbour discovery. Only IPv4 ARP is modelled.',
      'The article is about how routers choose the next hop. Next hops are given; the forwarding table is not consulted.',
    ],

    contrastWith: [
      {
        concept: 'askWhoHas',
        note: 'A single request broadcast and answered by its owner is the exchange itself. Over a path of several links the questions become how often it recurs, with and without memory, and who is actually asked.',
      },
      {
        concept: 'arpCache',
        note: 'Writing answers into tables on both ends explains why later sends skip the question. Measured over a routed path, the saving is bounded below by the number of links, since each link needs its own entry.',
      },
      {
        concept: 'macIsLocal',
        note: 'That a MAC address is only meaningful on one link is the reason resolution must repeat per link. The lookup count takes that as given and asks how many broadcasts it costs.',
      },
      {
        concept: 'ipRouting',
        note: 'Routing picks the next hop’s IP address; address resolution then finds that hop’s MAC on the local link. One answers where to go, the other how to reach the neighbour that was chosen.',
      },
    ],
  },
};
