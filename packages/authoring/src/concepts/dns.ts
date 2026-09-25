/**
 * dns 개념 선언.
 *
 * canonical facet 은 `facet:dns` — 클라이언트가 0 초부터 10 초마다 `www.lab.example.com.` 을 묻는다(질문 서른). 125 초에
 * 원본 주소가 `192.0.2.80` 에서 `192.0.2.90` 으로 바뀌고 리졸버는 모른다. 손잡이 TTL(10 · 30 · 60 · 120 · 300, 처음 60)을
 * 올리면 서버 질의는 33 → 4 로 줄고 옛 답은 0 → 17 로 는다(반대 방향으로 단조). 첫 놓침만 네 층, 뒤 놓침은 한 곳.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `delegateDownTheTree` 는 빈 캐시로 나무를 한 번 내려가는 장면, `cacheTtl` 은 답 하나의 남은 시간이 닳아 버려지는 장면이다.
 * 이쪽은 **TTL 을 손잡이로 돌려 질의 수와 옛 답을 맞바꾸는 것**, 그리고 캐시가 넘김을 들고 있어 놓침 값이 네 층 → 한 층으로
 * 준다는 것을 맡는다. 그래서 definition 은 raising the TTL · fewer queries · more stale answers · first miss 쪽 낱말을 쥐고,
 * 조각들이 쥔 referral · root → TLD 차례 · counts down · discarded 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `dns.md` 가 밝힌 것):
 *  - TTL 사다리 · 질문 간격 10 초 · 바뀜 시각 125 초 · 주소는 예로 정한 값(문서용 대역). 125 는 질문 시각과 겹치지 않게 골랐다.
 *  - 넘김(NS)의 TTL 은 A 보다 길어 판 내내 든다고 두었다. 묻는 시간 0 · 리졸버 하나 · 부정 캐시 없음.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const dnsConcept: FacetConceptSource = {
  id: 'dns',
  label: 'DNS TTL Trade-off: Fewer Queries, Longer Stale Answers',
  canonicalFacet: 'facet:dns',

  surface: {
    definition:
      'Raising a DNS resolver\'s TTL cuts the queries it sends to name servers but lengthens how long a changed record is answered with the old address; only the first miss walks every delegation level.',
    exemplarKeywords: [
      'DNS',
      'choosing a DNS TTL',
      'DNS propagation delay',
      'lower TTL before migrating a server',
      'recursive resolver caching',
      'DNS query load',
      'stale DNS record',
      'cached NS referral',
      'domain name system',
      'dig +trace',
    ],
  },

  briefing: {
    observable: [
      'Top right a delegation tree: `a.root-servers.net` hands `com.` to `a.gtld-servers.net`, which hands `example.com.` to `ns1.example.com`, which hands `lab.example.com.` to `ns.lab.example.com`, holding `A 192.0.2.80`. Top left the resolver\'s cache row with a lifetime bar; below, a 0–300 s time axis with thirty question marks.',
      'Step 1 is the question at 0 s: the cache is empty, the dot runs through the resolver down all four levels, and the flag reads `+4` ("Asked at 0s · cache empty · 4 queries down the tree"). Later misses carry `+1` — the resolver remembers the referral and asks `ns.lab.example.com` directly.',
      'Each later step is a 50-second window: a filled circle is a hit, a square a miss, a hatched circle a stale answer. The caption tallies it, e.g. "Asked 110–150s · hits 4 (stale 3) · misses 1".',
      'A dashed line at 125 s marks the origin change, "origin 192.0.2.80 → 192.0.2.90". A red band from there to the expiry of the answer then held is the stale stretch — "stale for 55s" at TTL 60.',
      'End-of-round counters (server queries · cache hits · stale answers): TTL 10 → 33 · 0 · 0; 30 → 13 · 20 · 2; 60 → 8 · 25 · 5; 120 → 6 · 27 · 11; 300 → 4 · 29 · 17. The stale band grows 5 → 25 → 55 → 115 → 175 s.',
      'Server queries always equal 4 + (misses − 1), so TTL 10\'s thirty misses cost thirty-three queries.',
      'TTL values, the 10-second question spacing, the change at 125 s and the addresses are chosen for the example; the NS referral is assumed to outlive the A record for the whole round; lookups take no time; there is one resolver and no negative caching. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: a five-position "TTL" slider — 10, 30, 60, 120, 300 — starting at 60. Each round is eight steps, then waits for the handle.',
        'The move that makes the idea land is stepping TTL from 10 up to 300: the question marks stay put and only change shape, the miss flags thin out to one, and the red stale band stretches. The previous round\'s flags, bars and band stay as faint traces to compare.',
        'The code panel, labelled "resolver decision", starts empty with a "+ Add language" button; the chosen language shows `resolveAll` and highlights the line for walk-tree, ask-owner, cache hit or stale answer. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article advises on picking a TTL or lowering it before a server move, and needs the two costs side by side: query load on one end, time spent handing out an old address on the other.',
      'A reader assumes every cache miss repeats the full root-to-authority walk; the `+4` then `+1` flags show the resolver keeping where to ask as well as what the answer was.',
    ],

    avoidWhen: [
      'The subject is DNS record types, DNSSEC, zone transfers or DNS over HTTPS. Only one A record is looked up.',
      'The article is about negative caching of nonexistent names, or about several resolvers disagreeing.',
      'The point is a general cache eviction policy such as LRU. Entries here leave only by time.',
    ],

    contrastWith: [
      {
        concept: 'delegateDownTheTree',
        note: 'Walking referrals from the root is the full cost of resolving a name once. Caching decides how often that cost is paid, and remembering the referrals shrinks it for every later miss.',
      },
      {
        concept: 'cacheTtl',
        note: 'That one held answer outlives a change until its time runs out is the mechanism. Choosing the TTL weighs that stale window against how many queries the resolver sends, across a range of values.',
      },
      {
        concept: 'auth',
        note: 'Both put a lifetime on something handed out and trade by it. A DNS TTL trades freshness against query load; a token lifetime trades exposure of a leaked token against reissuing.',
      },
    ],
  },
};
