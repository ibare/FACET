/**
 * registerAndFind 개념 선언.
 *
 * canonical facet 은 `facet:registerAndFind` — 서비스 `orders` 의 인스턴스 셋(`a` · `b` · `c`)이 스스로 등록부에
 * 주소를 올리고 2 틱마다 하트비트로 임대를 민다. `b` 는 틱 4 에 멈추고 등록부는 그것을 모른 채 마지막 소식(틱 3)
 * 뒤 4 틱이 조용한 틱 7 에 지운다. 결제 서비스가 틱 2 · 5 · 8 에 `orders` 를 물어 2 → 3 → 2 개의 주소를 받는다.
 * 틱 0..8, 걸음 열(처음 포함). 스스로 재생하고 멈춘다. 코드 패널 없음.
 *
 * ── 묶음 안에서의 자리
 *
 * `serviceDiscovery`(완제품)는 만료 길이를 돌려 잃은 하트비트와 멈춘 인스턴스의 맞바꿈을 보인다. 이쪽은 잃음도
 * 손잡이도 없고, 주장은 "같은 이름을 물어도 그때의 명단을 받는다" 하나다 — 그래서 definition 은 self-register ·
 * lookup · same name · different list 쪽 낱말을 쥐고, 완제품이 쥔 expiry trade-off · lost heartbeats · gateway 를
 * 쓰지 않는다. `oneDoorManyRooms` 는 어느 서비스로 가는가(경로)라서 낱말이 애초에 갈린다.
 *
 * 전제 (설명 글 `registerAndFind.md`): 틱은 예로 정한 단위 · 하트비트 2 틱 · 만료 4 틱 · 등록부 하나(늘 산다) ·
 * 등록 해지 없음(멈춘 것은 만료로만 빠진다) · 클라이언트 쪽 조회 · 명단은 등록된 차례이고 고르지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const registerAndFindConcept: FacetConceptSource = {
  id: 'registerAndFind',
  label: 'Self-Registration and Registry Lookup',
  canonicalFacet: 'facet:registerAndFind',

  surface: {
    definition:
      'Instances self-register their address under a service name and keep renewing it; every lookup of that name returns whoever is listed at that moment, so identical queries get different address lists.',
    exemplarKeywords: [
      'self-registration pattern',
      'client-side service discovery',
      'service registry lookup',
      'how does a service find another service',
      'dynamic IP addresses of instances',
      'register on startup',
      'heartbeat renews the lease',
      'Eureka',
      'Consul',
      'etcd',
      'ZooKeeper ephemeral node',
    ],
  },

  briefing: {
    observable: [
      'A Registry for `orders` sits beside a tick axis 0 to 12; below stand Instance a (10.0.1.11:8080), Instance b (10.0.1.12:8080) and Instance c (10.0.1.13:8080), each "Not up" at first, and a Payment service with a "Lists received" shelf holding three slots: "Lookup · tick 2", "Lookup · tick 5", "Lookup · tick 8".',
      'Each step is one tick. At tick 0 `a` rises and its address card flies up into a new registry row ("Registered: a 10.0.1.11:8080 · Lease end: tick 4"); `b` registers at tick 1 and `c` at tick 4.',
      'Every 2 ticks after registering, a running instance sends a heartbeat: a dot goes up and pushes the right end of its row\'s lease bar forward ("Heartbeat: a · Lease end: tick 6"). The bar\'s end is the tick by which the row is removed if nothing more arrives.',
      'At tick 4 `b` shows "Stopped", and nothing reaches the registry; its row stays with "Last heard: tick 3".',
      'At tick 5 the lookup returns three addresses, and `b` is among them, marked Stopped. At tick 7 the registry removes `b` on its own ("Expired: b · Quiet ticks: 4") and the rows below move up.',
      'The three lists stay side by side on the shelf: a b, then a b c, then a c — "Addresses: 2", "Addresses: 3", "Addresses: 2" for the same name. Over the run there are 3 registrations, 7 heartbeats (a 4, b 1, c 2) and 1 expiry.',
      'The values are examples — heartbeat every 2 ticks, removal after 4 silent ticks — and the model has one registry that never fails, no deregistration (a stopped instance leaves only by expiry), and a caller that asks the registry directly. The list comes in registration order; the caller stops at receiving it and does not pick an address.',
    ],

    screen: {
      affordances: [
        'The screen plays ticks 0 to 8 by itself, one tick per step, ten steps counting the opening, and stops after the tick-8 lookup.',
        'A Replay button and a playback strip sit below. Dragging back to tick 5 holds the moment a stopped instance\'s address is still handed out.',
        'Instances, addresses, ticks and lookups are fixed, so an article can quote each list exactly.',
      ],
    },

    useWhen: [
      'The article explains why a caller cannot hard-code the addresses of another service and needs to show where the current addresses come from: instances announce themselves, and a lookup reads the list as it stands.',
      'A reader thinks that a registry answer is always correct; the tick-5 lookup handing out the address of an instance that stopped a tick earlier shows the list lags behind reality until expiry.',
    ],

    avoidWhen: [
      'The article is about choosing the heartbeat timeout or the cost of lost heartbeats. No heartbeat is lost here and the removal time is fixed at 4 ticks.',
      'The subject is a gateway or load balancer that forwards the request. The caller stops at receiving the list and never calls an instance.',
      'The topic is DNS resolution and record caching. The rows here are renewed by the instances themselves.',
    ],

    contrastWith: [
      {
        concept: 'serviceDiscovery',
        note: 'Registering and looking up is the basic loop; the expiry trade-off asks what happens to that loop when heartbeats are lost on the way and the timeout has to be tuned.',
      },
      {
        concept: 'oneDoorManyRooms',
        note: 'A lookup answers where instances of one named service are; a gateway answers which service a request path belongs to, and the client never learns any instance address.',
      },
      {
        concept: 'cacheTtl',
        note: 'A cached record ages out on the holder\'s timer whatever the source does; a registry row lives exactly as long as the instance keeps renewing it.',
      },
      {
        concept: 'spreadInTurn',
        note: 'Receiving the list of addresses is where discovery ends; taking turns through that list to decide who gets each request is a separate step.',
      },
    ],
  },
};
