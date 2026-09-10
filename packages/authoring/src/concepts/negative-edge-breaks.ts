/**
 * negativeEdgeBreaks 개념 선언.
 *
 * canonical facet 은 `facet:negativeEdgeBreaks` — 정점 넷과 방향 간선 넷(S→A 3 ·
 * S→B 4 · B→A −2 · A→T 1)뿐인 최소 구성이다. 확정이 깨지는 데 필요한 것은 굳은
 * 뒤에 닿는 더 짧은 길 하나와 그 소식이 나가야 할 곳 하나뿐이라 그렇게 줄였다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 묶음 안에서 갈라 둔 자리
 *
 * 이 조각이 지는 것은 **전제가 깨졌을 때 화면에 남는 틀린 수** 다. 규칙("음수면
 * 쓰지 마라")을 말하지 않고, 규칙을 어겼을 때 실제로 무엇이 남는지를 보인다.
 * 굳혀도 되는 까닭은 `pickNearestUnsettled`, 수가 내려가는 일은
 * `relaxShorterPath`, 절차 전체는 `dijkstra` 가 맡는다.
 *
 * 변별어를 붙인 이유: "negative" 만으로는 음수 순환 검출 · 음수 가중치 재조정과
 * 갈리지 않는다. 이 조각이 보이는 것은 **확정이 깨진다** 는 사건 하나다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const negativeEdgeBreaksConcept: FacetConceptSource = {
  id: 'negativeEdgeBreaks',
  label: 'A Negative Edge Breaks Committing Early',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:negativeEdgeBreaks',

  surface: {
    definition:
      'A single negative edge weight invalidates committing to distances in nearest-first order: a shorter route arrives after a vertex is closed and a wrong number is left standing.',
    exemplarKeywords: [
      'negative edge weight',
      'negative weight',
      'why Dijkstra fails on negative edges',
      'use Bellman-Ford instead',
      'a discount or refund on an edge',
      'currency arbitrage leg',
      'the assumption the algorithm rests on',
      'wrong answer that looks finished',
      'when a greedy commitment is unsafe',
      'costs that can go down',
    ],
  },

  briefing: {
    observable: [
      'Committing is drawn as a lid coming down onto the distance chip and clamping it, so the reader sees a decision being locked rather than a colour changing.',
      'When a shorter candidate reaches an already closed vertex it travels along the edge, strikes the vertex, fails to enter, and is left hanging beside it with a cross on it — the refusal is a collision, not a caption.',
      'The refused number then tries to leave that vertex and is pushed back by a membrane, which is the part the reader would otherwise never think of: news that is not accepted also cannot be forwarded.',
      'The screen names the number that never got out and the neighbour it would have corrected, so the second-order damage is stated with both values on screen.',
      'The true shortest route is then traced separately, leg by leg with a running total, and it comes to 3 by way of S, B and A.',
      'The two numbers are finally set side by side under the labels settled and true: the goal keeps 4 while the answer is 3, and the run ends with the wrong number still on the board.',
      'The graph is four vertices and four directed edges, small enough that a reader can check every route by hand and confirm the verdict rather than take it.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole failure on its own and stops on the two numbers standing side by side.',
        'Two buttons: replay, and a step button. The first press of the step button rewinds and shows the first move in the same press, and each press after that advances one moment.',
        'The four weights are fixed, including the negative one, so the article can name the −2 edge and the final 4 against 3.',
        'Stepping is how the reader lingers on the refusal, which is one moment in an otherwise ordinary-looking run.',
      ],
    },

    useWhen: [
      'The article has stated the non-negative requirement as a footnote and the reader has no reason to take it seriously. A run that finishes cleanly and reports a wrong number is the argument the footnote could not make.',
      'The prose is about to introduce a slower method that keeps re-examining edges, and the reader needs to want it first — the cost of that method only reads as worth paying once early commitment has been seen failing.',
      'The reader is modelling something where an edge can lower a total — a rebate, a refund, an exchange leg — and needs to know that the failure is silent rather than an error.',
    ],

    avoidWhen: [
      'The subject is a negative cycle: detecting one, or the fact that shortest distances stop being defined. This graph has no cycle, and the comparison it draws depends on a true answer existing.',
      'The article is about the slower method in its own right — how many passes it makes, why the number of passes is what it is. That method appears here only as the source of the true number.',
      'The point is reweighting a graph so that negative edges can be removed before a nearest-first run.',
      'The article is about negative numbers, subtraction or signed arithmetic generally. The word matches and nothing else does.',
      'The reader has not yet seen an ordinary successful run. Nothing here explains the method it is breaking.',
    ],

    contrastWith: [
      {
        concept: 'pickNearestUnsettled',
        note: 'The same commitment with its premise intact: there a number arriving at a closed vertex rebounds harmlessly because it could not have been shorter, here it rebounds and was.',
      },
      {
        concept: 'dijkstra',
        note: 'The full procedure running as designed, against the single edge that makes its final answer wrong without making it look wrong.',
      },
      {
        concept: 'bellmanFord',
        note: 'The method that survives negative weights by refusing to close anything early, which is exactly the price the failure here argues for.',
      },
      {
        concept: 'greedyCanFail',
        note: 'Both are counterexamples to committing locally, but this one names the precise property — weights that never decrease a total — whose absence causes the failure.',
      },
    ],
  },
};
