/**
 * serviceDiscovery 개념 선언.
 *
 * canonical facet 은 `facet:serviceDiscovery` — 인스턴스 넷(`a`..`d`, 서비스 `payments`)이 틱 0 에 등록되고 2 틱마다
 * 하트비트를 보내며, 게이트웨이가 틱마다 요청 둘을 등록부 명단 차례로 보낸다. 하트비트는 25% 로 길에서 잃고,
 * `d` 는 틱 10 에 멈춘다. 손잡이 `만료 길이`(3 · 4 · 5 · 7 · 9, 처음 5)를 돌리면 산 것을 지운 수와 멈춘 `d` 가
 * 명단에 남은 틱 · 그리로 간 요청 수가 맞바뀐다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `registerAndFind` 는 스스로 올리고 조회가 그때의 명단을 받는 한 장면(잃음 없음 · 클라이언트 쪽 조회),
 * `oneDoorManyRooms` 는 게이트웨이가 경로로 서비스를 고르는 한 장면이다. 이쪽은 **만료 길이의 맞바꿈**을 쥔다 —
 * definition 은 expiry · lost heartbeats · wrongly drops · stale instance · requests routed to it 쪽 낱말을 쓰고,
 * 조각이 쥔 self-register · lookup returns · path segment · fan out 을 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `serviceDiscovery.md` 가 밝힌 것):
 *  - 틱은 예로 정한 단위 · 하트비트 간격 2 틱 · 망 지연 0 · 등록부 하나(늘 산다) · 해지 없음 · 등록은 잃지 않는다.
 *  - 잃음 25% 는 선형 합동 생성기(씨앗 42)로 판 머리에 뽑은 표 — 손잡이와 무관하게 같은 소식을 잃는다.
 *  - 게이트웨이의 명단 차례 돌리기는 예로 정한 고르기 · 서버 쪽 디스커버리.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const serviceDiscoveryConcept: FacetConceptSource = {
  id: 'serviceDiscovery',
  label: 'Service Discovery (Registry Expiry Trade-off)',
  canonicalFacet: 'facet:serviceDiscovery',

  surface: {
    definition:
      'A service registry drops instances silent for its expiry length: a short expiry wrongly removes live instances after a few lost heartbeats, a long one keeps a crashed instance listed so the gateway still routes requests to it.',
    exemplarKeywords: [
      'service discovery',
      'service registry',
      'heartbeat timeout tuning',
      'lease expiration',
      'Eureka lease renewal',
      'Consul health check TTL',
      'stale instance in the registry',
      'requests routed to a dead instance',
      'false positive instance removal',
      'server-side discovery',
      'microservices',
    ],
  },

  briefing: {
    observable: [
      'The top row holds four instances of the service `payments` — `a` to `d` at 10.0.2.21:8080 to 10.0.2.24:8080 — and a Gateway. Below them the Registry keeps one row per instance with a bar labelled "bar = ticks of silence" and a red dashed "expiry line: 5" across the rows.',
      'Each step is one tick, 1 to 23. Every 2 ticks each running instance sends a heartbeat down to the registry; a heartbeat that arrives resets its row\'s bar to 0, and one lost on the way vanishes mid-route. The caption lists "heartbeats in: …" and "lost on the way: …".',
      'When a bar reaches the expiry line the row is dropped and turns dashed; the next heartbeat that arrives puts it "back on the list". At expiry 5, `d` is "dropped while alive" at tick 5 after its tick-2 and tick-4 heartbeats were both lost, and comes back at tick 6.',
      'At tick 10 `d` "stops sending"; the registry cannot tell and keeps listing it. Every tick the gateway sends two requests in roster order ("requests → c d✗"); the ones that land on the stopped `d` go red with ✗, at ticks 10 and 12. At tick 13 `d` is "dropped after stopping", 5 ticks after it was last heard.',
      'Three counters under the controls: "Requests to a dead one", "Live ones dropped", "Ticks dead d stayed". A full run is 24 steps; at expiry 5 they end at 2, 1 and 3.',
      'Across the handle the counters trade: expiry 3 ends 1 · 9 · 1, 4 ends 1 · 1 · 2, 5 ends 2 · 1 · 3, 7 ends 3 · 0 · 5, 9 ends 4 · 0 · 7. At 3 a single lost heartbeat is enough to drop a live row; at 4 and 5 it takes two lost in a row, which is why both show 1.',
      'The model is simplified and the screen does not footnote it: ticks are an example unit, network delay is 0, there is one registry that never fails, instances never deregister (a stopped one leaves only by expiry), registration is never lost, heartbeat loss is 25% drawn in advance from a fixed-seed generator (seed 42), so turning the handle keeps the same heartbeats lost. The gateway simply rotates through the roster; how to choose among instances is a separate matter.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle, "Expiry length", with positions 3, 4, 5, 7 and 9 ticks; 5 is the default. Each position replays the same 23 ticks with the same lost heartbeats.',
        'The move that makes the idea land is swinging the handle between 3 and 9: the expiry line drops or rises over the silence bars, live rows start flickering off and back on at the low end, and at the high end the flicker stops while the stopped `d` row stays listed longer and draws more ✗ requests.',
        'The code panel, labelled "Registry expiry and gateway pick", starts empty with a "+ Add language" button; its `discover` function takes the same loss table and computes the same three counts. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article has to justify a heartbeat or lease timeout value and show that neither short nor long is free: one direction evicts healthy instances on a few dropped packets, the other keeps routing traffic to a crashed one.',
      'A reader asks why requests still reach an instance that has already died when the system uses a registry, and the article wants the silent period between crash and eviction measured in wasted requests.',
    ],

    avoidWhen: [
      'The article is about client-side lookup or how an instance first announces itself. Here all instances register at tick 0 and it is the gateway, not the client, that reads the list.',
      'The subject is choosing the best instance by load, latency or hashing. The gateway only rotates through the list.',
      'The topic is DNS caching or record TTL. The countdown here is reset by messages the instance sends, not by a resolver holding an answer.',
      'The article covers registry replication, consensus among registry nodes, or graceful deregistration on shutdown. There is one registry and nobody deregisters.',
    ],

    contrastWith: [
      {
        concept: 'registerAndFind',
        note: 'Self-registration and lookup explain how a caller learns addresses at all; the expiry trade-off assumes that loop and asks what the eviction timeout costs when heartbeats get lost and instances crash.',
      },
      {
        concept: 'oneDoorManyRooms',
        note: 'A gateway choosing which service a path belongs to is routing by name; discovery is how that gateway knows which instances of the service are alive right now.',
      },
      {
        concept: 'cacheTtl',
        note: 'A cache TTL expires an answer on the holder\'s clock no matter what the source does; a registry lease is pushed back by each heartbeat, so silence from the instance is what triggers removal.',
      },
      {
        concept: 'roundRobinLb',
        note: 'Load balancing decides which listed instance takes a request; discovery decides which instances are on the list in the first place, and a stale entry hurts whatever the balancing policy.',
      },
      {
        concept: 'circuitBreaker',
        note: 'Both react to a dead dependency, but a registry removes the instance for everyone after silence, while a breaker stops one caller from calling after its own failed attempts.',
      },
    ],
  },
};
