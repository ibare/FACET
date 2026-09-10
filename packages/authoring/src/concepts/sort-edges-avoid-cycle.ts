/**
 * sortEdgesAvoidCycle 개념 선언.
 *
 * canonical facet 은 `facet:sortEdgesAvoidCycle` — 정점 다섯 · 간선 여섯의
 * 작은 그래프에서 간선이 무게 순으로 줄을 서고, 집은 간선의 양 끝이 이미 같은
 * 색이면 이미 이어져 있던 길이 먼저 켜지고 고리가 닫히는 것을 보인 뒤 카드가
 * 바닥으로 떨어지는 조각이다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품(`kruskalMst`)이 절차 전체와 산출물(최소 신장 트리 · 무게 합 · 부모
 * 화살표)을 진다면, 이 조각이 지는 것은 그 안의 판정 한 걸음이다 — **왜 버리는
 * 것이 손해가 아닌가.** 그래서 definition 에 알고리즘 이름도 · 트리도 · 무게
 * 합도 넣지 않고, 이미 있던 길과 그 위에 놓여 닫히는 고리만 담는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const sortEdgesAvoidCycleConcept: FacetConceptSource = {
  id: 'sortEdgesAvoidCycle',
  label: 'Dropping the Edge That Closes a Loop',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:sortEdgesAvoidCycle',

  surface: {
    definition:
      'When links are taken from lightest to heaviest, a link is rejected if its two ends are already joined by a path, because laying it down would only close a loop.',
    exemplarKeywords: [
      'why is this edge skipped',
      'closing a loop',
      'already connected',
      'a redundant link',
      'groups merging as links are laid',
      'the heaviest link in a cycle',
      'accept or reject an edge',
      'a second route between two points',
    ],
  },

  briefing: {
    observable: [
      'The links start in a scrambled order and the first thing that happens is the queue sliding into weight order, so the ordering is an action rather than a given.',
      'Every point begins in its own colour, and colour is the only record of grouping on screen — nothing else tracks who belongs with whom.',
      'Laying a link down repaints the losing side in the winner\'s colour and a ring spreads out from each point that changed, so a merge is a single event covering several points at once.',
      'A rejection is never asserted on its own: the existing path between the two ends lights up first, the picked link settles on top of it to close the ring, and only then does the card fall away to the floor.',
      'The verdict comes down to comparing two colours, which is what makes the test cheap enough to state in one sentence.',
      'Rejected cards collect on a floor beneath the graph, so at the end the kept links and the dropped ones are both still countable.',
      'The five points and six links are arranged so no two links cross, and the loop that closes is therefore a shape rather than a tangle.',
    ],

    screen: {
      affordances: [
        'The screen plays the ordering, all six verdicts and the closing count on its own, then stops.',
        'Two buttons: Replay, and a step control for taking one moment at a time, which is how a reader can hold on the lit-up path before the loop closes.',
        'The graph is fixed and the weights are all different, so an article can name the link that gets dropped without worrying about ties.',
      ],
    },

    useWhen: [
      'The reader accepts that cheap links are taken first but reads the skipping as an exception clause. Lighting the path that already joins the two ends, then closing the ring on top of it, shows the skipped link adding nothing that was not there.',
      'Someone needs to see that keeping track of "already connected" does not require inspecting the graph — two colours settle it, and the colours are maintained by the laying down of links itself.',
      'The prose says a loop contains one link that can always be spared, and the reader wants to see which one that is at the moment the loop forms.',
    ],

    avoidWhen: [
      'The article is about detecting a cycle by traversal — back edges, visited marks, or a walk that returns to where it started. Nothing is traversed here; the answer comes from the colours before the loop is drawn.',
      'The subject is the machinery that maintains the groups — parent pointers, roots, ranks, compression. Colour stands in for all of it and none of it is on screen.',
      'The point is the finished tree, its total weight, or the fact that the number of links kept is fixed by the number of points. This screen is about one verdict repeated, not about the object it produces.',
      'The graph in question is directed, or a loop there means a repeated step in control flow. The links here are undirected and a loop is a closed ring of them.',
      'The article needs a disconnected graph, or ties in weight and how they are broken. Every weight here is distinct and everything ends up in one group.',
    ],

    contrastWith: [
      {
        concept: 'kruskalMst',
        note: 'One verdict repeated, against the whole procedure it belongs to — the total weight it produces, the parent arrows that really answer the membership question, and the code behind them.',
      },
      {
        concept: 'undoByBackEdge',
        note: 'Both are about noticing a loop, but one finds it by walking the graph and meeting a vertex again, while here it is settled by two colours before any walking happens.',
      },
      {
        concept: 'findRoot',
        note: 'Deciding membership by climbing to a representative is what colour stands in for here; this screen assumes the answer and spends its attention on what is done with it.',
      },
      {
        concept: 'growOneTree',
        note: 'Both add links one at a time without ever removing one, but growing extends a single connected blob while here separate groups form anywhere and merge when a link joins them.',
      },
      {
        concept: 'separateComponents',
        note: 'Both turn on which points are joined to which, but one reads existing components off a fixed graph while here the components are created by the links being accepted.',
      },
    ],
  },
};
