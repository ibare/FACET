/**
 * squashToProbability 개념 선언.
 *
 * canonical facet 은 `facet:squashToProbability` — 위에 끝없는 점수 축 하나,
 * 아래에 0 과 1 두 벽에 갇힌 띠 하나, 그 사이를 잇는 깔때기. 점수 아홉이
 * 가운데에서 바깥으로 하나씩 내려앉으며 축에서 벌린 거리와 띠에서 얻은 폭을
 * 나란히 적는 조각이다. 점 무리도 결정 경계도 학습도 여기 없다.
 *
 * ── 묶음 안에서 갈라 둔 자리
 *
 * 완제품 `logisticRegression` 은 배우는 것과 고르는 것을, `decisionBoundary`
 * 는 확률의 마당에서 선이 드러나는 자취를 진다. 이 조각이 지는 것은
 * **함수 하나의 모양** 이다 — 무한한 축이 유한한 띠로 접힐 때 거리가 균일하게
 * 옮겨지지 않는다는 사실. definition 에 "classifier" 도 "boundary" 도 넣지
 * 않은 것은 그 때문이다.
 *
 * 변별어를 붙이지 않았다. `squashToProbability` 는 그 자체로 동작을 특정한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const squashToProbabilityConcept: FacetConceptSource = {
  id: 'squashToProbability',
  label: 'Squashing a Score into a Probability (Sigmoid)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:squashToProbability',

  surface: {
    definition:
      'The sigmoid maps an unbounded real score onto the open range between zero and one, stretching values near the middle and compressing everything far out.',
    exemplarKeywords: [
      'sigmoid',
      'logistic function',
      '1 / (1 + e^-z)',
      'squashing function',
      'logit and odds',
      'saturation',
      'the gradient goes flat',
      'why the score is not already a probability',
      'turning a raw score into a percentage',
      'confidence between 0 and 1',
      'never quite reaches 0 or 1',
    ],
  },

  briefing: {
    observable: [
      'The picture is two things and nothing else: a score axis whose ends carry arrows and infinity marks, and below it a band held between two walls at 0 and 1.',
      'Each landing draws a funnel joining a stretch of the axis to the stretch of the band it went to, and the funnels are visibly different shapes — the middle ones flare open, the outer ones are squeezed to threads.',
      'Steps run outward from the centre rather than left to right, so the width each step buys shrinks monotonically as the run goes on and the shrinking is the order itself.',
      'Every landing after the first prints two numbers side by side: how far the score moved along the axis, and how much of the band that move bought.',
      'One step along the axis near the middle buys about 0.23 of the band, while a move four times as long out at the edge buys about 0.018 — the same distance does not buy the same amount.',
      'The last step presses everything beyond the outermost scores into two slivers at the ends of the band, and the numbers there read 0.0003 and 0.9997 rather than 0 and 1.',
      'Those endpoint values are the only thing that says the walls are never reached; at this scale the slivers are drawn touching the walls, so the fourth decimal is carrying the claim, not the drawing.',
      'The formula sits at the top of the frame, so the shape below can be checked against it rather than taken on trust.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole mapping by itself on mount, from the centre outward, and stops with both tails pressed in.',
        'Two buttons: Replay, and a step control that walks the same landings one at a time, which is how the reader can compare the two numbers on one step before the next one covers it.',
        'The nine scores are fixed at -8 to 8, so an article can name 0.9997 or the step from 0 to 1 and rely on the reader finding it.',
      ],
    },

    useWhen: [
      'The article has written a model as a weighted sum and then started calling the result a probability, and the reader has been given no reason why a number that can be any size may be read that way.',
      'The reader has to understand why a confident model learns almost nothing from the examples it is already sure about: out at the edges a large change in the score barely moves the output at all, and here the two numbers for that step are printed together.',
      'A logarithm is about to be taken of the model\'s output and the reader needs to know it cannot blow up, because the function never actually arrives at either wall.',
      'The prose says a function "maps the real line into an interval" and the reader takes that as a formality. The funnels make it a physical squeeze with visibly unequal parts.',
    ],

    avoidWhen: [
      'The subject is a spread of probabilities over several classes and how they are made to sum to one. One score becomes one number here.',
      'The article is about how the weights that produce the score are learned. Nothing on screen is fitted; the scores are simply given.',
      'The point is choosing an activation function for hidden layers, or comparing this one against the alternatives that replaced it. This is about the shape of the map, not about network design.',
      'The article needs calibration — whether a stated probability matches how often the thing actually happens. There are no outcomes here to compare against.',
      'The subject is where a model splits one class from another. That is a place in the input space, and this screen has no input space.',
    ],

    contrastWith: [
      {
        concept: 'logisticRegression',
        note: 'This is the one stage that turns a score into a probability; the full model wraps it in learned weights and a threshold that the reader picks.',
      },
      {
        concept: 'decisionBoundary',
        note: 'Both concern the same probability, from opposite ends: here it is a value on a band with no plane, there it is a value at every place in a plane.',
      },
      {
        concept: 'matrixTransform2d',
        note: 'Both show what a function does to a whole space rather than to one input, but this one folds an infinite line into a finite interval instead of moving a plane around.',
      },
    ],
  },
};
