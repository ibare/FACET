/**
 * growOneTree 개념 선언.
 *
 * canonical facet 은 `facet:growOneTree` — 조각이다. 위는 정점 다섯 · 간선 여섯의
 * 그림, 아래는 간선마다 칸 하나가 세 줄(나무 / 고를 수 있다 / 고를 수 없다) 사이를
 * 오르내리는 칸판이다. 셋째 걸음에서 무게 4 를 고르는데 무게 2 짜리가 아직
 * 아래 줄에 있고, 그 간선은 다음 걸음에 올라와 곧바로 골라진다. 끝은 간선 넷 · 합 9.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `primMst` 가 절차 전체(key 배열 · 합 · 코드)를 맡으므로, 이 조각의
 * definition 은 **후보 집합**에 무게중심을 둔다 — 무엇이 고를 수 있는 것인가,
 * 그리고 그것이 간선의 성질이 아니라 지금 나무의 성질이라는 것. definition 에
 * "minimum spanning tree" 도 "Prim" 도 넣지 않았다. 넣는 순간 완제품과 벡터가
 * 붙고, 검색이 둘 중 어느 쪽인지 답하지 못한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const growOneTreeConcept: FacetConceptSource = {
  id: 'growOneTree',
  label: 'Growing One Tree (What Counts as a Candidate Edge)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:growOneTree',

  surface: {
    definition:
      'The candidate rule for a tree grown one vertex at a time: only an edge with exactly one endpoint inside it may be taken, so which edges are eligible changes after every attachment.',
    exemplarKeywords: [
      'frontier edges',
      'edges leaving the tree',
      'not the lightest edge in the whole graph',
      'boundary of the grown part',
      'why was that cheap edge skipped',
      'one endpoint in, one endpoint out',
      'the candidate set changes each step',
      'grow from a starting vertex',
    ],
  },

  briefing: {
    observable: [
      'The graph sits on top with five vertices; the tree begins as a single vertex and each chosen edge is drawn growing outward from the end that is already in the tree, with a ring spreading at the vertex that joins.',
      'A board underneath gives every edge a fixed column and a single chip, and the chip rides between three lanes — in the tree, can be picked, cannot — so a step reads as chips moving up and down rather than as new drawings appearing.',
      'At the third step an edge of weight 4 is taken while an edge of weight 2 is still on the board, sitting in the bottom lane because neither of its ends touches the tree yet; the caption states both of those facts together.',
      'That same edge rises into the pickable lane on the very next step and is taken at once, so its earlier exclusion is shown to have been about timing rather than about weight.',
      'An edge whose two ends both end up inside the tree drops into the bottom lane as well, and never comes back up.',
      'The run finishes with four edges in the tree and a total weight of 9.',
    ],

    screen: {
      affordances: [
        'The tree grows by itself from vertex A after mount and stops once every vertex has joined, leaving the final lane arrangement on the board.',
        'Two buttons: Replay, and a step control — the way to hold the moment where the lightest edge visible on the board is not the one being taken.',
        'The graph and the starting vertex are fixed, so an article can name the step where 4 wins over 2 and expect the reader to find it.',
      ],
    },

    useWhen: [
      'The prose says the method takes the cheapest edge, and a reader will hear that as the cheapest edge in the picture. The step that takes 4 while 2 lies unused is the correction, and a qualifying clause does not do the same work as watching it happen.',
      'A section is really about what a candidate set is: eligibility here is a property of the current tree, not of the edge, which is why the same edge is forbidden at one step and taken at the next.',
      'The reader suspects a mistake — an obviously cheap edge was passed over — and needs to see it picked up one step later before accepting that nothing was lost.',
      'A passage needs the boundary itself as an object: the middle lane is the set of edges crossing between what is inside and what is outside, redrawn after every attachment.',
    ],

    avoidWhen: [
      'The subject is the proof that growing this way gives the smallest possible total. This screen assumes correctness and shows only which edges were available.',
      'The article is about how the lightest candidate is found — a heap, an array of per-vertex values, or the running time that follows from the choice.',
      'Ties matter to the article\'s example. Equal weights here are settled silently by the order the edges happen to be listed in, and that rule is never shown.',
      'The article uses "tree" for a hierarchy of files, records or a search structure. The tree here is a growing subgraph of a weighted graph.',
      'The subject is a spanning tree assembled by merging many separate pieces, where there is no single boundary to speak of.',
    ],

    contrastWith: [
      {
        concept: 'primMst',
        note: 'The one property against the full procedure: the per-vertex values, the running total and the source code belong there, while what makes an edge eligible right now is isolated here.',
      },
      {
        concept: 'sortEdgesAvoidCycle',
        note: 'The other route to the same tree — that one sorts every edge once and asks whether an edge joins two different pieces, this one asks each step which edges leave the single piece it has.',
      },
      {
        concept: 'takeBestNow',
        note: 'Both take the best option available at the moment, but the interesting part here is not the choosing; it is that the set of options is rebuilt after each step.',
      },
      {
        concept: 'separateComponents',
        note: 'Both turn on which vertices are inside one connected piece; here that membership is what decides whether an edge can be used at all.',
      },
    ],
  },
};
