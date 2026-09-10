/**
 * twoColorConflict 개념 선언.
 *
 * canonical facet 은 `facet:twoColorConflict` — 정점 다섯의 고리를 한 줄로 펴고
 * 닫는 변만 아래로 활처럼 걸어, 두 색을 번갈아 칠하다 그 활의 한가운데에서
 * 부딪히는 것을 보이는 조각(piece)이다. 길이가 홀수라는 것이 충돌의 원인이다.
 *
 * 묶음 안에서의 자리 — 그래프 조각 넷 가운데 이것만 **정점에 값을 매기는 일**을
 * 다룬다. 나머지 셋은 어디에 닿는가 · 어디까지 닿는가를 다룬다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const twoColorConflictConcept: FacetConceptSource = {
  id: 'twoColorConflict',
  label: 'Two-Colour Conflict on an Odd Cycle',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:twoColorConflict',

  surface: {
    definition:
      'Alternating two colours along a cycle returns to the starting colour only when the cycle has even length, so an odd cycle forces two neighbours to share one.',
    exemplarKeywords: [
      'bipartite graph',
      'two-colouring',
      'graph colouring',
      'odd cycle',
      'is this graph bipartite',
      'splitting into two sides',
      'parity of a cycle',
      'adjacent vertices must differ',
      'two teams from one network',
      'conflict graph',
      'scheduling into two slots',
    ],
  },

  briefing: {
    observable: [
      'Five vertices stand in a row and the edge that closes the cycle is hung below them as one long arc, so the ring is unrolled while the links stay the same.',
      'Paint travels along an edge and is absorbed by the next vertex, flipping between the two colours at every step; a vertex with no colour yet is a dashed outline with no fill.',
      'One edge is left when the row is finished — the arc below — and the two colours approach each other from its two ends and recoil where they meet at its middle.',
      'The conflicting edge thickens and turns to the warning colour, and the caption names both of its endpoints and states that this edge cannot hold.',
      'The closing caption gives the length of the ring and its parity as the reason, rather than only reporting the collision.',
      'The colour of a vertex is its value here — progress is shown by a grey cursor ring and by the weight of the edges already crossed, not by the fills.',
    ],

    screen: {
      affordances: [
        'The screen paints the whole ring on its own and stops with the failing edge marked.',
        'Two buttons: Replay, and a step control that repaints from the start one move at a time, which is how a reader can stop on the last edge before the two colours meet.',
        'The ring is fixed at five vertices, and the starting vertex and the first colour are fixed too, so the article can state that the outcome does not depend on either.',
      ],
    },

    useWhen: [
      'The article states that a graph is two-colourable exactly when it contains no odd cycle, and the reader has only the sentence. Two colours meeting head-on at the closing edge is where the claim becomes forced rather than asserted.',
      'The reader is being shown a two-colouring check and needs to see what failure looks like — a run that succeeds proves nothing about why the check exists.',
      'The prose needs the reader to feel that with two colours there is no choice to make: fixing one vertex fixes every other, so the last edge either works or the graph is not two-colourable.',
    ],

    avoidWhen: [
      'The subject is colouring with three or more colours, or the chromatic number in general. Two paints and no freedom of choice is the whole premise here.',
      'The article is about even cycles, matching between two given sides, or a graph already presented as bipartite. Only the failing case is ever run.',
      'The point is detecting a cycle in the first place, or how a traversal discovers one. The ring is given from the start.',
      'The word "colouring" in the article refers to rendering, palettes, syntax highlighting or any visual styling.',
    ],

    contrastWith: [
      {
        concept: 'markVisitedOrLoop',
        note: 'Both are about a walk that comes back to where it began — there the return would repeat work forever, here it returns carrying a value that contradicts the one already there.',
      },
      {
        concept: 'cycleBlocksOrder',
        note: 'Two things a cycle can make impossible: an ordering of the vertices in one case, an assignment of two values in the other, and only the odd-length ones break this one.',
      },
      {
        concept: 'separateComponents',
        note: 'Both walk a graph and stop at a wall, but one is stopped by a missing edge and the other by an edge that is present and cannot be satisfied.',
      },
    ],
  },
};
