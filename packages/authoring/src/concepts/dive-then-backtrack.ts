/**
 * diveThenBacktrack 개념 선언.
 *
 * canonical facet 은 `facet:diveThenBacktrack` — 정점 여섯의 나무를 A 에서 돌며,
 * 파고드는 걸음과 물러나는 걸음을 서로 다른 운동으로 그리는 조각이다. 자동으로
 * 한 호흡 돌고 멈춘다. 다시 보기와 한 걸음만 딸려 있다.
 *
 * ── 묶음 안에서의 자리
 *
 * 같은 묶음의 `dfs`(완제품)가 절차 전체와 그 값을 말하므로, 여기서는 **되짚어
 * 나오는 한 걸음**만 무게중심에 둔다. 이 조각은 "다음 자리로 넘어가는 것" 과
 * "왔던 길을 거슬러 오르는 것" 이 다른 사건임을 말하고 멈춘다. keywords 도
 * 되돌아옴 쪽 어휘(backtrack · unwind · dead end)만 가져가고, 완제품이 쓰는
 * 탐색 일반 어휘(DFS · adjacency · maze)는 넘기지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const diveThenBacktrackConcept: FacetConceptSource = {
  id: 'diveThenBacktrack',
  label: 'Backing Out (the Retreat Half of a Deep Walk)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:diveThenBacktrack',

  surface: {
    definition:
      'Retreating along an edge already crossed is a move in its own right: a walk that goes deep spends one retreat for every step it took inward.',
    exemplarKeywords: [
      'backtrack',
      'back out',
      'retreat to the parent',
      'unwind',
      'returning from a recursive call',
      'dead end',
      'the walk cannot jump between branches',
      'how much memory a deep walk needs',
      'the path back',
      'depth rather than size decides the space cost',
    ],
  },

  briefing: {
    observable: [
      'Diving grows a rope from parent to child, the marker runs straight down the edge, and a needle beside the tree drops one level.',
      'Retreating undoes all three differently: the rope shrinks from the child end, the marker leaves the edge and swings back up in an arc bulging outward, the chevron on it flips upward, and the edge stays behind as a dotted trace.',
      'Going from D to E takes two moves rather than one, even though the two leaves sit side by side on screen — up to B first, then down into E.',
      'A wall mark appears on a vertex at the moment it turns out to have nowhere left to go, before the retreat begins.',
      'The closing caption counts the retreats separately from the places reached, and on this six-vertex tree the retreats come out equal in number to the steps taken inward.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole walk once on its own and then stops.',
        'Two buttons: Replay, and one step at a time, which is what lets a reader hold still on a retreat and see it as a move rather than a transition.',
        'The tree is fixed at six vertices named A to F, and neighbours are taken in alphabetical order, so the path A, B, D, E, C, F is the same for every reader.',
      ],
    },

    useWhen: [
      'The article prints a visiting sequence and the reader reads "D, E" as a sideways hop between two leaves. Watching the marker climb back to B before it can descend into E is what corrects that reading.',
      'The claim is that the space a deep walk needs follows how far down it went rather than how big the graph is. The rope that lengthens on the way in and shortens on the way out is that quantity, drawn.',
      'The reader has been told a function "just returns" and does not connect that to any movement in the search. Here the return is the arc, and it is the only thing happening for that beat.',
    ],

    avoidWhen: [
      'The subject is trying a choice and undoing it — placing a queen and removing it, assigning a value and clearing it. Nothing is undone here; the walk only retraces ground it already covered.',
      'The article means undo in an editor, a transaction rollback, or reverting a commit.',
      'The graph in question has cycles and the question is whether the walk terminates. This tree has no way back into a branch already left.',
      'The subject is which neighbour to descend into first, or how the visiting order was decided.',
    ],

    contrastWith: [
      {
        concept: 'dfs',
        note: 'The retreat is one event among many once a whole traversal is running; this holds still on it, at the cost of saying nothing about what the traversal produces.',
      },
      {
        concept: 'tryAndUndo',
        note: 'Both walk something back, but undoing a trial erases a decision that was made, while retreating here erases nothing — the vertex stays visited and only the position moves.',
      },
      {
        concept: 'markVisitedOrLoop',
        note: 'Two halves of what makes a deep walk finish: this one gives it a way back, the other gives it a reason not to go somewhere twice.',
      },
      {
        concept: 'stack',
        note: 'The rope is a stack seen as a path on the graph — every dive is a push and every retreat a pop, with the top always being where the walk currently stands.',
      },
    ],
  },
};
