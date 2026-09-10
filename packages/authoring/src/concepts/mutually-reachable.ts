/**
 * mutuallyReachable 개념 선언.
 *
 * canonical facet 은 `facet:mutuallyReachable` — 정점 다섯 · 방향 간선 여섯의
 * 그래프에서 두 정점을 짚어 **양쪽 방향을 따로 물어** 본 뒤에 판정하는 조각이다.
 * 갈 수 있으면 토큰이 길을 타고 움직이고, 갈 길이 없으면 닿는 곳으로 얼룩이
 * 번지다 점선 벽이 닫힌다. 마지막에 정점들이 실제로 자리를 옮겨 무리끼리 갈라선다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `scc` 는 같은 분할을 **한 번의 깊이 우선 순회와 두 수(num · low)** 로
 * 셈해 내는 절차 전체를 말한다. 이 조각의 무게중심은 그 앞 — **무엇을 한 무리라
 * 부르는가** 하는 판정 조건 — 이고, 알고리즘 어휘(low-link · 스택 · 타잔)를
 * definition 에도 keywords 에도 넣지 않아 둘을 갈랐다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const mutuallyReachableConcept: FacetConceptSource = {
  id: 'mutuallyReachable',
  label: 'Mutually Reachable (Both Ways or Not a Group)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:mutuallyReachable',

  surface: {
    definition:
      'Two vertices count as one group only when travel works in both directions; a route out with no route back leaves them in separate groups however short the one-way trip is.',
    exemplarKeywords: [
      'both directions',
      'is there a way back',
      'one-way street',
      'round trip between two vertices',
      'reachable but not returnable',
      'why a directed graph splits into groups',
      'mutual reachability',
      'crossing with no way back',
      'grouping by two-way travel',
    ],
  },

  briefing: {
    observable: [
      'A checker at the top holds two cells, one per direction, and the pair is judged only after both have been answered — the second question is asked even when the first succeeded.',
      'When a route exists a token actually travels along the edges and the path it took stays lit, so the answer is a journey rather than a verdict.',
      'When no route exists nothing travels. Instead a stain spreads outward to everything the starting vertex can reach, a dashed wall closes around it, and the rest of the graph dims.',
      'That wall is the reason the failure is informative: it shows not only that this one trip is impossible but the whole region from which there is no exit.',
      'Two successful directions grow a band joining the checker cells; one blocked direction cracks them apart and pushes them away from each other.',
      'The vertices begin in a single row where no grouping is apparent, and at the end they physically move — the ones that can reach each other gather, and the groups slide to opposite sides of the frame.',
      'One edge is left crossing the empty space between the separated groups, and it carries an arrowhead at one end only.',
      'The closing caption counts the groups, the edges running between them, and how many of those have no partner going the other way.',
      'Not every pair gets asked. Once a group is settled the later questions go to one representative of it, and a region shown to be sealed off is dropped from the candidates altogether.',
    ],

    screen: {
      affordances: [
        'The screen works through the pairs on its own and ends with the vertices rearranged into their groups.',
        'Two buttons: Replay, and a step control for taking one probe at a time, which is how a reader can stop after the outward trip and before the return trip is attempted.',
        'The graph is fixed at five vertices and six edges, so an article can name the pair that turns out one-way and the single edge left spanning the gap at the end.',
      ],
    },

    useWhen: [
      'The article groups things in a directed graph and a reader takes "connected" to mean the same as it does without arrows. Asking the return trip separately, and watching it fail, is the correction.',
      'The prose needs the consequence of the split rather than the split itself — that once you cross the one remaining edge you cannot come back. The vertices moving apart with a single one-way link across the gap says that without any accompanying claim.',
      'A reader needs to know why a failed search is not wasted effort. The stain filling a region and sealing itself is a result about every vertex inside it, not just about the pair being asked.',
      'The article is about to introduce a method that computes this grouping cheaply, and the definition it computes has to be settled first, in its own terms.',
    ],

    avoidWhen: [
      'The graph is undirected. Then reachability holds both ways for free and there is nothing to check.',
      'The subject is finding these groups efficiently on a large graph — the depth-first bookkeeping, the numbering, the edge-reversing pass. Pairs are asked one at a time here, on purpose.',
      'The article uses "reachable" in the memory sense: objects a garbage collector can still get to from a root.',
      'The topic is network reachability between hosts, routing tables or ping succeeding in one direction through a firewall.',
      'The point is the shortest route between two vertices, or how many hops it takes. Only the existence of a route is ever at issue here.',
      'The article needs a transitive closure computed and stored — a table saying for every pair whether a route exists. The screen stops as soon as the grouping is decided.',
    ],

    contrastWith: [
      {
        concept: 'scc',
        note: 'This asks the defining question outright, one pair at a time; the full method arrives at the same groups in a single walk, where the question itself is no longer visible.',
      },
      {
        concept: 'oneWayEdge',
        note: 'One arrow removing the way back is the ingredient; this is the consequence for whole sets of vertices once those arrows are combined.',
      },
      {
        concept: 'separateComponents',
        note: 'Without arrows a single search from any vertex settles its entire group, which is exactly the shortcut that fails here — a search can leave a group and be unable to return.',
      },
      {
        concept: 'bfs',
        note: 'Both trace which vertices can be reached from a starting point; here the exploration is only ever a means of answering whether a return trip exists.',
      },
    ],
  },
};
