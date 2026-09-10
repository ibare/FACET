/**
 * primMst 개념 선언.
 *
 * canonical facet 은 `facet:primMst` — 완결형이다. 그래프(자라는 덩이) · key 줄 ·
 * 붙은 차례 세 켜에 카운터 셋(훑기 · 줄임 · 붙인 간선)과 여섯 언어로 펼쳐지는
 * 코드 패널(`ir:prim-grow`)이 붙는다. 정점 일곱 · 간선 열하나 · 출발 0 · 합 39.
 * 우선순위 큐 없이 배열을 매 회 훑는 판이라 다익스트라와 한 줄만 다르다.
 *
 * ── 묶음 안에서의 자리
 *
 * 짝인 조각 `growOneTree` 와 갈리는 지점을 definition 에 박았다.
 *
 *   여기         **절차 전체와 그 산출** — 한 정점에서 시작해 경계의 최소
 *                간선을 되풀이해 붙이고, 정점마다 key 하나를 들고 있는다.
 *   growOneTree  그중 **후보 집합의 성질** — 고를 수 있는 것이 경계에 달려 있고
 *                걸음마다 달라진다는 것 하나.
 *
 * keywords 도 갈랐다 — 여기는 MST · key 배열 · 자르기 성질 · 밀집 그래프 같은
 * 알고리즘 어휘를, 조각은 경계 · 후보 · "왜 저 싼 간선을 지나쳤나" 를 맡는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const primMstConcept: FacetConceptSource = {
  id: 'primMst',
  label: 'Prim (Minimum Spanning Tree by Growing One Tree)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:primMst',

  surface: {
    definition:
      'A minimum spanning tree method that starts from one vertex and repeatedly attaches the lightest edge leaving the tree, keeping one cheapest-crossing-edge value per vertex.',
    exemplarKeywords: [
      'Prim',
      'minimum spanning tree',
      'MST',
      'key array',
      'cut property',
      'cheapest cabling to connect every site',
      'dense graph O(V^2)',
      'spanning tree total weight',
      'connect all nodes at minimum cost',
    ],
  },

  briefing: {
    observable: [
      'Three layers share the frame: the graph with a pale blob drawn around the vertices already in the tree, a row of key values where ∞ marks the vertices nothing reaches yet, and a row listing the edges taken in order with the running total on the right.',
      'Edges are drawn three ways — thick for those already in the tree, solid orange for those crossing the boundary right now, faint dashed for the rest — and the orange set shifts every time the blob grows.',
      'Each round walks the key row position by position, marking the smallest key outside the tree as it goes; only after the walk finishes is the vertex attached.',
      'Attaching a vertex is followed by examining every edge leaving it, and the keys that get a lighter way in are visibly lowered while the rest are left alone.',
      'The layout places vertices by their distance from the start, so the blob grows from left to right and the order of attachment reads across the frame.',
      'Counters track scans, keys lowered and edges taken; the scan counter climbs much faster than the others, because every round walks the whole array whatever the graph looks like.',
      'The edge of weight 5 between vertices 2 and 4 is taken only in the sixth round, once the tree has reached vertex 4, and the total settles at 39 over six edges.',
      'The code panel highlights the line matching the current step, and the loop that hunts for the smallest key is written out in full rather than hidden inside a data structure.',
    ],

    screen: {
      affordances: [
        'Playback controls: play, step, pause, reset and a speed selector. Stepping is how a reader can follow one scan across the key row, position by position, before anything is attached.',
        'The graph is fixed at seven vertices, eleven edges and vertex 0 as the start, so prose can name the order 0-3, 3-5, 0-1, 1-4, 4-2, 4-6 and the total of 39.',
        'The code panel starts empty with a button for adding a language; one or two of the six can be shown side by side.',
      ],
    },

    useWhen: [
      'The article places this next to shortest paths and claims the two differ by one line. The skeleton on screen is scan, attach, then update the neighbours, and the key row is where the difference in what the stored number means becomes visible.',
      'A reader needs the per-vertex bookkeeping made concrete — what a key holds, when it drops, and why one walk of the array per round is enough to pick the next edge.',
      'The prose needs the result as a committed sequence of edges with a running total, in the order they were taken, rather than as an assertion that some minimum exists.',
      'A passage argues that the simple array scan is a defensible choice rather than a naive one; the scan counter against the attach counter is the trade being made, in numbers.',
      'The article needs a case where an edge that is cheap overall waits several rounds before it can be taken, and the reason has to be traceable in the key row rather than asserted.',
    ],

    avoidWhen: [
      'The article means a spanning tree produced by a depth-first or breadth-first traversal, where edge weights play no part at all.',
      'The subject is the heap-based variant and the complexity that follows from it; the loop here scans the array every round on purpose and no priority queue appears.',
      'The topic is shortest paths from a source. The number kept per vertex here is the weight of one edge, not a distance accumulated along a path.',
      'The article uses "minimum spanning tree" as a step inside clustering, image segmentation or a network layout heuristic and needs that application rather than the mechanics.',
      'Multiple minimum spanning trees and how ties are broken are the point; the tie rule here is fixed and this particular graph has a single answer.',
    ],

    contrastWith: [
      {
        concept: 'growOneTree',
        note: 'The procedure against the one property inside it — the key array, the bookkeeping and the total belong here, while what makes an edge eligible at a given moment is isolated there.',
      },
      {
        concept: 'kruskalMst',
        note: 'Both reach the same total by the same cut property, but this keeps a single growing tree and that keeps many pieces and merges them in weight order.',
      },
      {
        concept: 'dijkstra',
        note: 'The outer skeleton is the same and one comparison differs: a single edge weight here, a distance accumulated from the source there, which changes what tree comes out.',
      },
      {
        concept: 'pickNearestUnsettled',
        note: 'Both settle one vertex per round by taking the smallest value on the frontier; the values being compared are edge weights here and path lengths there.',
      },
    ],
  },
};
