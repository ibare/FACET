/**
 * separateComponents 개념 선언.
 *
 * canonical facet 은 `facet:separateComponents` — 정점 여덟이 한 줄로 서고 간선
 * 여섯이 그 사이를 잇는다. 한 번의 탐색이 끝나도 꺼진 정점이 남고, 남은 것에서
 * 새로 출발하기를 되풀이해 덩어리 셋(크기 3 · 2 · 3)이 드러나는 조각(piece)이다.
 * 출발선에 찍히는 도장의 수가 곧 덩어리 수다.
 *
 * 묶음 안에서의 자리 — 그래프 조각 넷 가운데 이것만 **탐색을 몇 번 시작해야
 * 하는가**를 다룬다. 간선에 방향도 무게도 없고, 색칠도 하지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const separateComponentsConcept: FacetConceptSource = {
  id: 'separateComponents',
  label: 'Separate Components (One Search Is Not Enough)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:separateComponents',

  surface: {
    definition:
      'A single traversal reaches only the vertices linked to its starting point, so covering a whole graph takes one fresh start for every vertex left unvisited.',
    exemplarKeywords: [
      'connected components',
      'disconnected graph',
      'how many groups',
      'counting islands',
      'flood fill regions',
      'restart the search',
      'outer loop over unvisited vertices',
      'component size',
      'clusters in a friendship network',
      'unreachable part of a network',
    ],
  },

  briefing: {
    observable: [
      'Eight vertices stand in a row with arcs drawn between the linked ones; where no arc is drawn the row simply has a gap, and that gap is what the light never crosses.',
      'A spark rises from a ground line into a vertex and spreads along the arcs, lighting each vertex it reaches and each arc whose two ends are both lit.',
      'A search ends while other vertices are still dark, and they wobble once and stay exactly where they are while the screen holds on that state before anything else happens.',
      'Every new start leaves a numbered stamp on the ground line, so the row of stamps accumulating is the count the screen is arguing for.',
      'Each group lights in its own colour, so the finished picture separates the groups by colour rather than by position.',
      'The closing caption gives the number of starts together with the size of each group — three starts, sizes three, two and three.',
    ],

    screen: {
      affordances: [
        'The screen runs every search on its own, holding noticeably longer at the end of each one than between ordinary steps.',
        'Two buttons: Replay, and a step control that re-walks the whole sweep one move at a time, which is how the pause on the unlit vertices can be held indefinitely.',
        'The graph is fixed at eight vertices and six edges, and the vertex order fixes where each new search begins, so the article can name the starting vertex of each group.',
      ],
    },

    useWhen: [
      'The reader has watched a traversal terminate normally and reads the vertices left behind as a bug in the traversal. Seeing the search stop, hold, and then need a second launch re-reads it as a fact about the graph.',
      'The article needs the number of groups to come from somewhere concrete. Here it is the number of times a search had to be started, not a tally kept on the side.',
      'The prose has been treating "the graph" as one object and now needs it to be several. The unlit vertices sitting there after a complete search are that division made visible.',
    ],

    avoidWhen: [
      'The graph in the article is stated to be connected. Nothing would stay dark and the screen would make a distinction that does not arise.',
      'The subject is the order a traversal visits vertices in, or breadth against depth. The boundary here is fixed by the edges and is identical whichever order is used.',
      'The point is grouping elements by merging pairs as they arrive, without ever walking the graph.',
      'The article means "component" as a software module, a UI component, or the principal components of a dataset.',
    ],

    contrastWith: [
      {
        concept: 'unionFind',
        note: 'Two ways to answer which vertices belong together — one walks the edges from a start and repeats, the other merges pairs as they arrive and never traverses at all.',
      },
      {
        concept: 'bfs',
        note: 'A single traversal is the inner loop here; what this adds is the outer loop that notices the traversal finished early and starts again.',
      },
      {
        concept: 'oneWayEdge',
        note: 'Both end with a vertex the search never lit, but here no edge leads there at all, while there the edge exists and points the wrong way.',
      },
    ],
  },
};
