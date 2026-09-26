/**
 * graphDb 개념 선언.
 *
 * canonical facet 은 `facet:graphDb` — 사람 여섯 · 회사 셋 · 이음 열둘(`FRIEND` · `WORKS_AT`)의 그래프에서 "Ana 로부터 친구를
 * k 홉까지" 찾는다. 손잡이 둘 — 홉(1 ~ 3) · 담는 법(쥔 이음 / 이음 표). 쥔 이음이면 한 홉에 앞 줄 노드가 쥔 이음만 읽어
 * 3 → 7 → 11, 이음 표(색인 없음)면 홉마다 열두 줄을 다 읽어 12 → 24 → 36. 닿은 사람은 담는 법과 무관하게 2 · 4 · 5.
 *
 * ── 묶음 안에서의 자리
 *
 * 조각 `traverseRelationships` 는 같은 그래프에서 FRIEND 다음 WORKS_AT 길을 노드 하나씩 펼치며 **종류에 맞는 이음만 건너고
 * 나머지는 건드리지 않는** 장면이다. 이쪽은 이음을 **어디에 담느냐**를 손잡이로 세우고 홉을 늘려 읽는 양의 늘어남을 견준다.
 * 그래서 definition 은 where edges are stored · k-hop · per hop · frontier · edge table · rescanned 를 쥐고, 조각이 독점한
 * typed path · relationship type · untouched 를 쓰지 않는다.
 *
 * 전제 (설명 글 `graphDb.md`): 자료는 예로 정한 것 · 나가는 이음만 따른다 · 한 홉에 앞 줄 전부를 한꺼번에 펼친다 · 이미 닿은
 * 노드로는 건너지 않는다(홉 3 의 Eva → Ana) · 이음 표에는 색인이 없다고 쳤다 · 코드 패널은 IR 하나를 여섯 언어로 옮긴 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const graphDbConcept: FacetConceptSource = {
  id: 'graphDb',
  label: 'Graph Database (Edges Held by Nodes vs One Edge Table)',
  canonicalFacet: 'facet:graphDb',

  surface: {
    definition:
      'Where edges are stored sets the cost of a k-hop friend search: edges held by each node cost only the frontier\'s own edges per hop, while one unindexed edge table is rescanned in full on every hop.',
    exemplarKeywords: [
      'graph database',
      'index-free adjacency',
      'Neo4j vs relational database',
      'friends of friends query',
      'multi-hop query cost',
      'recursive join on an edge table',
      'social network graph storage',
      'k-hop neighborhood',
      'graph vs SQL for relationships',
    ],
  },

  briefing: {
    observable: [
      'The graph has people Ana, Ben, Cho, Dan, Eva, Fay and companies Acme, Zeta, Nova, joined by twelve directed edges of type `FRIEND` or `WORKS_AT`. The round opens with "Start: Ana · Follow: FRIEND · Hops: 2" and "Stored as: Held edges"; a dashed "Hop limit" ring marks how far the search may go.',
      'Under Held edges each edge is a tag under the node it leaves from. Each hop has a read step — "Hop 1 · the front row reads only the edges it holds", with "Front row: Ana · Read this hop: 3 · Read so far: 3" — and a cross step — "Hop 1 · crossed: Ana→Ben · Ana→Cho", "People reached: 2 · Next front row: Ben · Cho".',
      'Under Edge table the tags leave their nodes and line up as twelve rows of one table; each read step shows "Hop 1 · every row of the edge table is read" as a band sweeps all twelve rows top to bottom.',
      'Only `FRIEND` edges to people not yet reached are crossed; `WORKS_AT` edges are read but never crossed, so no company is reached. At hop 3 the edge Eva → Ana is a FRIEND edge but Ana is already reached, so it is not crossed.',
      'Edges read by hops 1, 2, 3: Held edges 3, 7, 11 (4 more per hop, the frontier\'s own edges); Edge table 12, 24, 36 (12 more per hop). People reached is the same under both layouts: 2 (Ben, Cho), 4 (adding Dan, Eva), 5 (adding Fay). The default round ends "Friends within 2 hops: Ben · Cho · Dan · Eva" with "Edges read: 7 · People reached: 4".',
      'A chart "Edges read per hop" fills a bar for each hop; after a handle is turned, the previous run\'s bars stay as dashed shadows for comparison.',
      'The graph is an example. Only outgoing edges are followed, and the edge table is assumed to have no index — with one, it too would read only the frontier\'s edges, and the remaining difference would be the cost of going through the index. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Hops" — 1, 2 or 3 (starting at 2) — and "Stored as" — Held edges or Edge table (starting at Held edges). A round is 4, 6 or 8 steps depending on the hops, then waits for a handle.',
        'The move that makes the idea land is flipping "Stored as" at a fixed hop count, then raising "Hops": the people reached never change, while edges read jumps from 7 to 24 and grows by 12 per hop on the table side against 4 on the held side.',
        'Readouts under the controls: Edges read and People reached.',
        'The code panel, labelled "Expand k hops", starts empty with a "+ Add language" button; the chosen language shows the `expand` function, which counts edges read, and highlights the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why graph databases handle multi-hop relationship queries better than a relational edge table, and needs the read counts growing with the frontier on one side and with the whole table per hop on the other.',
      'A reader asks what "index-free adjacency" actually buys; the same friends found at a fraction of the edges read is the concrete answer.',
    ],

    avoidWhen: [
      'The article is about shortest paths, weighted edges or graph algorithms like PageRank. The search only expands by hop and counts reads.',
      'The subject is a graph query language such as Cypher or Gremlin. No query text is shown.',
      'The point is an indexed relational join. The edge table here has no index by assumption.',
    ],

    contrastWith: [
      {
        concept: 'traverseRelationships',
        note: 'Following only edges of the requested type from each reached node is the traversal itself; how storage of those edges changes the reading cost per hop is a separate question about layout.',
      },
      {
        concept: 'adjacencyListVsMatrix',
        note: 'Adjacency list versus matrix concerns how a program holds a graph in memory; a graph database weighs edges kept with each node against a single edge table, measured in edges read per hop.',
      },
      {
        concept: 'bfs',
        note: 'Breadth-first search defines the level-by-level visiting order; the multi-hop search follows that order but only along one relationship type, and its question is what storing the edges costs, not the order.',
      },
      {
        concept: 'joinKinds',
        note: 'Finding friends in an edge table is a self-join repeated once per hop; a graph store replaces that repeated join with following references held by each node.',
      },
    ],
  },
};
