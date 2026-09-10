/**
 * queueVsStackOrder 개념 선언.
 *
 * canonical facet 은 `facet:queueVsStackOrder` — 정점 여섯짜리 그래프 하나를
 * 왼쪽에 고정해 두고, 거기서 뻗은 줄기가 두 갈래로 갈려 한쪽은 앞뒤가 뚫린
 * 통을, 다른 쪽은 위만 뚫린 우물을 지난다. 두 갈래가 걸음마다 하나씩 꺼내며
 * 나란히 자라는 조각이다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `bfs` 는 이미 있다 (`concepts/bfs.ts`). 거기는 층이 한꺼번에 켜지는
 * 파면과 거리 표시, 코드 패널까지 갖춘 **너비 우선 탐색 자체**를 말한다.
 * 여기서는 그 앞의 물음 하나만 든다 — **뼈대에서 결정 지점은 그릇 하나뿐이고,
 * 그 하나가 순서를 정한다.** 무게중심이 "층이 어떻게 퍼지는가" 가 아니라
 * "무엇이 순서를 정하는가" 이므로 definition 이 갈린다.
 *
 * keywords 도 겹치지 않게 두었다 — 완제품이 가진 최단 경로 · 층 순회 · 프론티어
 * 어휘를 가져오지 않고, 그릇 · FIFO/LIFO · 두 이름이 한 뼈대라는 쪽만 든다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const queueVsStackOrderConcept: FacetConceptSource = {
  id: 'queueVsStackOrder',
  label: 'Queue or Stack (the Container That Sets the Visiting Order)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:queueVsStackOrder',

  surface: {
    definition:
      'The single decision left open by the graph-search skeleton: taking the next vertex from the front of the container yields breadth-first order, taking it from the top yields depth-first.',
    exemplarKeywords: [
      'queue versus stack',
      'BFS versus DFS',
      'FIFO or LIFO',
      'swap the container and the algorithm changes',
      'what decides the visiting order',
      'the same code produces a different order',
      'iterative DFS with an explicit stack',
      'why the stack version takes siblings in reverse',
      'generic graph search skeleton',
      'worklist',
    ],
  },

  briefing: {
    observable: [
      'One graph sits on the left and does not change once for the whole run, which is the screen saying structurally that the graph is not what varies.',
      'A single stem leaves the start vertex and forks: the upper lane runs through a tube open at both ends, the lower drops into a well open only at the top, and the two lanes advance at the same beat.',
      'Chips travel rather than change colour — a vertex lifts off the graph, enters a container, comes out of it and takes its place in a growing row of visiting order.',
      'The two containers empty differently and it is visible: in the tube the front chip leaves and the rest slide forward, in the well only the top chip rises while the ones beneath it stay put.',
      'New neighbours enter in ascending number on both sides, and the caption states that the rule is the same on both, so the difference cannot be attributed to it.',
      'The beat where the two orders first disagree is marked, and after it the two rows never agree again — they end 1, 2, 3, 4, 5, 6 and 1, 3, 6, 2, 5, 4.',
      'The lower lane pushes 2 before 3 and then takes 3 out first, so the numbers going in ascending and coming out descending is on screen in the same beat pair.',
    ],

    screen: {
      affordances: [
        'The screen runs both lanes in lockstep on its own and stops with two finished rows of visiting order.',
        'Two buttons: Replay, and one step at a time, which is how to stop on the beat where the two orders part.',
        'The six-vertex graph, the start vertex and the ascending neighbour rule are all fixed, so the two orders an article quotes are the ones the reader gets.',
      ],
    },

    useWhen: [
      'The article presents the two traversals as two algorithms to be learned one after the other, and the reader has no reason to see them as related. Running both out of one skeleton where the only difference is which end a vertex leaves from is what makes them one thing.',
      'A reader has rewritten a recursive deep-first walk with an explicit stack and is surprised the order came out different. Pushing neighbours in ascending order and watching them come back out descending is the whole explanation.',
      'The prose is about to attribute a search\'s behaviour to the graph or to the neighbour ordering. Holding both of those fixed and still getting two orders locates the cause where it belongs.',
    ],

    avoidWhen: [
      'The subject is the queue or the stack as a data structure in its own right — how push and pop are implemented, capacity, wrapping, amortised cost. The containers here are only ever asked for the next vertex.',
      'The next vertex is chosen by a key rather than by when it arrived — a priority queue, a best-first or shortest-path search. Both containers here decide by arrival position alone.',
      'The article uses "queue" for a message queue or a job queue, or "stack" for the call stack of a running program.',
      'The subject is what a traversal is used to compute — components, cycles, an ordering. Nothing here is computed beyond the order itself.',
    ],

    contrastWith: [
      {
        concept: 'bfs',
        note: 'The full treatment shows what taking from the front produces — rings of equal distance and the shortest path that follows from them; here that choice is one of two settings and the product is only the order.',
      },
      {
        concept: 'dfs',
        note: 'The recursive form visits in call order, so siblings keep their listed order; driven by an explicit stack, as here, the same walk takes the last-pushed sibling first and the order flips.',
      },
      {
        concept: 'queueFifo',
        note: 'The container is a plain first-in-first-out queue; there it is studied as a structure, and here it is one of two interchangeable parts whose choice decides an algorithm.',
      },
      {
        concept: 'stack',
        note: 'Same relation on the other side: last-in-first-out as a structure there, and here as the setting that turns the same skeleton into a walk that goes deep.',
      },
    ],
  },
};
