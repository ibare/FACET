/**
 * gapShrink 개념 선언.
 *
 * canonical facet 은 `facet:gapShrink` — 값 여섯을 보폭 3 라운드와 보폭 1
 * 라운드로 차례로 훑으며, 칸 아래 보폭 자가 좁아지는 것과 아래 장부 두 줄
 * (보폭을 줄여 온 쪽 / 처음부터 옆칸만 견준 쪽)의 이동 횟수를 나란히 보이는
 * 조각이다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품(`shellSort`)이 알고리즘의 정체(이름 · 간격 수열 · 사슬 · 코드)를
 * 진다면, 이 조각이 지는 것은 그 앞에 놓인 의심 하나다 — "마지막에 어차피
 * 옆칸끼리 다 견줄 거면 앞 라운드는 낭비 아닌가." 그래서 definition 에
 * 알고리즘 이름을 넣지 않고, 값 하나가 한 번에 여러 칸을 건너간다는 **운동**
 * 과 그 대가로 줄어드는 **이동 횟수** 만 담는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const gapShrinkConcept: FacetConceptSource = {
  id: 'gapShrink',
  label: 'Shrinking the Stride (Far Pairs First)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:gapShrink',

  surface: {
    definition:
      'Comparing pairs several seats apart before comparing neighbours lets a badly placed value cross many seats in one move, leaving the closing neighbour pass with far less to do.',
    exemplarKeywords: [
      'why compare far apart first',
      'stride',
      'long jumps instead of one seat at a time',
      'a big value stuck at the front',
      'cutting down the number of moves',
      'nearly sorted before the last pass',
      'is the early pass wasted',
      'wide pairs then close pairs',
    ],
  },

  briefing: {
    observable: [
      'The seats stay put and the numbers move, so a value crossing three seats is one flight rather than three separate exchanges.',
      'A measuring bracket under the row spans exactly the two seats being compared, so the stride is a length on screen; when the round changes, that length collapses to a single neighbouring seat.',
      'The wide round moves the worst-placed values a long way in very few flights, and by the time neighbours are being compared there is little left that is out of order.',
      'A ledger at the bottom holds two rows on the same scale: the run that shrank its stride, and the same input taken with neighbours only from the start.',
      'Comparison counts on the two rows come out close together while the move counts do not, which puts the saving squarely in the moving.',
      'Both numbers are counted by the run itself under one rule, so the two rows are measured with the same ruler.',
    ],

    screen: {
      affordances: [
        'The screen plays both rounds and then reveals the comparison row on its own, stopping with the two ledger rows side by side.',
        'Two buttons: Replay, and a step control for taking one comparison at a time, which is how a reader can stop on a wide pair before it trades.',
        'The six values and the two strides are fixed, so an article can name the value that crosses the row and the totals it ends with.',
      ],
    },

    useWhen: [
      'The reader suspects the early wide pass is extra work bolted onto a sort that would have finished anyway. Two move totals from the same input, counted the same way, are what answer that suspicion instead of restating it.',
      'The prose says a value is "far from where it belongs" and the reader cannot see why distance costs anything. One value hopping three seats in a single flight, against the same value inching over one seat at a time, is the cost made visible.',
      'A method is about to be introduced that reorders far-apart elements before near ones, and the reader needs a reason to accept that ordering before the details arrive.',
    ],

    avoidWhen: [
      'The article needs the name of the algorithm, its gap sequence, or the fact that its inner loop is insertion sort with one constant changed. None of that is on screen; only the effect of widening the stride is.',
      'The subject is the gap between elements in memory — stride in an array layout, cache lines, or how a matrix is walked. The word is shared and the topic is not.',
      'The point is choosing a good sequence of strides, or how the choice affects running time. Two strides are used here and neither is presented as a recommendation.',
      'The input in question is already nearly sorted. A single neighbour pass costs almost nothing there, and the argument on screen depends on distant disorder existing.',
    ],

    contrastWith: [
      {
        concept: 'shellSort',
        note: 'The argument for widening the stride, against the algorithm built on it — where the strides come from, what chains a round really orders, and how little the code differs from insertion sort.',
      },
      {
        concept: 'shiftOnInsert',
        note: 'Making room one seat at a time is exactly the cost being avoided here, and the two move totals are the size of that cost.',
      },
      {
        concept: 'bubbleAdjacentSwap',
        note: 'Both move values by exchanging pairs, but exchanging only neighbours means a value can never travel faster than one seat per swap, which is the limit the stride is there to break.',
      },
      {
        concept: 'insertIntoSortedPart',
        note: 'One takes a value and walks it back into an ordered prefix; here the walk is the same and only the size of the step differs.',
      },
    ],
  },
};
