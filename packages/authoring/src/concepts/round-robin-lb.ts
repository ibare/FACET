/**
 * roundRobinLb 개념 선언.
 *
 * canonical facet 은 `facet:roundRobinLb` — 사용자 열(`sess:0`..`sess:9`)이 요청 서른둘을 서버 넷(`app-1`..`app-4`)에
 * 보내고 틱 16 에 `app-2` 가 빠진다. 손잡이 "Routing method"(차례 · 최소 연결 · 나머지 해시 · 링 해시)와
 * "Hold spread"(±0 · ±1 · ±3 · ±5)를 돌리면 같은 요청 흐름 위에서 치우침 합 · 가장 붐빔 · 옮겨 간 요청이 갈린다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 넷)
 *
 * 조각 넷은 각자 한 방식의 과정 한 장면이다 — 차례 표가 돈다(`spreadInTurn`) · 빈자리로 간다(`sendToIdlest`) ·
 * 고리를 걷는다(`ringOfHashes`) · 빠질 때 옮김을 센다(`moveFewOnChange`). 이쪽은 **방식을 갈아 끼우는 조작과
 * 그 대비**를 맡는다 — 짐을 고르게 나누는 쪽과 같은 사용자를 같은 서버에 두는 쪽이 맞바뀐다.
 * 그래서 definition 은 routing policy · trade-off · even load · session affinity 쪽 낱말을 쥐고, 조각들이
 * 독점한 pointer · open connections · clockwise · remap 을 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `roundRobinLb.md` 가 밝힌 것):
 *  - 틱은 예로 정한 단위. 한 틱 안의 차례는 끝남 → 빠짐 → 도착 → 고르기.
 *  - 서버 넷은 같은 능력, 망 지연 0. 걸림은 6 ± 들쭉날쭉, 선형 합동 생성기 씨앗 42 로 뽑는다 — 손잡이를 돌려도 사용자 열은 같다.
 *  - 해시는 FNV-1a 32 + fmix32, 링 크기 100, 가상 노드 없음. 나머지 해시는 h mod 12 를 미리 셈해 넷 · 셋을 함께 낸다.
 *  - 빠진 서버는 새 요청만 받지 않고 열린 연결은 제 걸림대로 끝난다(드레인).
 *  - 옮김은 "그 사용자의 바로 앞 요청과 다른 서버로 간 요청" 이다. 첫 요청은 세지 않는다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다. 해시 값은 패널 밖에서 셈해 배열로 건넨다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const roundRobinLbConcept: FacetConceptSource = {
  id: 'roundRobinLb',
  label: 'Load Balancing Policies (Even Load vs Session Affinity)',
  canonicalFacet: 'facet:roundRobinLb',

  surface: {
    definition:
      'Choosing a load-balancing policy trades even load against session affinity: round robin and least connections balance servers but scatter each user, while hash-based routing pins users yet ignores load.',
    exemplarKeywords: [
      'load balancing algorithms compared',
      'round robin vs least connections vs consistent hashing',
      'sticky sessions',
      'session affinity',
      'NGINX upstream ip_hash vs least_conn',
      'HAProxy balance roundrobin leastconn',
      'Envoy ring_hash load balancer',
      'which load balancing strategy to choose',
      'uneven request duration skews round robin',
      'server removed from the pool',
      'connection draining',
    ],
  },

  briefing: {
    observable: [
      'Ten users, `sess:0` to `sess:9`, send thirty-two requests, one per tick, to four servers `app-1` to `app-4` through a "Load balancer". The same sequence of users arrives whichever handle is set.',
      'Each server has a bar of "Open connections" that rises when a request lands and falls when its hold time ends. Below, each user has a tag that sits under the server its last request went to, starting at "Not yet"; when a user\'s next request goes elsewhere, the tag jumps to the new server.',
      'A running "Imbalance sum" line adds, every tick, the gap between the busiest and idlest live server. The caption names each step, as in "Tick 16 · sess:3: app-4 → app-1 (moved) · imbalance 1", and the drop step reads "Tick 16 · down: app-2".',
      'At tick 16 `app-2` is marked "Down" and takes no new requests; the connections already open on it finish on their own time.',
      'With Round robin or Least connections, user tags jump on most returns (17 of the 22 at the default setting), and the bars stay close together. With Modulo hash or Ring hash, no tag moves before tick 16, while the bars drift apart.',
      'With Ring hash a "Ring" appears: servers and users sit at positions 0 to 99, and each request is drawn as an arc from the user\'s position to the first live server clockwise.',
      'End-of-round readouts, for Hold spread ±0 · ±1 · ±3 · ±5: Round robin imbalance 18 · 29 · 37 · 45 and moved 17 each time; Least connections imbalance 18 · 23 · 29 · 26, moved 15 to 19; Modulo hash imbalance 84 to 92, moved 5; Ring hash imbalance 69 to 73, moved 1. "Peak open" stays at 2 to 4 for the first two and 4 to 6 for the hashes.',
      'After `app-2` drops, Modulo hash re-routes users who were never on `app-2`, while Ring hash moves only the users that were on `app-2`, to its neighbour `app-1`. The moved counts are 5 and 1 because only users who come back after tick 16 are counted.',
      'Assumptions not footnoted on screen: ticks are an illustrative unit; the four servers have equal capacity and no network delay; hold time is 6 ± the spread, drawn with a linear congruential generator seeded at 42; the hash is FNV-1a 32-bit with an fmix32 finish, the ring has 100 positions and no virtual nodes; Least connections breaks ties toward the front of the list, which happens often here (19 of 32 requests at ±3).',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Routing method" with Round robin, Least connections, Modulo hash and Ring hash (starting Round robin), and "Hold spread" with ±0, ±1, ±3 and ±5 (starting ±3). Each round plays all thirty-three steps, then waits; a changed handle replays the same requests under the new setting.',
        'The move that makes the idea land is switching Routing method at the same spread: the tags that kept jumping freeze under the hashes while the Imbalance sum roughly doubles (37 against 86 and 73 at ±3). Raising Hold spread under Round robin then steepens its imbalance from 18 to 45, while Least connections stays between 18 and 29.',
        'Readouts under the controls: "Imbalance sum", "Peak open" and "Moved requests".',
        'The code panel, labelled "Route requests", starts empty with a "+ Add language" button. It shows `routeRequests`, which picks each request\'s server under the four methods and computes the per-tick imbalance and the moved count to the same values as the screen; the hash values come in as precomputed arrays such as `keyHash12`. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article must justify picking one balancing policy over another and needs one request stream on which the same choice visibly buys even servers and costs stable user placement, or the reverse.',
      'A reader asks why sticky sessions or hash-based routing are worth an uneven load, and the answer needs the moved-request count and the imbalance sum set side by side for the same traffic.',
      'The claim is that round robin degrades when request durations vary while least connections holds up, shown as a number that grows with a variance handle.',
    ],

    avoidWhen: [
      'The subject is weighted balancing across servers of different capacity, health checks, or active failure detection. All four servers are equal and the removal at tick 16 is scheduled, not detected.',
      'The article is about virtual nodes or bounded-load consistent hashing. The ring here has one position per server.',
      'The topic is Layer 4 versus Layer 7 balancing, TLS termination, or DNS-based load distribution. Nothing here concerns where the balancer sits in the network.',
      'The subject is partitioning stored data across database shards. These are requests with a hold time, not rows at rest.',
    ],

    contrastWith: [
      {
        concept: 'spreadInTurn',
        note: 'Rotating through servers in a fixed order is one policy in isolation; comparing it with the others shows what that blindness to request size costs once durations vary.',
      },
      {
        concept: 'sendToIdlest',
        note: 'Reading current connection counts explains how least connections keeps servers level; setting it beside hashing shows the same property is what spreads a returning user across servers.',
      },
      {
        concept: 'ringOfHashes',
        note: 'How a ring assigns an owner to a key is the mechanism; the policy comparison asks what that fixed assignment costs in load balance and gains in keeping users in place.',
      },
      {
        concept: 'moveFewOnChange',
        note: 'How many keys change owner when one server leaves is a property of the key-to-server mapping alone; the policy question adds that this stability matters only against policies that never pinned users, and that it is paid for in load balance.',
      },
      {
        concept: 'serviceDiscovery',
        note: 'Discovery answers which instances exist and where; load balancing assumes that list and decides which instance takes the next request.',
      },
      {
        concept: 'sharding',
        note: 'Both map a key to one of several machines by hash or by rule. Sharding places stored rows permanently; a balancer places transient requests and can weigh current load, which a data partition cannot.',
      },
    ],
  },
};
