/**
 * delegateDownTheTree 개념 선언.
 *
 * canonical facet 은 `facet:delegateDownTheTree` — 리졸버가 루트 `a.root-servers.net` 하나만 알고 `www.lab.example.com.` 을 찾는다.
 * 루트 → `a.gtld-servers.net` → `ns1.example.com` → `ns.lab.example.com` 로 넘김 셋을 따라 내려가 `192.0.2.80` 을 받는다.
 * 리졸버 질의 4 · 넘김 3 · 답 1, 클라이언트는 한 번 묻고 기다린다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `dns` 는 TTL 을 돌려 질의 수와 옛 답을 맞바꾸고, 이웃 `cacheTtl` 은 들고 있는 답이 시간에 버려지는 장면이다. 이쪽은
 * 캐시가 없는 한 번의 풀이 — **위는 답 대신 아래를 가리키고, 리졸버는 같은 질문을 한 층 아래에서 다시 한다.** 그래서
 * definition 은 referral · root · TLD · authoritative · iterative · suffix 쪽 낱말을 쥐고, TTL · cache · stale 을 쓰지 않는다.
 *
 * 전제 (설명 글 `delegateDownTheTree.md` 가 밝힌 것): 서버 이름 · 주소는 문서용 대역의 예로 정한 값(실제 루트 · com 서버 아님) ·
 * 리졸버는 반복 질의만(이름 줄여 묻기 없음) · 캐시 비었고 쓰지 않음 · 서버마다 넘긴 자리 하나 · 메시지는 보낸 순간 닿는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const delegateDownTheTreeConcept: FacetConceptSource = {
  id: 'delegateDownTheTree',
  label: 'DNS Delegation: Referrals from Root to Authoritative Server',
  canonicalFacet: 'facet:delegateDownTheTree',

  surface: {
    definition:
      'In iterative DNS resolution no server holds every name: the root and each lower server answer with a referral to the zone matching more of the name\'s suffix, until the authoritative server returns the address.',
    exemplarKeywords: [
      'DNS delegation',
      'iterative DNS query',
      'root name server',
      'TLD server',
      'authoritative name server',
      'NS referral',
      'DNS hierarchy',
      'recursive vs iterative resolution',
      'how a domain name is resolved',
      'zone cut',
    ],
  },

  briefing: {
    observable: [
      'The name `www.lab.example.com.` sits at the top with an underline that starts at the final dot. A Client and a Resolver stand on the left; four servers stack down the right, from `a.root-servers.net` 198.51.100.1 to `ns.lab.example.com` 203.0.113.54. "The resolver knows one server: a.root-servers.net".',
      'The client asks once — "The client asks once, then waits: www.lab.example.com. A ?" — and does nothing else until the end.',
      'Each query sends the whole name again: "Query 1 to a.root-servers.net, the whole name again: www.lab.example.com. A ?". Every server\'s question box shows the same text.',
      'The first three servers reply with a pointer instead of an answer — "No answer, a pointer one level down: com. → a.gtld-servers.net (198.51.100.2)", then `example.com.` → `ns1.example.com`, then `lab.example.com.` → `ns.lab.example.com`. With each pointer the underline grows one label leftward and the resolver\'s "Next:" address changes.',
      '`ns1.example.com` holds `www.example.com. A 192.0.2.10` but does not answer with it — the name does not match to the end.',
      'The bottom server answers `192.0.2.80`, and the resolver hands it back: "To the client: 192.0.2.80. Queries sent by the resolver: 4, pointers followed: 3".',
      'Names and addresses come from documentation ranges and are not real root or com servers. The resolver sends only iterative queries with the full name; the cache is empty and unused; each server delegates one zone. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one message per step, eleven steps including the start, and stops after the answer reaches the client.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to query 3 holds `ns1.example.com` pointing onward while holding a similar-looking record.',
        'The name, servers and addresses are fixed, so every referral line can be quoted as shown.',
      ],
    },

    useWhen: [
      'The reader imagines one giant directory of all domain names; the root answering with a pointer instead of an address, three times down, replaces that picture with delegation.',
      'The article distinguishes the client\'s single recursive query from the resolver\'s iterative ones and needs the four queries and three referrals laid out.',
    ],

    avoidWhen: [
      'The subject is DNS caching, TTL or propagation delay. The cache is empty and never used.',
      'The article is about query name minimisation, DNSSEC chains or anycast root servers.',
      'The point is IP routing or how packets reach the servers. Messages arrive instantly and the network between is not drawn.',
    ],

    contrastWith: [
      {
        concept: 'dns',
        note: 'One uncached lookup shows what resolving a name costs. Caching with a TTL decides how often that walk is repeated and how much of it a later miss can skip.',
      },
      {
        concept: 'cacheTtl',
        note: 'Delegation is about finding who holds an answer; the TTL is about how long a found answer may be reused before it has to be sought again.',
      },
      {
        concept: 'longestPrefixMatch',
        note: 'Both pick the most specific match: a DNS server delegates by the longest matching suffix of a name, a router forwards by the longest matching prefix of an address. The DNS referral sends the asker elsewhere; the route sends the packet onward.',
      },
    ],
  },
};
