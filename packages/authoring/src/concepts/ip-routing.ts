/**
 * ipRouting 개념 선언.
 *
 * canonical facet 은 `facet:ipRouting` — 라우터 토폴로지 + 한 시점에 한 표만 펼치는
 * 라우팅 테이블 + 비트 비교 + TTL 표시 + 현재 사건 패널.
 *
 * reactive 다. 발신 / 한 hop / 자동 시연 / 초기 TTL 조절을 지원한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const ipRoutingConcept: FacetConceptSource = {
  id: 'ipRouting',
  label: 'IP Routing',
  domain: 'network',
  canonicalFacet: 'facet:ipRouting',

  surface: {
    definition:
      'Forwarding where each router independently consults only its own table, picks the entry whose prefix matches the destination longest, and passes the packet one hop onward.',
    exemplarKeywords: [
      'IP routing',
      'routing table',
      'next hop',
      'longest prefix match',
      'hop by hop forwarding',
      'TTL',
      'subnet prefix',
      'default route',
      'packet dropped',
      'distributed decision',
    ],
  },

  briefing: {
    observable: [
      'Only one router\'s table is open at any moment. No router ever sees another\'s, and that single open table is what "distributed decision" means here.',
      'The destination is compared bit by bit against each prefix, and the matching length is shown — the entry that wins is the one that matched longest, not the one listed first.',
      'TTL drops by one at every hop and is printed on the packet, so the countdown is visible rather than implied.',
      'A packet whose TTL reaches zero is dropped in place, and so is one that finds no matching row. The two failure modes look different and are named differently.',
      'A current-event panel narrates each beat — arriving, opening the table, comparing bits, the LPM result, the hop taken.',
      'Some packets leave through an external interface rather than continuing inside the drawn topology, which is what a default route does.',
    ],

    screen: {
      affordances: [
        'The reader can both watch and drive: an auto-demo plays a sequence, Send launches one packet, and One hop advances a single step.',
        'Initial TTL is adjustable (64 / 32 / 8 / 4 / 2). Setting it to 2 on a longer path is how to make a TTL drop happen on purpose.',
        'The rules legend states the three invariants — one table at a time, longest match wins, one off the TTL per hop — and is worth pointing at rather than restating.',
      ],
    },

    useWhen: [
      'The reader imagines a router knowing the whole path. Watching each hop consult only its own table and forget the packet is what breaks that picture.',
      'The article is about longest-prefix match, which only means something when several entries match at once and one has to win.',
    ],


    avoidWhen: [
      'The article is about routing protocols (BGP, OSPF, RIP) — how tables come to hold what they hold. The tables here are given and never change.',
      'The subject is NAT, firewalls, or packet inspection. Nothing here rewrites or examines a packet beyond its destination.',
      'The point is TCP behaviour — handshakes, retransmission, congestion. This screen carries single packets with no connection above them.',
    ],

    contrastWith: [
      {
        concept: 'cachingCdn',
        note: 'Both are hop-by-hop journeys, but a packet asks which way to go next while a CDN request asks who already has the answer.',
      },
      {
        concept: 'bfs',
        note: 'A graph traversal knows the whole graph and plans; a router knows only its own table and decides one step at a time. Same topology, opposite vantage point.',
      },
    ],
  },
};
