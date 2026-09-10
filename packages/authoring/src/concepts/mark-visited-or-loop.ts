/**
 * markVisitedOrLoop 개념 선언.
 *
 * canonical facet 은 `facet:markVisitedOrLoop` — 자리 넷(A · B · C 고리와 거기
 * 매달린 D)에서 같은 걸음 규칙을 두 번 돌린다. 다른 것은 다녀간 자리에 표시를
 * 남기고 그것을 읽는가 하나뿐이다. 자동으로 두 회차를 돌고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 같은 묶음의 `dfs`(완제품)에서 방문 표시는 이미 켜져 있는 전제이고 화면에는
 * 못 들어간 간선 하나로만 나타난다. 여기서는 그 표시를 **끄고** 무슨 일이
 * 벌어지는지를 무게중심에 둔다 — 종료 조건으로서의 표시.
 * `diveThenBacktrack` 이 "돌아올 길" 을 말한다면 이쪽은 "다시 가지 않을 이유" 다.
 * keywords 도 되풀이 · 멈추지 않음 · visited 집합 쪽만 가져간다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const markVisitedOrLoopConcept: FacetConceptSource = {
  id: 'markVisitedOrLoop',
  label: 'The Visited Mark (Why a Graph Walk Ends)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:markVisitedOrLoop',

  surface: {
    definition:
      'A record of the places already entered, without which a walk over a graph holding a cycle repeats the same few vertices forever and never reaches the rest.',
    exemplarKeywords: [
      'visited set',
      'seen set',
      'the traversal never terminates',
      'the program hangs',
      'going round the same nodes again',
      'a cycle in the graph',
      'why tree recursion needs no visited array',
      'termination condition',
      'marking nodes as done',
      'wasted repeated work',
    ],
  },

  briefing: {
    observable: [
      'The same rule runs twice over the same four places, and the walker slides along the line from one place to the next rather than blinking between them.',
      'In the first run the walk goes A, B, C, A, B, C and keeps going; after twelve steps the caption reports three places reached and names D as never touched.',
      'The three lines around the cycle thicken each time they are walked, so by the end of the first run they are deep ruts while the line out to D is still as thin as it was drawn — that thickness is the amount of wasted walking.',
      'In the second run a yellow ring lands on each place as it is stepped on; at C the first neighbour A already carries a ring, the caption says so, and the walk takes the next entry instead and goes out to D.',
      'The second run reaches all four places in three steps, and every one of the four lines is walked exactly once.',
      'The twelve-step cutoff is a limit on the drawing, not a result of the rule — the caption states the step count alongside the places reached so the two can be read against each other.',
    ],

    screen: {
      affordances: [
        'The screen plays both runs in sequence on its own and stops with the second one finished.',
        'Two buttons: Replay, and one step at a time, which is how to hold still on the moment C offers A and the marked run turns it down.',
        'The four places and the neighbour order are fixed and never shuffled, because the whole argument depends on C offering A before D.',
      ],
    },

    useWhen: [
      'The article shows a traversal with a `visited` set at the top and the reader takes it for boilerplate. Running the identical rule without it and watching a fourth place go untouched forever is what makes the line load-bearing.',
      'The reader asks why walking a tree needs no such record. Here the place off the cycle is the only one the unmarked walk cannot reach, which locates the difference in the cycle rather than in the algorithm.',
      'Someone is about to describe the mark as an optimisation that saves repeated work. The first run does not merely work harder, it never finishes, and the two runs side by side separate those two claims.',
    ],

    avoidWhen: [
      'The article uses "mark" for garbage collection\'s mark-and-sweep, or for marking up a document.',
      'The subject is a loop as a program construct — a `for` or `while` that spins because of a wrong condition. The repetition here comes from the shape of the data, not from a control statement.',
      'The subject is detecting whether a graph contains a cycle, or finding one. The cycle is a given here and the question is what a walk does inside it.',
      'The point is the order the places come out in, or which neighbour is chosen first.',
    ],

    contrastWith: [
      {
        concept: 'dfs',
        note: 'There the visited table is already on and shows up as a single refused edge; here it is switched off first, so the same table becomes the subject rather than a detail.',
      },
      {
        concept: 'diveThenBacktrack',
        note: 'Two things a walk needs to finish: a way back out of a branch, and a reason not to enter the same place twice. This one is the reason.',
      },
      {
        concept: 'queueVsStackOrder',
        note: 'Both isolate one decision inside the same traversal skeleton — that one is which place leaves the container next, this one is whether a place may be entered at all.',
      },
      {
        concept: 'bfs',
        note: 'The layered search carries the same record, where it quietly keeps each vertex from being discovered twice; this pulls that record out and asks what the search would be without it.',
      },
    ],
  },
};
