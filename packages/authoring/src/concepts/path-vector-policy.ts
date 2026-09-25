/**
 * pathVectorPolicy 개념 선언.
 *
 * canonical facet 은 `facet:pathVectorPolicy` — 나는 AS64500, 목적지 `192.0.2.0/24`. 이웃 넷이 AS 줄을 보낸다.
 * 제 번호가 든 AS64504 의 길을 먼저 버리고, 남은 셋에 관계 선호(고객 200 · 동등 150 · 제공자 100)를 매겨
 * 길이 4 인 고객 길을 고른다. 길이만 봤다면 길이 2 인 제공자 길이었을 것 — 그 길은 셋 중 꼴찌. 걸음 다섯.
 *
 * ── 묶음 안에서의 자리
 *
 * 카탈로그에서 bgp 토픽이 `rip` 완제품에 합쳐졌는데, 완제품의 경로 벡터는 고리 거르기만 쓴다. **BGP 의 정책(선호)
 * 주장은 이 조각에만 남는다.** 그래서 BGP 검색 낱말(local preference · AS path · Gao-Rexford 관계)을 여기 둔다.
 * definition 은 own AS number · relationship preference · customer over peer over provider · before path length 를
 * 독점한다.
 *
 * 전제: AS 번호 · 주소는 문서용 대역, 선호 값은 예로 정한 값. MED · 출처 종류 등 뒤 단계는 줄였다. 고른 길을 다시
 * 알리는 일은 그리지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pathVectorPolicyConcept: FacetConceptSource = {
  id: 'pathVectorPolicy',
  label: 'BGP Path Selection (Loop Rejection and Policy)',
  canonicalFacet: 'facet:pathVectorPolicy',

  surface: {
    definition:
      'A BGP speaker receiving several AS paths to one prefix first discards any path containing its own AS number, then ranks the rest by neighbor relationship — customer over peer over provider — before path length.',
    exemplarKeywords: [
      'BGP best path selection',
      'AS path',
      'local preference',
      'path vector routing',
      'BGP loop prevention',
      'customer peer provider relationships',
      'Gao-Rexford',
      'why BGP does not choose the shortest path',
      'interdomain routing policy',
      'autonomous system',
    ],
  },

  briefing: {
    observable: [
      'At the top: "Me · AS64500 · Destination · 192.0.2.0/24", then "Waiting for paths from the neighbors."',
      'Four paths arrive, each tagged with the neighbor\'s relationship: Provider `64501 64510`, Customer `64502 64505 64507 64510`, Peer `64503 64508 64510`, Peer `64504 64500 64510` ("Paths received: 4").',
      'The path from AS64504 contains 64500 and is moved to a Discarded area: "Own number AS64500 in the path from AS64504: a loop, dropped. · Paths left: 3".',
      'Each remaining path receives a preference from its relationship — Customer 200, Peer 150, Provider 100 ("Each path gets a preference from the relationship with its neighbor.") — and they line up in that order.',
      'The end reads "Chosen: AS64502 — preference 200 · length 4 · Shortest: AS64501 — length 2 · place 3/3": the longest surviving path wins, and the shortest one ranks last.',
      'AS numbers and the prefix come from documentation ranges; preference values are examples set by an operator in practice. Later tie-breakers such as origin type and MED are left out, and the chosen path is not re-advertised on screen.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself over five steps — waiting, arrival, loop rejection, preference, choice — and stops.',
        'A Replay button and a playback strip sit below it. Dragging back to the preference step holds the moment the ordering stops following length.',
        'The paths and values are fixed, so "length 4 over length 2" can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article says BGP does not pick the shortest path, and needs a four-hop customer route beating a two-hop provider route by preference.',
      'The article explains how carrying the whole AS path lets a router spot and drop a looped route before any comparison.',
    ],

    avoidWhen: [
      'The subject is BGP session setup, route reflectors, iBGP or communities. Only one router\'s choice among received paths is shown.',
      'The article is about BGP hijacking or RPKI origin validation. Every received path here is taken at face value.',
      'The point is interior routing convergence after a failure. No link fails and nothing is recomputed over rounds.',
    ],

    contrastWith: [
      {
        concept: 'hopCountMetric',
        note: 'A distance-vector router prefers the smaller number and nothing else; a BGP speaker ranks by relationship first and consults length only on a tie.',
      },
      {
        concept: 'countToInfinity',
        note: 'Distance vectors cannot tell that a count was derived from their own; a path vector names every AS it crossed, so a route through oneself is recognised and dropped at once.',
      },
      {
        concept: 'rip',
        note: 'Carrying full paths is enough to stop routing loops; the preference ordering is a separate business decision layered on top.',
      },
    ],
  },
};
