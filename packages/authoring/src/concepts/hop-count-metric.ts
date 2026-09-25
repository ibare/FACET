/**
 * hopCountMetric 개념 선언.
 *
 * canonical facet 은 `facet:hopCountMetric` — 라우터 다섯(A–E, 선 A–B · B–E · A–C · C–D · D–E), 망
 * `172.20.0.0/16` 이 E 에 붙어 E 의 수 1. 라운드마다 수가 선 하나를 건너며 1 씩 불어나 세 라운드에 멈추고,
 * 마지막 걸음은 A 에 닿은 두 수(B 쪽 3 · C 쪽 4) 가운데 작은 3 이 남는 것을 보인다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `rip` 은 방식 넷을 끊김 위에서 견준다. 형제 `countToInfinity` 는 끊긴 뒤 수가 거꾸로 부푸는 장면이다.
 * 이쪽은 **끊김이 없는 처음 배움** — 이웃이 알린 수에 1 을 더하고 작은 쪽을 남긴다 — 하나다. definition 은
 * adds one · neighbor's advertised count · keeps the smaller · fewest crossings 를 쥐고, failure · stale ·
 * unreachable 을 쓰지 않는다.
 *
 * 전제: 동기 라운드, 망 하나, 시간 초과 · 분할 지평 · 트리거 갱신 없음. 동률은 이름이 앞선 쪽(이 예에서 일어나지
 * 않음). 이름 · 주소는 예로 정한 값.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const hopCountMetricConcept: FacetConceptSource = {
  id: 'hopCountMetric',
  label: 'Hop Count Metric (Distance Vector Learning)',
  canonicalFacet: 'facet:hopCountMetric',

  surface: {
    definition:
      'A distance-vector router learns how far a network is by adding one to each neighbor\'s advertised hop count and keeping the smaller result, so it picks its next hop by fewest crossings, not link speed.',
    exemplarKeywords: [
      'hop count',
      'RIP metric',
      'distance vector routing',
      'how RIP learns routes',
      'routing update adds one hop',
      'next hop from neighbor advertisement',
      'metric is number of routers crossed',
      'RIP ignores bandwidth',
    ],
  },

  briefing: {
    observable: [
      'Five routers A–E on links A–B, B–E, A–C, C–D, D–E; network `172.20.0.0/16` sits on E, whose count starts at 1 ("Network 172.20.0.0/16 sits directly on router E. Count: 1").',
      'One step is one round. Every router advertises from the table it held at the start of the round, so the count moves one link further from the network each round. Captions: "Round 1: each count crosses a link and gains 1. Written: 2 · dropped: 0".',
      'Round 1 writes 2 at B and D (next hop E). Round 2 writes 3 at A (via B) and C (via D); the other adverts arrive with counts no smaller than what is written and are dropped — "Written: 2 · dropped: 4".',
      'Round 3 writes nothing and drops 10: "The tables stop changing." Final counts are A 3, B 2, C 3, D 2, E 1.',
      'The last step zooms on A: "via B: 3 · via C: 4", then "At router A the smallest count stays: 3 via B". Link speed plays no part; only the number of crossings does.',
      'Rounds stand in for RIP\'s 30-second updates. One network, no timeouts, split horizon or triggered updates; ties would go to the earlier name but none occur. Names and the address are example values.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one round per step, and stops after the choice at router A.',
        'A Replay button and a playback strip sit below it. Dragging the strip back to round 2 holds the moment the count reaches A from both sides.',
        'The graph and values are fixed, so every count and caption can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces RIP and needs the reader to see a router with no map still arrive at "three hops via B" from nothing but its neighbors\' numbers plus one.',
      'A reader wonders why RIP may prefer a slow two-link path over a fast three-link one, and the article wants a router choosing purely by the smaller count.',
    ],

    avoidWhen: [
      'The article is about what happens after a link fails. No link breaks here; counts only settle.',
      'The subject is link-state routing or cost-weighted metrics such as OSPF cost or bandwidth. Every link counts as one.',
      'The point is comparing routing protocols. Only distance-vector learning appears.',
    ],

    contrastWith: [
      {
        concept: 'countToInfinity',
        note: 'Adding one to a neighbor\'s count converges when the network is intact; the same rule, applied after a failure to counts that were derived from each other, climbs without end.',
      },
      {
        concept: 'fewerHopsNotShorter',
        note: 'Hop count ranks routes by crossings alone; with weighted links the fewest-hop route can be the costlier one.',
      },
      {
        concept: 'relaxShorterPath',
        note: 'Relaxation replaces a recorded distance with a smaller one found through a neighbor — the same step a distance-vector router takes, spread over routers that each hold only their own row.',
      },
      {
        concept: 'rip',
        note: 'Learning counts from neighbors is one method; set against path-vector and link-state exchange, its weakness is how long it takes to recover when links fail.',
      },
    ],
  },
};
