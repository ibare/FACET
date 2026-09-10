/**
 * throughMiddleNode 개념 선언.
 *
 * canonical facet 은 `facet:throughMiddleNode` — 정점 넷을 타원에 얹고 아는 거리를
 * 곧은 줄로 그린 조각이다. 물음이 길을 짚어 가고, 짧아질 때만 줄이 가운데 정점
 * 쪽으로 휘었다가 새 수를 달고 다시 곧게 펴진다. 오른쪽 장부가 물음을 남긴다.
 *
 * ── 묶음 안에서 어디에 무게를 두었나
 *
 * 완제품 `floydWarshall` 이 표 전체와 그 결과를 말하므로, 이 조각은 **물음 하나와
 * 그 되풀이** 만 맡는다 — 무엇을 묻는가, 왜 그 물음이 짝마다 되풀이되는가, 그리고
 * 답이 "아니다" 인 물음이 얼마나 많은가. 표도 최종 거리도 여기서는 말하지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const throughMiddleNodeConcept: FacetConceptSource = {
  id: 'throughMiddleNode',
  label: 'Shorter Through the Middle Vertex?',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:throughMiddleNode',

  surface: {
    definition:
      'The single test a distance table repeats: whether going from one vertex to another by way of a chosen middle vertex is shorter than the distance already recorded.',
    exemplarKeywords: [
      'going through an intermediate vertex',
      'a detour that turns out shorter',
      'improving a known distance',
      'why the triple loop is cubic',
      'most checks change nothing',
      'one-way roads',
      'the middle vertex of a route',
      'a shortcut through a hub',
      'asking the same question for every pair',
    ],
  },

  briefing: {
    observable: [
      'Four vertices sit on an oval and every distance that is known is drawn as one straight line between two of them, so the picture holds distances rather than roads.',
      'One vertex at a time is set in the middle, and the questions under it run through every ordered pair that excludes it — six of them each time.',
      'The three outcomes look different on screen: a question with no road in or out bounces off a bar, one with both roads that comes out longer travels the whole way and returns, and only an improvement bends the line through the middle vertex before it snaps straight again carrying a new number.',
      'The pacing follows the outcome — questions that cannot be weighed pass quickly, and the ones that are weighed and rejected are held long enough to read.',
      'A ledger on the right keeps one column per middle vertex and one mark per question, so all twenty-four stay on screen after the run rather than scrolling away.',
      'One pair is improved twice, in two different sweeps, so a route through two intermediates is assembled rather than found in one question.',
      'The closing caption sets the two numbers together: twenty-four asked, four said yes.',
    ],

    screen: {
      affordances: [
        'The sweep plays through by itself and stops with the ledger filled in.',
        'Two buttons: Replay, and one that advances a question at a time, which is the way to stop on a question whose answer is no.',
        'The graph is fixed at four vertices and six one-way roads, and one vertex has no road in while another has none out, so a large share of the questions is dead on arrival by construction.',
      ],
    },

    useWhen: [
      'The article asserts a cubic cost and the reader accepts it as arithmetic without feeling it. A ledger filling mostly with questions that changed nothing is where that exponent becomes concrete.',
      'The reader conflates whether a way through exists with whether it is shorter. Three visibly different outcomes separate the two, and the middle one is the question actually being asked.',
      'The prose needs the reader to accept that the same test applied blindly to every pair is enough, with no cleverness about which pairs are worth asking about.',
    ],

    avoidWhen: [
      'The article is about relaxing along an edge from a growing frontier — one source, a queue, settled and unsettled vertices. The middle vertex here is chosen by turn rather than by distance.',
      'The point is the finished table of distances and how it is read. This stays on the question and never presents the result as a table.',
      'The subject is a middle node in the physical sense — a relay, a proxy, a hub in a network topology, a man in the middle.',
      'The graph has negative weights. Nothing here weighs the possibility that going around makes a distance smaller without bound.',
    ],

    contrastWith: [
      {
        concept: 'floydWarshall',
        note: 'The whole method this question belongs to, where the answers accumulate into a table of every pair rather than staying single answers.',
      },
      {
        concept: 'relaxShorterPath',
        note: 'Both replace a stored distance with a smaller one; that improvement comes along a single edge from a settled vertex, this one from a pair of stored distances joined at a chosen middle.',
      },
      {
        concept: 'fewerHopsNotShorter',
        note: 'Both put the count of hops against the length of the route — bending a line through a middle vertex adds a hop and is kept only when the total is smaller.',
      },
      {
        concept: 'pickNearestUnsettled',
        note: 'Two ways to decide what to try next: one takes the nearest vertex not yet settled, the other simply gives every vertex its turn in the middle.',
      },
    ],
  },
};
