/**
 * cycleBlocksOrder 개념 선언.
 *
 * canonical facet 은 `facet:cycleBlocksOrder` — 정점 다섯(p~t)에 화살 다섯이고
 * 그중 둘이 서로를 겨눈다. 위 판에서 꺼낼 수 있는 것이 아래 자리 다섯으로
 * 내려가는데, 두 번 내려가고 나면 아무도 못 내려간다. 그 다음이 이 조각의
 * 몫이다 — 점 하나가 화살표를 거슬러 올라가며 왜 못 가는지를 짚고, 제자리로
 * 돌아오는 순간 고리가 닫힌다. 아래 자리 셋은 끝내 빈 채로 남는다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 묶음 안에서 갈라 둔 자리
 *
 * 이 조각이 지는 것은 **실패하는 경우 하나** 다 — 서로를 겨누는 고리가 있으면
 * 남은 것들의 수가 영영 0 이 되지 않아 절차가 멈추고, 고리 뒤에 매달린 것까지
 * 함께 갇힌다. 순서가 없다는 것이 그림으로는 **빈 자리** 다.
 *
 * 절차가 끝까지 가는 정상 경로와 그 산출물은 `topologicalSort`, 0 이 되어
 * 떨어지는 연쇄 자체는 `indegreeZeroFirst` 의 몫이라 여기서는 두 걸음만 나아간
 * 뒤 곧바로 멈춤으로 넘어간다.
 *
 * 변별어를 붙인 이유: "cycle" 은 무방향 그래프의 순환 · 연결 리스트의 순환 ·
 * 되풀이되는 루프가 모두 자칭하는 말이다. 고리가 **순서를 막는다** 는 것이 이
 * 조각의 주장이다 (C4 명명 규칙 2).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const cycleBlocksOrderConcept: FacetConceptSource = {
  id: 'cycleBlocksOrder',
  label: 'A Ring Leaves No Order',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:cycleBlocksOrder',

  surface: {
    definition:
      'When directed edges close a ring, the vertices in it wait on each other forever, so no arrangement respecting all directions exists and the removal procedure halts partway.',
    exemplarKeywords: [
      'circular dependency',
      'cyclic import',
      'import cycle between modules',
      'no valid order exists',
      'A waits for B and B waits for A',
      'stuck halfway through',
      'detecting a cycle in a directed graph',
      'fewer came out than there were',
      'a directed graph that is not acyclic',
      'why the build cannot start',
      'mutual recursion between packages',
    ],
  },

  briefing: {
    observable: [
      'Every vertex on the upper board carries the number of arrows aimed at it, and only one of the five starts at zero.',
      'Taking a vertex is a downward move into one of five slots along the bottom, so progress is measured by slots filling rather than by colour.',
      'Two vertices come down, and then the run keeps going while nothing moves — the remaining three only tremble in place, which is what a halt looks like here.',
      'After the stall, a travelling dot walks backwards along the arrows from a waiting vertex to the vertex it waits on, one hop per step, so the reason is traced rather than asserted.',
      'The trace returns to where it started and the ring closes on screen: two vertices are shown waiting on each other, with the captions naming each side of the wait.',
      'One of the three stranded vertices is not on the ring at all — the trace reaches it separately and the caption says it waits on something caught in the ring.',
      'Three of the five slots stay empty when the run ends, and the closing caption states how many of the five came out.',
      'The left-to-right order of the vertices on the board comes from the run itself: those that could be peeled off stand ahead of those that never could.',
    ],

    screen: {
      affordances: [
        'The screen plays on its own from the first count through the stall and the backward trace, then stops with three slots still empty.',
        'Two buttons: Replay, and a step control for taking the trace one hop at a time, which is how a reader follows the wait from one vertex to the next.',
        'The graph is fixed at five vertices and five arrows, two of which point at each other, so an article can name the pair that deadlocks and the vertex stranded behind them.',
        'When more than one vertex is takeable the run picks alphabetically, and since the halting point is the same either way the choice carries no meaning.',
      ],
    },

    useWhen: [
      'A build, an import graph or a migration plan refuses to start and the reader reads that as a tool defect. Watching the counters stop above zero shows the tool found nothing wrong with itself — the requested order does not exist.',
      'The article needs the reader to accept that a partial result is the diagnosis: what is still on the board when nothing can move is exactly the set that contains the ring.',
      'The prose blames one offending edge, and the reader has to see that the damage spreads — the vertex stranded outside the ring is blocked purely by waiting on something inside it.',
    ],

    avoidWhen: [
      'The subject is a cycle in an undirected graph — a loop found while joining components, or one detected while adding edges to a spanning structure. Nothing here is symmetric.',
      'The article is about finding a loop in a linked list with two pointers of different speed.',
      'The point is deadlock between threads holding locks, where the resource wait graph is built at runtime and the remedies are timeouts, ordering disciplines and rollback.',
      'The article needs the cycle reported as a named list of participants for a tool to print. The reason is traced visually here; nothing is emitted as a diagnostic.',
      'The subject is a graph that is acyclic and the article only needs the order that comes out of it.',
    ],

    contrastWith: [
      {
        concept: 'topologicalSort',
        note: 'The complete run keeps this case as a single closing comparison — taken against total; here that comparison is unfolded into why nothing more can be taken.',
      },
      {
        concept: 'indegreeZeroFirst',
        note: 'Two outcomes of one rule: there every counter empties and everything falls, here three counters stop above zero and stay there.',
      },
      {
        concept: 'sortEdgesAvoidCycle',
        note: 'Both turn on a cycle, but there a cycle is something to be avoided edge by edge while building, and here it is a property of the given graph that makes the goal unreachable.',
      },
      {
        concept: 'mutuallyReachable',
        note: 'The same mutual reachability seen from the other side — there being able to get back is what defines a group worth naming, here it is what makes an order impossible.',
      },
    ],
  },
};
