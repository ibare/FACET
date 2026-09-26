/**
 * spreadInTurn 개념 선언.
 *
 * canonical facet 은 `facet:spreadInTurn` — 요청 아홉(r1..r9, 무게 4 · 1 · 2 · 3 · 1 · 1 · 5 · 2 · 1)이 서버 셋
 * (Server A · B · C)에 차례 표(원판의 바늘)가 가리키는 대로 간다. 바늘은 무게와 상관없이 한 칸씩 돈다.
 * 끝에 받은 수 3 · 3 · 3, 쌓인 무게 12 · 4 · 4. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `roundRobinLb` 가 방식을 갈아 끼우는 대비를 맡고, 이쪽은 **차례 표 하나만 보고 고른다**는 한 장면이다.
 * 같은 묶음의 `sendToIdlest` 는 지금 열린 연결을 보고 고르므로, 이쪽 definition 은 pointer · rotates ·
 * request size · count 쪽 낱말을 독점하고 open connections · finished 를 쓰지 않는다. 시간도 끝남도 없는 모형이다.
 *
 * 전제 (설명 글 `spreadInTurn.md`):
 *  - 무게는 "처리에 드는 일의 크기" 를 예로 정한 단위. 서버 셋은 같은 능력.
 *  - 모형에 시간 · 처리 · 끝남이 없다 — 쌓인 무게는 줄지 않는다.
 *  - 무거운 요청(4 · 3 · 5)이 셋마다 한 번씩 와서 모두 A 에 겹친 것은 데이터가 고른 경우다.
 *  - 조각 화면에 코드가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const spreadInTurnConcept: FacetConceptSource = {
  id: 'spreadInTurn',
  label: 'Round Robin Load Balancing (Turn Pointer)',
  canonicalFacet: 'facet:spreadInTurn',

  surface: {
    definition:
      'A round-robin balancer sends each request to the server its turn pointer names, then advances the pointer one place regardless of request size, so every server receives equally many requests while accumulated weight may diverge.',
    exemplarKeywords: [
      'round robin load balancing',
      'round-robin scheduling of requests',
      'rotate through servers in order',
      'next server in the list',
      'wraps back to the first server',
      'equal number of requests per server',
      'heavy requests pile up on one server',
      'round robin ignores request size',
      'stateless load balancer',
      'DNS round robin',
    ],
  },

  briefing: {
    observable: [
      'Three servers, Server A, B and C, sit around a dial whose needle is the "Turn pointer". Nine requests, `r1` to `r9`, wait under "Arriving requests"; each request\'s width is its weight: 4, 1, 2, 3, 1, 1, 5, 2, 1.',
      'At the start the caption reads "Next in turn: Server A · Waiting: 9", and every server shows "Received: 0" and "Load: 0".',
      'Each step, the front request goes to the server the needle points at and the needle turns one place: "r1 (weight 4) → Server A · Next in turn: Server B". After C the needle returns to A.',
      'The needle turns by the same angle whether the request is heavy or light, so `r1`, `r4` and `r7` land on A, `r2`, `r5`, `r8` on B, and `r3`, `r6`, `r9` on C.',
      'The Received counts never differ by more than one at any step and end at 3, 3, 3.',
      'The Load counts end at 12 for A and 4 each for B and C: the three heavy requests (weights 4, 3, 5) arrived every third place and all fell on A, and nothing on screen reacts to that gap.',
      'There is no time in this model: requests are never processed or finished, so a server\'s Load only grows. Weight is an illustrative unit of work and the three servers are equally capable.',
    ],

    screen: {
      affordances: [
        'The screen plays its ten steps by itself, the start plus one per request, and stops after `r9`.',
        'A Replay button and a playback strip sit below it. Holding the step for `r7` shows the needle moving on from A by the usual single place just after A took the heaviest request.',
        'The requests, weights and starting server are fixed, so an article can quote every caption and count exactly as it appears.',
      ],
    },

    useWhen: [
      'The reader assumes round robin divides work evenly, and the article needs a case where each server receives exactly the same number of requests yet one carries three times the work.',
      'The article explains the round-robin rule itself — the next server in a fixed cycle, wrapping at the end — and wants the pointer visible as the only input to the choice.',
    ],

    avoidWhen: [
      'The article is about CPU scheduling with time slices. These are requests handed to servers, and nothing is preempted or requeued.',
      'The subject is weighted round robin or servers of different capacity. The cycle here gives every server one turn.',
      'The point involves connections finishing or load draining over time. Nothing here ends, so load only accumulates.',
    ],

    contrastWith: [
      {
        concept: 'roundRobinLb',
        note: 'The rotation rule is blind to request size by design; weighed against other policies, that blindness becomes imbalance that grows as request durations vary, and it also scatters each user across servers.',
      },
      {
        concept: 'sendToIdlest',
        note: 'Round robin chooses from its own position in a cycle and never reads server state; least connections chooses from the servers\' current state and has no cycle at all.',
      },
      {
        concept: 'timeSliceRotate',
        note: 'Both rotate in a fixed order. A CPU round robin takes a running job back after its slice and requeues it; a request balancer hands each request off once and never takes it back.',
      },
    ],
  },
};
