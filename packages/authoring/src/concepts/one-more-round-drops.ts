/**
 * oneMoreRoundDrops 개념 선언.
 *
 * canonical facet 은 `facet:oneMoreRoundDrops` — 정점 넷(S · A · B · C)에 방향
 * 간선 넷을 두고 A→B→C→A 의 무게 합을 −2 로 만든 조각이다. 오른쪽 세로 궤도의
 * 알갱이가 바퀴마다 같은 폭으로 떨어지고, n−1 = 3 바퀴 자리에 그은 파선을 넷째
 * 바퀴에 뚫고 내려간다. 여섯 바퀴에서 멈추지만 값은 멎지 않는다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `bellmanFord` 는 절차 전체와 그 결과(음수 고리가 없는 확정 거리)를 말하고,
 * 형제 조각 `repeatRelaxAll` 은 바퀴 수가 왜 그 값인가를 말한다. 이 조각의
 * 무게중심은 **그 바퀴 수를 넘겨도 값이 내려간다는 사실이 무엇의 증거인가** 다 —
 * 곧 최단값이 아예 존재하지 않는다는 판정 쪽이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const oneMoreRoundDropsConcept: FacetConceptSource = {
  id: 'oneMoreRoundDrops',
  label: 'One More Round, and It Drops Again (Negative Cycle)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:oneMoreRoundDrops',

  surface: {
    definition:
      'A distance that still falls after the last round it could legitimately fall in proves a cycle of negative total weight, so no shortest value exists for what the cycle reaches.',
    exemplarKeywords: [
      'negative cycle',
      'no shortest path exists',
      'distances keep decreasing',
      'sum of weights below zero',
      'unbounded optimum',
      'arbitrage loop',
      'the answer never settles',
      'detecting an impossible minimum',
      'why the extra pass exists',
    ],
  },

  briefing: {
    observable: [
      'Vertical tracks on the right hold one bead per vertex, and the height of a bead is that vertex\'s current distance, so falling is literally what the reader watches.',
      'Each round the bead drops to a new height and leaves a tick where it was; the gaps between ticks never widen or narrow, which is the same amount coming off every round.',
      'A dashed line is drawn under the beads at the round where the count says they should have stopped, and on the next round the beads pass straight through it.',
      'The bead for the start vertex never moves. Nothing points into it, so the cycle cannot reach it, and the damage stops at that boundary.',
      'On the left the edges that lowered a value in the round light up briefly, so the fall on the right can be traced to a particular loop on the left, and that loop stays marked at the end.',
      'At the last round the beads put out an arrow below their tracks that runs off the bottom of the frame, and the closing caption states that the drop never stops.',
    ],

    screen: {
      affordances: [
        'The screen plays six rounds by itself and halts, though the halt is a framing decision rather than an end to the falling.',
        'Two buttons: Replay, and a step control for taking one round at a time, which is how a reader can stop exactly on the round that breaks the dashed line.',
        'The graph, the weights and the number of rounds shown are fixed, so an article can name the loop, quote its total of minus two, and point at the round where the floor gives way.',
      ],
    },

    useWhen: [
      'The article says an algorithm can report that no answer exists, and a reader treats that as a failure to compute rather than a finding. Beads falling past the line where they were bound to stop is the finding itself, produced by the ordinary machinery.',
      'The reader believes a shortest route can always be named if you look hard enough. Watching the same amount come off every round shows there is nothing to look for: any candidate value is beaten by going round once more.',
      'The prose needs the damage to be bounded — a graph with a bad loop is not entirely worthless. One bead standing still while the others fall shows exactly which vertices keep a meaningful distance.',
    ],

    avoidWhen: [
      'The subject is finding a cycle in an undirected graph or in a linked list — a pointer chase, a tortoise and a hare. Existence of a loop is assumed here; what is being read is the sign of its total.',
      'The article is about a program stuck in an infinite loop or a runaway recursion. Nothing here is a bug; the falling is the correct behaviour of a well-formed procedure.',
      'The point is how a single distance is lowered across one edge, or how many rounds a well-behaved graph needs. Rounds pass wholesale here and the graph never settles.',
      'The topic is negative numbers in arithmetic, or losses accumulating in a financial model over time.',
      'The article needs the cycle itself extracted — its vertices listed, or the loop removed to repair the graph. The screen ends at the verdict.',
    ],

    contrastWith: [
      {
        concept: 'bellmanFord',
        note: 'The full method runs the same extra pass on a graph where nothing drops, so there the empty round is the proof of a final answer; here it is the proof that there is none.',
      },
      {
        concept: 'repeatRelaxAll',
        note: 'Sibling halves of the same loop: that one shows how many rounds suffice, this one shows a graph in which no number of rounds ever does.',
      },
      {
        concept: 'negativeEdgeBreaks',
        note: 'Both are about negative weights, but a single negative edge only breaks the habit of settling a vertex early, while a negative total around a loop removes the answer altogether.',
      },
      {
        concept: 'cycleBlocksOrder',
        note: 'Two ways a directed loop makes a question unanswerable — one leaves vertices with no valid position, the other leaves them with no smallest distance.',
      },
    ],
  },
};
