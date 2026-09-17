/**
 * neighborsLinkedAhead 개념 선언.
 *
 * canonical facet 은 `facet:neighborsLinkedAhead` — 조각이다. 평면에 점 열둘이
 * p0~p11 로 이름을 달고 서 있고, 점마다 가장 가까운 다섯이 미리 이어져 있다.
 * 걸음은 p0 에서 시작해 p0 → p3 → p5 → p7 로 세 번 옮기고, 더 가까운 이웃이
 * 없어 멎는다. 계기도 코드 패널도 없고 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **한 층에서 걷는 일 자체** 다 — 선 자리에 이어진
 * 것만 들여다본다는 것, 더 가까운 쪽으로 옮긴다는 것, 그리고 나아질 데가 없으면
 * 멎는다는 것. definition 의 주어가 "걸음" 이고, 낱말은 이음 · 들여다봄 · 옮김 ·
 * 멎음뿐이다. 층 · 성김 · 물려줌은 `coarseThenFine` 이, 깊이 · 출발 자리 · 값은
 * 완제품 `hnsw` 가 가져갔으므로 여기서는 쓰지 않는다.
 *
 * 멎는 자리가 참으로 가장 가까운 자리라는 보장이 없다는 것까지가 이 조각의
 * 몫이다 (definition 의 꼬리). 그 흠을 무엇으로 메우는가는 형제 둘의 몫이다.
 *
 * `bfs` · `dfs` · `dijkstra` 계열의 어휘(최단 경로 · 도달 가능성 · 방문 순서)는
 * 쓰지 않았고, avoidWhen 이 그 오검출을 한 번 더 막는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const neighborsLinkedAheadConcept: FacetConceptSource = {
  id: 'neighborsLinkedAhead',
  label: 'Links Laid Before the Question (Walking Instead of Measuring)',
  canonicalFacet: 'facet:neighborsLinkedAhead',

  surface: {
    definition:
      'A walk over points that each hold links to a few others around them: it inspects only the links of where it stands, steps onto whichever lies closer to the query, and halts at a point no link improves on.',
    exemplarKeywords: [
      'proximity graph',
      'the links are laid before the question arrives',
      'walk to an answer instead of measuring everything',
      'move onto a linked point that lies closer',
      'the walk stops in a dip that is not the bottom',
      'too few links and the walk stops early',
      'small world graph',
      'navigable graph built over a collection',
      'one step at a time along existing links',
      'a full sweep per question is too slow',
    ],
  },

  briefing: {
    observable: [
      'Nothing walks at first: the links grow outward from point to point until the whole set is joined, and only then does a foot appear on one of them. The order of those two things is the claim that the paths were there before the question was asked.',
      'Each look throws spokes from the foot out to its five links, and from each of those a further line reaches on to the target. Which link lies closer is settled by the length of a line on screen rather than by a number the reader has to trust.',
      'The chosen link is drawn solid and thick while the rejected ones stay thin and dashed, so the decision is visible as a difference in weight at the moment it is taken.',
      'On the very first look two of the five reach the target by exactly the same length and the walk takes one of them anyway. The picture offers no reason for that choice, because there is none beyond the order in which the links happen to be held.',
      'The foot does not blink from place to place; it travels along a curved arc and leaves a trail, so after three moves the whole route from p0 through p3 and p5 to p7 is still lying on the plane.',
      'The walk ends on an absence rather than on a discovery: no link is closer, and a ring swells out of the resting point and stays there to mark the halt.',
      'The target is drawn as a crosshair inside a dashed circle with no point sitting on it, so the thing being walked toward is a position and the answer is whichever point ends up nearest it.',
    ],

    screen: {
      affordances: [
        'The walk plays once by itself on arrival and stops with the ring standing on the point it settled at.',
        'Under it sit a Replay button and a playback strip. Once the walk has finished, dragging the strip to its start returns to the bare set of links, and moving the handle to the look where two links tie lets a reader sit on it.',
        'The twelve positions, the five links per point, the starting place and the target are all fixed, and every point is named on screen, so an article can quote the route by name.',
      ],
    },

    useWhen: [
      'The prose has said that a search can walk to its answer rather than measure everything, and the word "walk" is carrying weight the reader has no picture for. On screen the foot can only ever move onto a point already joined to the one it occupies, which is what the word has to mean for it to mean anything.',
      'The reader needs the halting rule in the form they will actually meet it: the walk stops when nothing joined to the current point lies closer, and that is a weaker condition than having found the closest point in the collection. The ending here is an absence of anywhere better, not a discovery.',
    ],

    avoidWhen: [
      'The subject is how the links were chosen, or how many each point ought to hold. They arrive fully formed on this screen and never change while it runs.',
      'The article is about stacking sets of points at different densities above one another. There is one plane here, one set of links, one walk across it.',
      'The point is cost or speed. Twelve points are far too few for walking to beat measuring all of them, and nothing on this screen is counted.',
      'The subject is a route between two named places, or whether one place can be reached from another at all. The target here is a bare position with no point on it, and the walk is trying to stop early rather than to get anywhere in particular.',
    ],

    contrastWith: [
      {
        concept: 'hnsw',
        note: 'The walking is the same in both; the difference is that one takes wherever the walk rests as the answer, while the other asks how much structure it takes before every walk rests in the same place.',
      },
      {
        concept: 'coarseThenFine',
        note: 'Both move by the same rule, but one keeps every point at a single density while the other thins them out overhead so that a position can be settled roughly before it is settled finely.',
      },
      {
        concept: 'knn',
        note: 'Both end by naming something near the query, but one measures against every example it kept and can therefore assert the answer is right, while this halts as soon as nothing adjacent is better and cannot.',
      },
      {
        concept: 'markVisitedOrLoop',
        note: 'A walk over a graph normally needs a record of where it has been or it circles forever; this one needs no such record, because every move it makes is onto a strictly closer point and so it can never return to one it left.',
      },
    ],
  },
};
