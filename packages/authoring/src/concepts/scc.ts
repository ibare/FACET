/**
 * scc 개념 선언.
 *
 * canonical facet 은 `facet:scc` — 정점 여덟 · 방향 간선 열넷의 그래프를 깊이 우선
 * 순회 한 번으로 훑어 무리 셋을 확정하는 완결형이다. 방문 번호와 낮은값, 스택,
 * 되짚어 닿는 간선이 화면에 함께 있고, 코드 패널이 가장 긴 IR 하나를 편다.
 *
 * ── 묶음 안에서의 자리
 *
 * 조각 `mutuallyReachable` 은 **정의** 를 말한다 — 오갈 수 있어야 한 무리다.
 * 이 완제품의 무게중심은 그 정의를 **한 번의 순회로 어떻게 셈해 내는가** 이므로,
 * definition 에 num · low · 스택을 명시해 갈랐다. exemplarKeywords 도 조각 쪽은
 * 왕복·되돌아올 길 쪽 구어를, 이쪽은 알고리즘 이름과 응용 맥락을 맡는다.
 *
 * 변별어를 붙이지 않았다 — "strongly connected component" 는 그래프 이론 안에서만
 * 쓰이는 말이고, 약자 SCC 도 마찬가지다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const sccConcept: FacetConceptSource = {
  id: 'scc',
  label: 'Strongly Connected Components (Tarjan)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:scc',

  surface: {
    definition:
      "Tarjan's method splits a directed graph into groups of mutually reachable vertices in one depth-first walk, carrying a visit number, a lowest reachable number and a stack.",
    exemplarKeywords: [
      'strongly connected components',
      'SCC',
      'Tarjan',
      'low-link value',
      'condensation into a DAG',
      'circular imports',
      'module dependency cycles',
      'deadlock detection',
      'two-satisfiability',
      'grouping vertices that can all reach each other',
    ],
  },

  briefing: {
    observable: [
      'Every vertex carries two numbers side by side — the order it was first reached and the earliest vertex anything under it can get back to — and the second one changes while the first never does.',
      'A stack column fills as the walk descends and holds each vertex until its group is settled, so membership of the stack is a visible third state beyond visited and unvisited.',
      'Edges are drawn four different ways as they are examined: the one being looked at, the one descended into, the one running back to a vertex still on the stack, and the one leading to a vertex whose group already closed.',
      'That last kind is drawn faint and dotted and moves no value at all, which is what separates "already visited" from "still able to send something back".',
      'The captions name the two updates in different words: after coming back up from a child the vertex inherits what the child reached, while a back edge only ever hands over the other vertex\'s visit number.',
      'When a vertex finds its lowest reachable number equal to its own visit number a bracket closes over the stack from that vertex upward, and the size of the group is known before a single member is removed.',
      'Members then leave the stack one at a time into a group cell, and by the end all eight vertices sit in exactly three groups.',
      'Three counters run along the bottom: vertices visited, back edges found, and groups closed.',
      'The code panel unfolds the routine into a chosen language and highlights the line matching the current step; the two assignments to the lowest reachable number stand in separate branches rather than being folded into one line.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole walk on its own, from the first vertex through the closing count of groups.',
        'Play, step, pause, reset and a speed slider. Stepping is how a reader stops on a single edge and reads which of the four kinds it turned out to be.',
        'The code panel starts empty with a button for adding a language; once one is chosen its lines light up as the walk runs.',
        'The graph and the order neighbours are examined in are fixed, so an article can name the vertex where the first group closes and the edge that makes it possible.',
      ],
    },

    useWhen: [
      'The article states that the grouping takes one pass rather than a check for every pair of vertices, and the reader has no picture of how one pass could suffice. Watching the lowest reachable number travel up out of a back edge is where the saving actually happens.',
      'A reader conflates "I have been here before" with "I can still get back from here". The faint dotted edges into closed groups, which carry nothing, are the distinction as a visible event.',
      'The prose is about a bug that survives because the output stays correct. This graph yields the same three groups even when the two easily confused updates are swapped, which is why the article can point at the code panel rather than at the result.',
      'The article needs a group to be recognised as complete at a definite moment. The bracket closing over part of the stack, before anything is removed, is that moment.',
    ],

    avoidWhen: [
      'The graph in question is undirected. Then reachability is symmetric by construction and the whole question this answers does not arise.',
      'The subject is the two-pass method that reverses every edge and walks the graph again. One walk happens here and no edge is ever reversed.',
      'The article is about articulation points, bridges or biconnected components. The same name is attached to those, and none of them appear here.',
      'The topic is ordering a dependency graph that has no cycles. Cycles are what this looks for; an acyclic graph would give one group per vertex and nothing to see.',
      'The article uses "component" for a piece of a user interface or a unit of a software system.',
      'The point is the union-and-find bookkeeping that merges sets as edges arrive. Nothing is merged here; groups are cut out of a stack.',
    ],

    contrastWith: [
      {
        concept: 'mutuallyReachable',
        note: 'That one asks the defining question directly, pair by pair, and never scales; this computes the same grouping in a single walk, at the cost of the question no longer being visible in it.',
      },
      {
        concept: 'dfs',
        note: 'The walk is the same walk, but here what matters is not the order of visiting — it is the two numbers and the stack carried alongside it.',
      },
      {
        concept: 'separateComponents',
        note: 'Both partition a graph into groups; in an undirected graph one search settles a whole group, while here a search can wander far outside the group it started in.',
      },
      {
        concept: 'undoByBackEdge',
        note: 'Both hinge on an edge that leads back to somewhere already reached, but one uses it to take flow away again and this uses it to prove a set of vertices is inseparable.',
      },
      {
        concept: 'topologicalSort',
        note: 'Ordering assumes no cycles; collapsing each of these groups to a single node is exactly what turns a cyclic graph into one that can be ordered.',
      },
    ],
  },
};
