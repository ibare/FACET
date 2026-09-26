/**
 * oneDoorManyRooms 개념 선언.
 *
 * canonical facet 은 `facet:oneDoorManyRooms` — 클라이언트가 아는 주소는 게이트웨이 하나다. 요청 넷
 * (`GET /users/7` · `GET /orders/42` · `GET /home` · `GET /admin/stats`)이 차례로 오고, 게이트웨이는 경로의 첫 조각을
 * 경로표와 견주어 서비스(users 30 ms · orders 50 ms · catalog 20 ms)를 고른다. `/home` 은 셋으로 한꺼번에 갈라져
 * 20 · 30 · 50 ms 차례로 모이고 한 응답(`200`, 50 ms)으로 묶인다. `/admin` 은 경로표에 없어 `404`. 걸음 아홉.
 * 스스로 재생하고 멈춘다. 코드 패널 없음.
 *
 * ── 묶음 안에서의 자리
 *
 * origin 은 버린 토픽 api-gateway 에서 `serviceDiscovery` 로 옮겼다 — 그 완제품의 게이트웨이가 등록부를 묻는 쪽이다.
 * 둘의 주장은 전혀 다르다: 저쪽은 한 서비스의 **인스턴스 명단**과 만료, 이쪽은 **어느 서비스인가**(경로 고르기) ·
 * 흩어 모으기 · 404. 그래서 definition 은 API gateway · single address · path · fan out · merge · 404 를 쥐고
 * registry · heartbeat · expiry 를 쓰지 않는다.
 *
 * 전제 (설명 글 `oneDoorManyRooms.md`): 처리 시간은 예로 정한 값 · 게이트웨이 자신의 시간과 네트워크 시간 0 ·
 * 요청은 하나가 끝나야 다음이 온다 · 인증 · 속도 제한 · 사본 고르기는 없다 · 경로는 첫 조각이 그대로 같은지만 본다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const oneDoorManyRoomsConcept: FacetConceptSource = {
  id: 'oneDoorManyRooms',
  label: 'API Gateway (Path Routing and Fan-out)',
  canonicalFacet: 'facet:oneDoorManyRooms',

  surface: {
    definition:
      'An API gateway gives clients a single address, forwards each request to a backend service chosen by its first path segment, fans one path out to several services and merges the replies, and returns 404 for unknown paths.',
    exemplarKeywords: [
      'API gateway',
      'single entry point for microservices',
      'path-based routing',
      'reverse proxy routing table',
      'request aggregation',
      'scatter-gather',
      'backend for frontend',
      'NGINX location routing',
      'Envoy',
      'Kong',
      'HTTP 404 unknown route',
    ],
  },

  briefing: {
    observable: [
      'On the left a Client holds four requests in line: `GET /users/7`, `GET /orders/42`, `GET /home`, `GET /admin/stats`. In the middle a Gateway carries a route table: `/users` → users, `/orders` → orders, `/catalog` → catalog, `/home` → users·orders·catalog. On the right three services: Users (`users`, 30 ms), Orders (`orders`, 50 ms), Products (`catalog`, 20 ms), each with a "Calls" count.',
      'The opening caption reads "The client knows one address: the gateway. Requests: 4".',
      '`/users/7` goes to Users and comes back `200` at 30 ms ("First segment /users → Users"); `/orders/42` goes to Orders and returns `200` at 50 ms.',
      '`/home` matches the fan-out row: the gateway sends it "at once to: Users · Orders · Products". Replies come back by speed — Products at 20 ms, Users at 30 ms, Orders at 50 ms — and a "Gathered" count at the gateway climbs 1/3, 2/3, 3/3.',
      'Once all three are in, the gateway sends a single reply: "Bundled into one answer: 200 · 50 ms" — the time of the slowest reply.',
      '`/admin/stats` has first segment `/admin`, which is not in the table; the gateway answers `404` itself and "Service calls: 0".',
      'At the end the client has used one address, four requests have produced five service calls (users 2, orders 2, catalog 1) and one 404. Asking the three services one after another would have taken 20 + 30 + 50 = 100 ms; the screen does not draw that.',
      'Service times are example values, and the gateway\'s own time and network time are taken as 0. Authentication, rate limiting and choosing among copies of the same service are not part of the model; the route test is an exact match on the first path segment.',
    ],

    screen: {
      affordances: [
        'The screen plays the four requests by itself, nine steps counting the opening, and stops after the 404.',
        'A Replay button and a playback strip sit below. Dragging back into the `/home` steps shows the gathered count at 1/3 and 2/3 before the bundled reply leaves.',
        'Paths, route table and service times are fixed, so an article can quote each request and its result exactly.',
      ],
    },

    useWhen: [
      'The article introduces an API gateway and needs to show what the client gains: it knows one address while its requests end up at three different services, chosen by path.',
      'A reader asks how one page request can combine data from several services; the `/home` fan-out and merge shows the parallel calls and why the combined reply waits for the slowest one.',
    ],

    avoidWhen: [
      'The article is about spreading load across several copies of one service. Each service here has a single box, and the gateway chooses between different services, not replicas.',
      'The subject is gateway features such as authentication, rate limiting, TLS termination or caching. None of these take part.',
      'The topic is how the gateway learns instance addresses at runtime, heartbeats or registries. The route table is fixed and names services only.',
    ],

    contrastWith: [
      {
        concept: 'serviceDiscovery',
        note: 'Routing by path decides which service a request belongs to; discovery decides which live instances of that service can take it and when a dead one stops being offered.',
      },
      {
        concept: 'registerAndFind',
        note: 'With a registry lookup the caller itself receives instance addresses; behind a gateway the client knows only the gateway, and the addresses never leave the server side.',
      },
      {
        concept: 'spreadInTurn',
        note: 'Taking turns spreads identical requests over copies of one service; path routing sends different requests to different services, and a copy count never enters into it.',
      },
      {
        concept: 'decoupleSenderReceiver',
        note: 'A gateway hides where services live but still waits for their replies in the same request; decoupling through a broker removes that wait, and the sender never learns who handled the message.',
      },
    ],
  },
};
