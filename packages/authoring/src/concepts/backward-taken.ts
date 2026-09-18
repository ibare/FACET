/**
 * backwardTaken 개념 선언.
 *
 * canonical facet 은 `facet:backwardTaken` — 다섯 줄짜리 프로그램(반복 안의 앞으로 뛰는
 * `blt`, 반복을 닫는 뒤로 뛰는 `bne`)을 네 번 돌며, 분기를 만날 때마다 화살의 방향만
 * 보고 짐작하고 그다음 흐름이 실제 결과대로 길을 탄다. 분기 여덟 번 중 방향 짐작이 일곱을
 * 맞히고, 끝에 같은 결과 열을 "언제나 탐"(3/8) · "언제나 안탐"(5/8) 과 견준다.
 * 손잡이는 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 주어 층위로 갈랐다. staticPrediction 은 "규칙들 사이의 고름" 이 주어이고, 이쪽은
 * "프로그램의 버릇" — 반복을 닫는 분기는 목표가 작은 주소에 있고 도는 동안 매번 탄다 —
 * 이 주어다. 그래서 definition 에 `rule` · `compared` · `fixed` 를 쓰지 않고,
 * mispredictionPenalty 의 `cycles` · `stage` · `fetched` 도 쓰지 않는다. 대신 `target` ·
 * `lower address` · `loop` · `exit` 를 이 개념이 독점한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const backwardTakenConcept: FacetConceptSource = {
  id: 'backwardTaken',
  label: 'Backward Taken, Forward Not Taken (Loops Jump Back)',
  canonicalFacet: 'facet:backwardTaken',

  surface: {
    definition:
      'A branch whose target sits at a lower address usually closes a loop, so guessing taken for jumps back and not taken for jumps ahead fails only at the exit.',
    exemplarKeywords: [
      'backward taken forward not taken',
      'BTFN',
      'backward branches are usually taken',
      'loop back-edge',
      'loop-closing branch',
      'jump to a lower address',
      'forward branch falls through',
      'loop exit mispredict',
      'guess from the branch direction',
      'why loops are easy to predict',
      'branch offset sign',
    ],
  },

  briefing: {
    observable: [
      'Each branch in the five-line program has a curved arrow beside the listing: the one jumping back to `loop` arcs high above, the one jumping ahead to `skip` curves below.',
      'Before the moving dot reaches a branch, the guess is set from the arrow\'s direction alone — the taken path or the fall-through path thickens — and only then does the dot travel the path the branch actually took.',
      'Each arrow carries a running count of how many times it has been ridden, and the back arrow climbs with every repetition of the loop.',
      'Of the eight branches met, the direction guess is wrong once — the last pass of the back jump, where the dot falls through past a "loop exit" mark instead of going round again.',
      'A board below stacks, for every branch met, the actual outcome and the guess by direction; at the end two more rows, always N and always T, drop down from the outcome row and score the same sequence: 7/8 by direction against 5/8 and 3/8.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole walk through the program and the closing comparison on its own and then stops.',
        'A Replay button and a playback strip sit underneath; dragging the strip back to a branch is how a reader can hold the moment the guess is set before the dot moves.',
        'The program and the sequence of outcomes are fixed, so an article can quote which single branch is guessed wrong and the three scores.',
      ],
    },

    useWhen: [
      'The article says loops make branches predictable and the reader needs to see why direction alone is enough: the jump that closes a loop points back and is taken every time the loop repeats.',
      'The prose asserts that the only guess such a scheme gets wrong in a loop is the final exit, and the reader should watch that single miss happen at the last pass.',
      'The article explains why compilers lay out code so that the rare case sits after a forward jump, and the reader needs the underlying habit of programs that makes that layout pay off.',
    ],

    avoidWhen: [
      'The subject is the cost of a wrong guess in cycles or the depth of the pipeline. Nothing here is timed or charged.',
      'The article compares several prediction policies on the totals they lose. Only the direction guess is followed step by step; the two alternatives appear once, as scores.',
      'The subject is a predictor that learns from past outcomes, or a loop whose trip count changes from run to run.',
      'The article uses "backward" for backward compatibility, backpropagation or walking a list in reverse.',
    ],

    contrastWith: [
      {
        concept: 'staticPrediction',
        note: 'This is the habit of programs that lets a guess ignore history and still be right; the other claim is that every guess fixed in advance wins on some branches only by losing on others.',
      },
      {
        concept: 'oneBitDoubleFault',
        note: 'Both stumble at the end of a loop, but guessing by direction pays exactly once per exit, whereas remembering only the last outcome pays again when the loop is entered next.',
      },
      {
        concept: 'mispredictionPenalty',
        note: 'This concerns how often a guess is right; that concerns what a single wrong guess costs, which is the same whatever made the guess.',
      },
    ],
  },
};
