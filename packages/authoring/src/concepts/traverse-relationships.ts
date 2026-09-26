/**
 * traverseRelationships 개념 선언.
 *
 * canonical facet 은 `facet:traverseRelationships` — 노드 아홉(Person 여섯 · Company 셋) · 이음 열둘의 그래프에서 "Ana 의
 * 친구들이 일하는 회사" 를 찾는다. 홉 1 에 Ana 가 쥔 이음 셋을 보고 `FRIEND` 둘을 건너 Ben · Cho, 홉 2 에 Ben · Cho 가 쥔
 * 이음을 보고 `WORKS_AT` 하나씩을 건너 Acme · Zeta. 본 이음 7 / 12 · 건넌 이음 4 · 닿은 노드 5 / 9. Dan · Eva · Fay · Nova 는
 * 한 번도 건드려지지 않는다. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `graphDb` 는 이음을 노드가 쥐느냐 표 한 장에 두느냐를 손잡이로 세우고 홉마다 읽는 양을 견준다. 이쪽은 **길 하나를
 * 따라 건너가는 장면** — 종류가 맞는 이음만 건너고, 길이 닿지 않은 곳은 건드리지 않는다 — 을 쥔다. 그래서 definition 은
 * typed path · relationship type · outgoing edges of each reached node · untouched 를 독점하고, 완제품이 쥔 edge table ·
 * rescanned · per hop cost · k-hop 을 쓰지 않는다.
 *
 * 전제 (설명 글 `traverseRelationships.md`): 자료는 예로 정한 것 · 나가는 이음만 따른다 · 노드마다 쥔 이음의 차례는 자료의
 * 차례 · 같은 노드에 두 번 닿으면 한 번만 센다(이 자료에서는 일어나지 않는다) · 쿼리 언어 글은 두지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const traverseRelationshipsConcept: FacetConceptSource = {
  id: 'traverseRelationships',
  label: 'Graph Traversal Along Typed Relationships',
  canonicalFacet: 'facet:traverseRelationships',

  surface: {
    definition:
      'A graph database answers a typed path such as FRIEND then WORKS_AT by expanding only the outgoing edges each reached node holds and crossing those of the requested type, leaving the rest of the graph untouched.',
    exemplarKeywords: [
      'graph traversal query',
      'path pattern matching',
      'relationship types',
      'Cypher MATCH pattern',
      'friends\' employers query',
      'labeled property graph',
      'following relationships',
      'Neo4j traversal',
      'local graph query',
    ],
  },

  briefing: {
    observable: [
      'Nine nodes — Person: Ana, Ben, Cho, Dan, Eva, Fay; Company: Acme, Zeta, Nova — and twelve directed edges typed `FRIEND` or `WORKS_AT`. The path is shown as two labelled legs, "FRIEND · Hop 1" and "WORKS_AT · Hop 2", with "Start: Ana · path: FRIEND → WORKS_AT". Three counters: "Edges looked at 0 / 12", "Edges crossed 0", "Nodes reached 1 / 9".',
      'Step 1: "Hop 1 · Ana — edges held: 3 · FRIEND crossed: 2 → Ben, Cho". Ana\'s `WORKS_AT` edge to Nova is looked at but not crossed, so Nova is not reached.',
      'Steps 2 and 3 expand Ben, then Cho, in the order they were reached: "Hop 2 · Ben — edges held: 2 · WORKS_AT crossed: 1 → Acme" and "Hop 2 · Cho — edges held: 2 · WORKS_AT crossed: 1 → Zeta". Their `FRIEND` edges are looked at but not crossed in this hop.',
      'The end reads "Answer: Acme, Zeta · never touched: Dan, Eva, Fay, Nova", with 7 of 12 edges looked at, 4 crossed and 5 of 9 nodes reached. The edge Eva → Ana points at Ana but is held by Eva, so it is never seen from Ana.',
      'The graph is an example. Only outgoing edges are followed, and each node\'s edges are read in the order given in the data. No query language text is shown; the path is just the two type names. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays five steps by itself — the start, one expansion of Ana, one each of Ben and Cho, and the answer — and then stops.',
        'A Replay button and a playback strip sit below it. Holding step 1 shows Ana\'s WORKS_AT edge looked at but not followed, while holding the last step shows the four nodes that were never touched.',
      ],
    },

    useWhen: [
      'The article explains how a graph database answers a relationship question by walking from a starting node, and needs a two-leg typed path where only matching edges are followed.',
      'A reader thinks a graph query must look through the whole graph; ending with four nodes and five edges never touched shows the work stays around the path.',
    ],

    avoidWhen: [
      'The article is about breadth-first or depth-first search visiting every reachable vertex. Only edges of the requested type are followed.',
      'The subject is graph storage cost compared with relational tables, or how cost grows with more hops. The path is fixed at two legs and one layout.',
      'The point is Cypher or Gremlin syntax. No query text appears.',
    ],

    contrastWith: [
      {
        concept: 'graphDb',
        note: 'Following typed edges outward from a start node is the traversal; how the storage of those edges changes the reading cost per hop, and how it grows with more hops, is the storage comparison built on it.',
      },
      {
        concept: 'bfs',
        note: 'Breadth-first search spreads along every edge until everything reachable is visited; a typed path follows only the relationship named at each leg and stops after the last leg.',
      },
      {
        concept: 'matchOnKey',
        note: 'A join connects rows by comparing key values across two tables; a traversal moves along references a node already holds, with no matching of values.',
      },
    ],
  },
};
