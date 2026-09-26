/**
 * sendToIdlest 개념 선언.
 *
 * canonical facet 은 `facet:sendToIdlest` — 서버 셋에 처음부터 연결 2 · 1 · 2 가 열려 있다. 틱 1..8 마다 먼저 그 틱에
 * 끝난 연결이 빠져나가고, 이어 도착한 요청이 지금 열린 수가 가장 적은 서버로 간다. 틱 2 부터는 연결이 빠진 바로 그
 * 서버가 요청을 받는다. 배정 뒤 열린 수는 걸음마다 2 · 2 · 2, 받은 수는 2 · 4 · 2. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `roundRobinLb` 가 방식 대비를, `spreadInTurn` 이 차례 표만 보고 고르는 장면을 맡는다. 이쪽의 한 동사는
 * **빈자리로 간다** — 고름의 입력이 지금 열린 연결 수 하나이고, 끝나서 빠져나간 연결이 다음 고름을 정한다.
 * 그래서 definition 은 open connections · closes · concurrent 쪽 낱말을 독점하고 pointer · rotate 를 쓰지 않는다.
 * "차례대로였다면 여덟 중 셋만 같은 서버" 라는 견줌은 설명 글의 말이라 화면 관찰에 넣지 않는다.
 *
 * 전제 (설명 글 `sendToIdlest.md`):
 *  - 틱은 예로 정한 단위. 요청마다 걸리는 틱 수는 재생 셈용 자료이고 부하 분산기는 모른다.
 *  - 같은 틱이면 끝남을 먼저 센다. 동률은 목록 앞쪽 — 이 데이터에서는 한 번도 생기지 않는다.
 *  - 서버 셋은 같은 능력(가중 최소 연결 아님). 틱 8 에 끝날 때 열린 연결 여섯은 그림 안에서 빠지지 않는다.
 *  - 조각 화면에 코드가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const sendToIdlestConcept: FacetConceptSource = {
  id: 'sendToIdlest',
  label: 'Least Connections Load Balancing',
  canonicalFacet: 'facet:sendToIdlest',

  surface: {
    definition:
      'A least-connections balancer reads each server\'s currently open connections when a request arrives and picks the fewest, so a server whose connection just closed takes the next one and concurrent work evens out.',
    exemplarKeywords: [
      'least connections',
      'least_conn',
      'leastconn',
      'least outstanding requests',
      'fewest active connections',
      'dynamic load balancing',
      'long-lived connections',
      'uneven request durations',
      'fast servers get more requests',
      'server with the lightest current load',
    ],
  },

  briefing: {
    observable: [
      'Three servers, Server 1, 2 and 3, each show a row of open connections with columns "Open", "Left" and "Received"; a "Load balancer" takes requests `r1` to `r8` from an "Arriving" queue. At the start the caption reads "Tick 0 · Already open: 5": the servers hold 2, 1 and 2 connections.',
      'Each step is one tick and happens in a fixed order: first any connection that finished this tick leaves its server ("Finished and left: Server 1"), then the tick\'s request goes to the server with the fewest open connections ("Fewest open: 1 · r2 → Server 1").',
      'At tick 1 nothing finishes ("Nothing finished this tick"), and Server 2, holding only one connection, takes `r1`.',
      'From tick 2 to tick 8 exactly one connection leaves per tick, and the request of that tick goes to the very server it left: the departure makes that server the idlest at that moment.',
      'After every assignment the open counts are back to 2, 2, 2. The Received counts, by contrast, end uneven at 2, 4, 2 — Server 2 finishes connections sooner and so is handed more.',
      'The balancer never reads how long a request will take or how many each server has received so far; the tick at which a connection ends is only known when it ends. Ties would go to the lower-numbered server, but none occurs in this run.',
      'Ticks are an illustrative unit and the three servers are equally capable. The run stops at tick 8 with six connections still open.',
    ],

    screen: {
      affordances: [
        'The screen plays its nine steps by itself, the start plus ticks 1 to 8, and stops after `r8` reaches Server 2.',
        'A Replay button and a playback strip sit below it. Holding any step from tick 2 on shows the gap left by the departing connection being filled by that tick\'s request.',
        'Arrivals, durations and the starting connections are fixed, so an article can quote every caption and count exactly as it appears.',
      ],
    },

    useWhen: [
      'The article needs to show what least connections actually looks at: one live number per server, with a finished connection immediately turning its server into the next choice.',
      'The reader expects a fair balancer to give every server the same number of requests, and the article wants a case where concurrent load stays equal precisely because the totals do not.',
    ],

    avoidWhen: [
      'The subject is weighted least connections or servers with different capacity. All three servers are treated as equal.',
      'The article is about response-time-based or latency-aware balancing such as EWMA or least response time. Only the count of open connections is read.',
      'The point is overload, queueing or rejection. Every request is accepted at once and no server fills up.',
    ],

    contrastWith: [
      {
        concept: 'spreadInTurn',
        note: 'Round robin ignores server state and equalizes the number of requests handed out; least connections reads state and equalizes the work in progress, letting request totals drift apart.',
      },
      {
        concept: 'roundRobinLb',
        note: 'Least connections as a rule levels work in progress; as one policy among several it shares round robin\'s cost, sending a returning user to whichever server is idle rather than the one it used before.',
      },
    ],
  },
};
