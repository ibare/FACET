/**
 * dfs 개념 선언.
 *
 * canonical facet 은 `facet:dfs` — 정점 여덟 · 방향 간선 여덟짜리 그래프와
 * 호출 스택 기둥과 방문 차례 띠를 한 폭에 놓고, 여섯 언어로 갈리는 코드 패널을
 * 딸린 완결형이다. 재생 · 한 단계 · 일시정지 · 되돌리기 · 속도로 관람한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 조각 둘(diveThenBacktrack · markVisitedOrLoop)과 같은 알고리즘을 다루므로
 * definition 의 무게중심을 갈랐다.
 *   - 여기(완제품)  절차 전체와 그 결과 — 어떤 차례가 나오고 얼마나 깊어지는가.
 *   - diveThenBacktrack  물러나는 한 걸음이 왜 별개의 사건인가.
 *   - markVisitedOrLoop  표시가 없으면 왜 끝나지 않는가.
 *
 * 변별어는 붙이지 않았다. "depth-first search" 는 그래프 문헌 밖에서 다른 것을
 * 가리키지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const dfsConcept: FacetConceptSource = {
  id: 'dfs',
  label: 'Depth-First Search',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:dfs',

  surface: {
    definition:
      'A graph traversal that follows one branch until it dead-ends, then returns to the most recent vertex that still has an unexplored neighbour.',
    exemplarKeywords: [
      'DFS',
      'depth-first search',
      'recursive graph traversal',
      'explicit stack instead of recursion',
      'call stack depth',
      'visit order comes from the adjacency list',
      'exploring a maze one corridor at a time',
      'recursion depth blows the stack',
      'walking a graph without repeating',
    ],
  },

  briefing: {
    observable: [
      'The graph sits on the left, a call-stack column on the right and a visit-order strip along the bottom, and the yellow chain from the start vertex down to the current one is the same thing the column draws as height.',
      'Diving pushes one frame onto the column and returning pops one, while the strip below only ever grows — the stack goes up and down and the record of what has been seen does not.',
      'Every edge the walk entered ends the run carrying two arrow marks, one for going in and one for coming back out, so the return is drawn as its own event rather than as an absence.',
      'Exactly one edge finishes red and dashed: vertex 5 is offered a second time, from vertex 2, and by then it is already seen and the walk refuses to enter.',
      'The visit order comes out 0, 1, 3, 4, 5, 6, 7, 2 — vertex 2 is a direct neighbour of the start yet is reached last, because the start\'s neighbour list names 1 first and everything under 1 finishes before control returns.',
      'Three counters run along the bottom: vertices visited, edges refused, and the deepest the stack ever got, which stops at five.',
      'The code panel highlights the line matching the running step, and a bare `return` is written into it — the program runs identically without that line, and it is there so the moment a frame pops has somewhere to point.',
    ],

    screen: {
      affordances: [
        'Playback is the reader\'s: play, single step, pause, reset and a speed slider. Stepping once advances one phase, which is how to stop on the refused edge.',
        'The code panel starts empty with an "+ Add language" button; Python, JavaScript, TypeScript, Java, C++ and C# are available and at most two panes sit side by side.',
        'The graph and the start vertex are fixed, so an article can name vertices by number and the numbers will be the same for every reader.',
      ],
    },

    useWhen: [
      'The prose says a recursive call "goes deeper" and later "returns", and the reader cannot see where the return lands. The column rising and falling beside the same walk gives the return a place on screen.',
      'An article treats the visiting order as a property of the graph. Naming the order here and then pointing at the start\'s neighbour list shows the order was decided by how the neighbours were written down.',
      'The claim being made is that going deep costs memory in proportion to how deep it went. The deepest-stack counter names the number of frames alive at the same moment, which is the quantity the claim is about.',
    ],

    avoidWhen: [
      'The subject is backtracking search over choices — placing queens, filling a grid, undoing a partial assignment. Nothing here is undone; the walk only ever retraces edges it has already crossed.',
      'The article uses "stack" for the memory region of a running program — frame layout, stack size limits in bytes, a crash from overflow.',
      'The subject is the reading order of a binary tree — preorder, inorder, postorder. This walks a directed graph and never distinguishes a left child from a right one.',
      'The article needs shortest paths or distances. Every edge here is unweighted and no distance is computed anywhere on the screen.',
    ],

    contrastWith: [
      {
        concept: 'diveThenBacktrack',
        note: 'The whole walk runs here and reports what it cost; the piece slows down the single move of backing out, which in this run is only one of many events going past.',
      },
      {
        concept: 'markVisitedOrLoop',
        note: 'Here the visited table is a given and shows up as one refused edge; the piece takes the table away to show what the walk does without it.',
      },
      {
        concept: 'bfs',
        note: 'Same skeleton, opposite shape: this holds only the current path and reaches a direct neighbour of the start last, while the layered search holds a whole ring at once.',
      },
      {
        concept: 'queueVsStackOrder',
        note: 'This is the recursive form, where call order is visit order; the piece shows the same walk driven by an explicit stack, where sibling order comes out reversed.',
      },
    ],
  },
};
