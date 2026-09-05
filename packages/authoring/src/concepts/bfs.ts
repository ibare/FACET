/**
 * bfs 개념 선언.
 *
 * canonical facet 은 `facet:bfs` — 그래프 캔버스 + 프론티어 큐 + 거리 표시 + 코드 패널.
 *
 * 진행 모델은 coroutine 이라 재생·단계·일시정지·속도로 관람한다. 같은 거리의 정점을
 * 한 프레임에 동시 점등하는 `layer-discovered` 집합 이벤트가 이 시각화의 핵심이며,
 * 그래서 "한 개씩 방문한다" 가 아니라 "한 층이 한꺼번에 켜진다" 로 보인다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bfsConcept: FacetConceptSource = {
  id: 'bfs',
  label: 'Breadth-First Search',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:bfs',

  surface: {
    definition:
      'A graph traversal that visits every vertex at distance k from the source before any vertex at distance k+1, using a queue as its frontier.',
    exemplarKeywords: [
      'BFS',
      'breadth-first search',
      'shortest path in an unweighted graph',
      'level order traversal',
      'frontier',
      'distance from the source',
      'friend of a friend',
      'flood fill',
      'web crawling',
      'six degrees of separation',
    ],
  },

  briefing: {
    observable: [
      'Vertices at the same distance ignite together in a single frame, so the search reads as a wavefront expanding outward rather than as one-by-one visits.',
      'The queue beside the graph is the frontier itself — vertices enter at one end as they are discovered and leave at the other as they are expanded, and the belt empties exactly when the search ends.',
      'Each vertex carries its distance from the source once discovered, and that number never changes afterwards.',
      'Edges light up as they are scanned, including the ones that lead to already-visited vertices — the scan count grows faster than the visited count, and the gap is the cost of checking.',
      'Three counters run along: vertices visited, layers completed, edges scanned.',
      'The code panel highlights the running phase in step with the animation — dequeue a vertex, scan its neighbours, discover a layer, complete the layer.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset, and a speed slider. Stepping once advances one phase, which is the way to watch a single layer ignite.',
        'The code panel starts empty. The reader clicks "+ Add language" and picks from Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side.',
        'Swapping the frontier queue for a stack is what turns this into depth-first search — the belt on screen is the whole difference, and it is worth pointing at.',
      ],
    },

    avoidWhen: [
      'The article is about weighted shortest paths (Dijkstra, A*). This traversal treats every edge as cost 1 and its layer structure would misrepresent them.',
      'The subject is depth-first traversal or backtracking. The wavefront here is the opposite shape and would work against the explanation.',
    ],

    contrastWith: [
      {
        concept: 'queueFifo',
        note: 'The frontier is a plain FIFO queue — this is where a queue stops being a data-structure exercise and becomes the thing that decides the shape of a search.',
      },
      {
        concept: 'stack',
        note: 'Swap the frontier container and breadth-first becomes depth-first. Nothing else in the algorithm changes.',
      },
    ],
  },
};
