/**
 * skipALayer 개념 선언.
 *
 * canonical facet 은 `facet:skipALayer` — 조각이다. 값 열둘이 오름차순으로 서고
 * 높이는 데이터로 주어져 있다. 여행자가 57 을 든 채 가장 높은 층에서 출발해 31 ·
 * 44 로 뛰고, 70 에서 지나쳐 튕겨 돌아온 뒤 한 층 내려서고, 곧바로 57 을 만난다.
 * 네 번 보고 끝나며, 한 층짜리였다면 밟았을 열 걸음이 아래에 유령 경로로 눕는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **규칙** 이다 — 앞으로 가다 지나치면 내려선다, 그리고
 * 답은 언제나 마지막으로 지난 값과 지나친 값 사이에 있다. definition 의 주어가
 * "찾기" 이고, keywords 는 경로 어휘(뛴다 · 내려선다 · 지나친다)만 갖는다.
 * 완제품 `skipList` 의 규모 어휘(log n 이 원소 수를 따라 어떻게 자라는가)도,
 * 조각 `coinFlipHeight` 의 생성 어휘(동전 · 확률 · 높이)도 여기 넣지 않았다.
 *
 * 높이가 어디서 왔는지는 이 화면이 답하지 않으므로 avoidWhen 에 담았다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const skipALayerConcept: FacetConceptSource = {
  id: 'skipALayer',
  label: 'Leap, Then Drop a Level',
  canonicalFacet: 'facet:skipALayer',

  surface: {
    definition:
      'Searching a structure of linked levels by two rules: move forward while the next value is below the target, and drop one level the moment it goes past it.',
    exemplarKeywords: [
      'express lane',
      'leap ahead then step down',
      'overshoot and drop a level',
      'start at the top level',
      'sparse level skips many nodes',
      'narrowing as you descend',
      'the answer lies between the last value passed and the one overshot',
      'search path through the levels',
      'predecessor lookup by following links',
      'how many nodes a lookup actually touches',
    ],
  },

  briefing: {
    observable: [
      'A value keeps the same horizontal position on every level it stands on, so a hop along a sparse upper level is physically long on screen and a hop along the bottom one is short. The phrase "skips ahead" is a distance rather than a claim.',
      'Every level is drawn with its own links from the head and a short stub where it runs out, and the towers under each value show how far up that value reaches.',
      'The traveller carries the target in a pin and hops in arcs, leaving a trail at pin height that records where it has actually been — as opposed to where it merely looked.',
      'Overshooting is played as a round trip rather than a decision made in advance: the traveller hops onto 70, it turns to the alert colour, the traveller recoils back to 44, and only then falls a level. 70 keeps an outline afterwards, marking a value that was examined and rejected.',
      'The drop lands on the last value passed, not on the head, so the walk resumes from where it already got to; on the level below, 57 is the very next value and the walk ends there with a ring that expands and fades.',
      'The closing line counts four looks against ten, and a dashed route grows along the bottom from the head, ticking off each of the ten values a walk on the bottom level alone would have had to touch.',
      'Running out of values on a level looks different from overshooting: the traveller simply falls, with no hop out and no rejected value left behind.',
    ],

    screen: {
      affordances: [
        'The walk plays once on its own and stops with both routes on screen — the short one through the levels and the long dashed one along the bottom.',
        'Two buttons: Replay, and a step control. The first press rewinds and shows the first beat; each further press takes one more, which is how a reader can hold the traveller on 70 while it is still red.',
        'Twelve values, their heights, and the target 57 are all fixed, so an article can name 31, 44 and 70 as the values leapt over and passed, and four against ten as the counts.',
      ],
    },

    useWhen: [
      'The prose has said the upper levels let a lookup skip ahead, and the reader should see what an unsuccessful skip costs: the leap onto 70 is taken, paid for as a look, and then taken back before the walk can go anywhere.',
      'The reader needs the rule in a form they can apply themselves — forward while the next value is smaller, down the moment it is bigger — together with the reason it is safe, which is that the target is penned between the last value passed and the one just overshot.',
    ],

    avoidWhen: [
      'The subject is where the heights came from. They are given here as data and stand still for the whole run; nothing on this screen produces them.',
      'The article is about the average over many lookups, or about how the cost moves as the collection grows. One value is looked up here, at one fixed size.',
      'The point is inserting or removing a value, which has to rewire a link on every level the value reaches. Nothing is added or taken away here.',
      'The article needs a value that turns out to be absent. The walk here closes on the value it set out for.',
      'The subject is reaching a position by computing into it rather than following links. Every move here is along a link that happens to exist.',
    ],

    contrastWith: [
      {
        concept: 'skipList',
        note: 'One is the rule for using the levels; the other is the claim about what that rule buys as the collection grows, which a single lookup cannot settle.',
      },
      {
        concept: 'coinFlipHeight',
        note: 'The making and the spending of the same levels: one decides how high each value reaches, the other is what a lookup does with the levels once they are there.',
      },
      {
        concept: 'traverseFromHead',
        note: 'Both start at a single door and can only move along links that exist; the difference is whether every link has to be followed or whether the sparse ones let most of them go unvisited.',
      },
      {
        concept: 'halveTheRange',
        note: 'Both close in on a value and give up the side that cannot hold it, but one chooses where to probe by computing a midpoint while this one can only take whichever link is offered next.',
      },
    ],
  },
};
