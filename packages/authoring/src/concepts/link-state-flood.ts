/**
 * linkStateFlood 개념 선언.
 *
 * canonical facet 은 `facet:linkStateFlood` — 라우터 여섯 A–F, 선 일곱(고리 둘). A 가 제 이웃 목록(B 비용 2 ·
 * C 비용 5)을 번호 7 알림에 적어 퍼뜨린다. 처음 받은 라우터만 온 곳을 뺀 이웃에게 사본을 넘기고, 이미 가진 사본은
 * 버린다. 라운드 넷 · 사본 아홉 · 버림 넷으로 여섯 모두가 A 가 쓴 것과 같은 알림을 쥔다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 카탈로그에서 ospf 토픽이 `rip` 완제품에 합쳐졌다 — OSPF 로 오는 검색은 이 조각과 `shortestPathTree` 에도 닿게
 * 키워드를 둔다. 형제 `shortestPathTree` 는 알림이 다 퍼진 **뒤** 각자 나무를 셈하는 장면이다. 이쪽은 **퍼지는 것**
 * 하나 — definition 은 copied unchanged · forwards once · discards duplicates · loops 를 쥐고, 지도 · 비용 합 ·
 * 나무 낱말을 쓰지 않는다.
 *
 * 전제: 동기 라운드, 같은 라운드 동시 도착은 보낸 이 이름 차례. ack · 재전송 · 알림 나이 · 주기 재번짐은 뺐다.
 * 번호 · 비용은 예로 정한 값.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const linkStateFloodConcept: FacetConceptSource = {
  id: 'linkStateFlood',
  label: 'Link-State Advertisement Flooding',
  canonicalFacet: 'facet:linkStateFlood',

  surface: {
    definition:
      'In link-state routing, one router\'s neighbor-list advertisement is copied unchanged from neighbor to neighbor; each router forwards it only on first receipt and discards duplicates, so it reaches all without circling loops.',
    exemplarKeywords: [
      'LSA flooding',
      'OSPF flooding',
      'link state advertisement',
      'reliable flooding',
      'sequence number duplicate detection',
      'flooding in a network with loops',
      'IS-IS LSP',
      'how every router gets the same topology',
    ],
  },

  briefing: {
    observable: [
      'Six routers A–F on seven links A–B, A–C, B–D, C–D, C–E, D–F, E–F, forming two loops. A writes its neighbor list into one notice — origin A, seq 7, "B cost 2 · C cost 5" — shown as a small card ("Router A writes its neighbor list into one notice.").',
      'One step is one round. A router that receives the notice for the first time keeps it and sends copies to every neighbor except the one it came from. Captions count each round: "Round 2 — sent: 3 · kept as new: 2 · dropped (already held): 1 · Sending next round: D · E".',
      'D gets two copies in round 2 and keeps B\'s, dropping C\'s; in round 3 C drops the copy from D and F keeps D\'s, dropping E\'s. In round 4 F\'s copy to E is dropped and "No router got it new — nobody sends next round."',
      'Each router\'s held card is identical to the one A wrote, character for character. The end reads "Routers holding a copy identical to the one A wrote: 6 / 6 · Last round: 4 · copies sent: 9 · dropped: 4". The first-receipt links A→B, A→C, B→D, C→E, D→F trace the path the notice actually took.',
      'Rounds are synchronous and simultaneous arrivals are ordered by sender name. Acknowledgements, retransmission, notice age and periodic re-flooding are left out; the sequence number and costs are example values.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one round per step, and stops once nobody has anything left to send.',
        'A Replay button and a playback strip sit below it. Dragging back to round 3 holds the moment a copy returns around a loop and is dropped.',
        'The topology and notice are fixed, so every count can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains how OSPF gets every router the same topology, and needs a notice reaching all six routers unchanged in four rounds.',
      'A reader asks why flooding does not circle forever in a network with loops, and the article wants copies that return around a loop being dropped by routers that already hold them.',
    ],

    avoidWhen: [
      'The article is about computing routes from the map with Dijkstra. No routes or trees are computed here.',
      'The subject is broadcast storms in switched Ethernet or spanning tree. This is routed advertisements with duplicate detection.',
      'The point is gossip or epidemic protocols with random peer choice. Every router here forwards to all neighbors but the sender.',
    ],

    contrastWith: [
      {
        concept: 'shortestPathTree',
        note: 'Flooding gives every router the same map; what each router then computes from that map is its own tree, which differs by root.',
      },
      {
        concept: 'hopCountMetric',
        note: 'A distance-vector router rewrites what it passes on by adding its own hop; a link-state notice is forwarded without a single change.',
      },
      {
        concept: 'rip',
        note: 'Flooding is how link state learns; against distance and path vectors it costs the most adverts at first but recovers from a cut without counting up.',
      },
    ],
  },
};
