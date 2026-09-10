/**
 * repeatRelaxAll 개념 선언.
 *
 * canonical facet 은 `facet:repeatRelaxAll` — 곧은 사슬 다섯 정점에 무게 1 짜리
 * 간선 넷을 두고, **간선을 보는 차례를 사슬 진행 방향과 정반대로** 놓은 조각이다.
 * 살핌창이 오른쪽에서 왼쪽으로 미끄러지는 동안 값은 왼쪽에서 오른쪽으로 한 칸씩만
 * 건너가고, 그 어긋남이 헛도는 살핌을 만든다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `bellmanFord` 가 절차 전체와 결과를 말하고, 형제 조각
 * `oneMoreRoundDrops` 가 마지막 한 바퀴의 판정을 말한다. 이 조각은 그 사이 —
 * **되풀이 횟수가 왜 그 값인가** — 하나만 말한다. definition 의 무게중심을
 * "간선을 보는 차례" 와 "한 바퀴에 한 칸" 에 두어 둘과 갈랐다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const repeatRelaxAllConcept: FacetConceptSource = {
  id: 'repeatRelaxAll',
  label: 'Sweeping Every Edge, Round After Round',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:repeatRelaxAll',

  surface: {
    definition:
      'Why relaxation has to repeat: under an unlucky edge order a full sweep advances the known distances by exactly one vertex, and the remaining scans do nothing.',
    exemplarKeywords: [
      'why n-1 iterations',
      'edge order matters',
      'wasted scans',
      'one hop per sweep',
      'worst-case ordering',
      'iteration bound',
      'how many rounds are enough',
      'information spreads one step at a time',
      'longest path uses at most n-1 edges',
    ],
  },

  briefing: {
    observable: [
      'Five vertices stand in a straight chain and the probe window slides over the edges in the order they are swept, which runs right to left — against the direction the distances travel.',
      'Three of the four scans in a round pass over an edge whose tail is still unknown, and the caption says outright that nothing happens.',
      'The scans that do nothing go by faster than the one that lands, so the wasted part of a round is felt as pace before it is read as a number.',
      'A ledger under the chain gives one row per round and one cell per scan, lined up with the edge above it: a short dash for a scan that did nothing, a filled cell carrying the new distance for the one that did.',
      'The filled cells form a staircase descending one step per round, and the length of that staircase is the number of rounds the chain needs.',
      'The closing caption puts the two counts side by side — how many scans were made in total and how few of them mattered.',
    ],

    screen: {
      affordances: [
        'The screen plays four rounds over four edges by itself and stops on the closing tally.',
        'Two buttons: Replay, and a step control for advancing one scan at a time, which is how a reader can sit on a scan that does nothing and read why.',
        'The chain, the weights and the sweep order are fixed, so an article can name which single scan in each round is the one that lands.',
      ],
    },

    useWhen: [
      'The prose asserts a loop bound of one less than the vertex count and the reader takes it as a safety margin. Watching the front advance exactly one vertex per round, with an order chosen to make it so, turns the bound into the amount actually needed.',
      'The reader wonders why the whole edge list is swept instead of the few edges that could matter. Three scans out of four doing nothing, round after round, is the price of not knowing in advance which edge is next.',
      'The article is about to introduce a method that orders its work — a queue keyed by distance — and needs the disorder it replaces to have been seen first.',
    ],

    avoidWhen: [
      'The question is what a single relaxation does to one edge. A whole sweep is the unit here and the individual comparison never stands alone.',
      'The subject is negative weights, or a cycle that keeps lowering distances. Every weight here is 1 and the run reaches a fixed answer.',
      'The article means numerical relaxation — iteratively smoothing a grid of values — or the relaxing of a constraint in an optimisation problem.',
      'The topic is loop optimisation in a program: unrolling, hoisting, skipping iterations that cannot fire. The redundant scans here are kept on purpose.',
    ],

    contrastWith: [
      {
        concept: 'bellmanFord',
        note: 'The full method runs on a graph where several distances drop per pass and the sweep count is hard to feel; this strips the graph to a chain so one round means exactly one vertex.',
      },
      {
        concept: 'oneMoreRoundDrops',
        note: 'Sibling halves of the same loop: this one is about how many rounds are enough, that one about what it means when the rounds never become enough.',
      },
      {
        concept: 'relaxShorterPath',
        note: 'That is the rule applied to one edge — a recorded distance overwritten by a smaller one; this is the same rule swept over the whole edge list again and again.',
      },
      {
        concept: 'pickNearestUnsettled',
        note: 'Choosing which vertex to work on next removes the wasted scans entirely; here nothing is chosen, which is why the same edges are examined round after round.',
      },
    ],
  },
};
