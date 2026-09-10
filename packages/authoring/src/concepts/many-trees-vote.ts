/**
 * manyTreesVote 개념 선언.
 *
 * canonical facet 은 `facet:manyTreesVote` — 나무 다섯과 물음 다섯 사이에 스물다섯
 * 개의 답을 고정해 놓은 조각이다. 물음마다 답이 좌우로 갈렸다가 다수 쪽이 하나로
 * 모이고, 진 표와 틀린 답은 빗금이 그어진 채 판에 남는다. 답표는 학습으로 얻은
 * 것이 아니라 논증을 위해 못박은 것이다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `randomForest` 는 방법 전체와 산출(확신의 정도)을 말하고, 형제 조각
 * `baggingSample` 은 구성원을 서로 다르게 만드는 뽑기를 말한다. 이 조각의
 * 무게중심은 **집계 그 자체가 기대는 성질** — 틀림이 한 자리에 쌓이지 않고
 * 흩어져 있어야 한다는 것 — 이다. 그래서 definition 에 나무도 표본도 넣지 않고
 * "여러 분류기의 틀림이 어디에 놓이는가" 로 썼다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const manyTreesVoteConcept: FacetConceptSource = {
  id: 'manyTreesVote',
  label: 'Ensemble Vote (Why Scattered Mistakes Cancel)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:manyTreesVote',

  surface: {
    definition:
      'A majority over several imperfect answerers can be right where every one of them is wrong, provided their mistakes land on different cases instead of piling onto the same one.',
    exemplarKeywords: [
      'majority vote',
      'why an ensemble beats its members',
      'errors cancel out',
      'uncorrelated mistakes',
      'wisdom of crowds',
      'aggregating weak learners',
      'voting classifier',
      'when averaging models does not help',
      'correlated failures',
    ],
  },

  briefing: {
    observable: [
      'A board holds one answer per answerer per question, twenty-five in all, laid out before anything moves.',
      'Within a question the answers push apart to one side or the other according to what they chose, so the count of votes is read as position and size rather than from a number.',
      'The larger side sends a copy of each of its answers flying into a single cell, and that cell is then set against the true answer on the row below it.',
      'Losing votes are never cleared away. Answers that disagree with the truth get a stroke through them and stay where they were pushed, so seven struck answers are scattered over the board by the end.',
      'The struck marks never stack up in one column: in every question the wrong side stays the smaller one, and it is a different set of answerers each time.',
      'The closing tally puts the individual scores of three, four, four, three and four against the score of the majority, which is five out of five — no individual matched it.',
    ],

    screen: {
      affordances: [
        'The screen plays through the five questions on its own and finishes on the tally.',
        'Two buttons: Replay, and a step control for taking one question at a time, which is how a reader can stop on a question and count the two sides before the majority is taken.',
        'The board of answers is fixed rather than learned, so an article can quote any single answer, any individual score and the final comparison exactly.',
      ],
    },

    useWhen: [
      'The article asserts that combining models helps and a reader suspects it only helps because the good model outvotes the bad ones. Nobody on this board is good — the best manages four out of five — and the majority still takes all five.',
      'The prose needs the condition under which aggregation works, not just the fact that it does. Struck answers sitting in different columns, never stacking, is that condition made visible.',
      'A reader has to be warned about the failure mode: answerers that go wrong together. The scatter is what carries the argument, so its absence is what would break it.',
      'The article is about to justify deliberately handicapping the members of an ensemble, and needs the payoff of their disagreement established before the cost is introduced.',
    ],

    avoidWhen: [
      'The subject is how any one member arrives at its answer. The answers are given here and nothing is fitted or explained.',
      'The topic is voting in a distributed system — quorums, consensus rounds, leader election, replicas agreeing on a value. Nothing here is trying to agree; the disagreement is the resource.',
      'The article is about elections, polling or preference aggregation among people, or about paradoxes of voting rules.',
      'The subject is boosting, where members are trained in sequence and their votes carry different weights. Every vote counts once here.',
      'The point is a numeric prediction being averaged. Every answer on the board is one of two labels.',
    ],

    contrastWith: [
      {
        concept: 'baggingSample',
        note: 'Sibling halves of one argument: that one makes the members differ, this one is the reason it was worth making them differ.',
      },
      {
        concept: 'randomForest',
        note: 'The board here is fixed so the aggregation can be read on its own; the forest grows the members first, which makes the same effect real but harder to isolate.',
      },
      {
        concept: 'voteByNeighbors',
        note: 'Both settle an answer by counting votes, but there the voters are nearby data points around one query and here they are separate answerers judging the same question.',
      },
      {
        concept: 'decisionTree',
        note: 'One tree is a single answerer of the kind lined up on this board; nothing here looks inside it.',
      },
    ],
  },
};
