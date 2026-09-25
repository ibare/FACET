/**
 * shortestPathTree 개념 선언.
 *
 * canonical facet 은 `facet:shortestPathTree` — 지도(라우터 다섯 A–E, 선 여섯 A–B 3 · B–C 4 · C–D 6 · D–E 2 ·
 * A–E 2 · B–D 5)를 모두가 한 벌씩 쥔 뒤, 뿌리 A 의 나무와 뿌리 E 의 나무를 차례로 세우고 둘의 갈린 선을 보인다.
 * 걸음 다섯, 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 형제 `linkStateFlood` 는 지도가 퍼지는 장면, 이쪽은 **같은 지도에서 뿌리마다 다른 나무 · 다른 첫 홉**이다.
 * cs-fundamentals `dijkstra` 가 셈의 차례(확정해 가는 걸음)를 쥐므로 이쪽은 그 차례를 걸음으로 삼지 않는다 —
 * definition 은 identical map · rooted at itself · different roots · first hop 을 쥐고, settle · relax · priority
 * queue 를 쓰지 않는다. OSPF 토픽이 `rip` 에 합쳐져 OSPF 검색이 여기에도 닿게 둔다.
 *
 * 전제: 비용은 예로 정한 값 · 방향 없음. 지도가 퍼지는 과정은 그리지 않는다. 동률은 이름 앞선 부모(이 지도에서
 * 일어나지 않음). OSPF 의 영역 · 인터페이스 비용 · ECMP 는 뺐다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const shortestPathTreeConcept: FacetConceptSource = {
  id: 'shortestPathTree',
  label: 'Shortest-Path Tree per Router (Link State)',
  canonicalFacet: 'facet:shortestPathTree',

  surface: {
    definition:
      'Link-state routers hold an identical map, yet each computes its own lowest-cost tree rooted at itself, so different roots keep different links and send traffic toward different first hops.',
    exemplarKeywords: [
      'shortest path tree',
      'SPF tree',
      'OSPF SPF calculation',
      'each router runs Dijkstra from itself',
      'same topology different routes',
      'link state database',
      'first hop in the forwarding table',
      'routing tree per router',
    ],
  },

  briefing: {
    observable: [
      'The map shows five routers A–E and six links with costs A–B 3, B–C 4, C–D 6, D–E 2, A–E 2, B–D 5 ("Routers: 5 · Links: 6"). Next, each router holds an identical copy ("Every router holds the same map. Copies: 5").',
      'Below, a tree stands on its root; each router\'s height is its distance from the root, so the rise of a tree link equals its cost. Root A gives distances A 0, B 3, C 7, D 4, E 2 with links A–B, A–E, B–C, D–E ("Tree links: 4 of 6").',
      'Moving the root to E, the copy slides over and regrows: A 2, B 5, C 8, D 2, E 0 with links A–B, A–E, C–D, D–E.',
      'The last step marks the difference: "Only in tree A: B–C · only in tree E: C–D · in neither: B–D". The split is at C — from A, A-B-C costs 7 against 10 via E and D; from E, E-D-C costs 8 against 9 via A and B.',
      'Each tree uses four of the six links; the other two are of no use to that root. What goes into a forwarding table is the first hop: A sends toward B for B and C and toward E for D and E; E sends toward A for A and B and toward D for C and D.',
      'Costs are example values, undirected, one per link. How the map is spread is not drawn, and the order in which Dijkstra settles routers is not shown as steps — one step is one whole tree. Areas and equal-cost multipath are left out.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself over five steps — map, copies, tree from A, tree from E, differing links — and stops.',
        'A Replay button and a playback strip sit below it. Dragging between the two tree steps shows the same map regrowing into a different tree.',
        'The map and costs are fixed, so the distances 7 and 8 to C and the differing links can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article says every OSPF router holds the same link-state database and needs to show why they nonetheless route differently.',
      'A reader confuses the network map with a router\'s routes, and the article wants two trees from one map with the links that only one of them uses.',
    ],

    avoidWhen: [
      'The article teaches Dijkstra\'s algorithm step by step. Settling order and tentative distances are not shown; each tree appears whole.',
      'The subject is spanning tree protocol in Ethernet switches. These are per-router routing trees, not a loop-free switch topology.',
      'The point is minimum spanning trees. Each tree minimises cost from its root, not total link weight.',
    ],

    contrastWith: [
      {
        concept: 'dijkstra',
        note: 'Dijkstra is the procedure that builds a shortest-path tree from one source; the routing claim is that every router runs it from itself on the same map and reaches different trees.',
      },
      {
        concept: 'linkStateFlood',
        note: 'Flooding is what makes the maps identical; the trees are what make the routes differ.',
      },
      {
        concept: 'rip',
        note: 'Per-router trees are the computation behind link-state routing; the protocol comparison weighs that approach against distance and path vectors under failure.',
      },
    ],
  },
};
