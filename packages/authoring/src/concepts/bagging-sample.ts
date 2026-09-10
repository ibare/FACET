/**
 * baggingSample 개념 선언.
 *
 * canonical facet 은 `facet:baggingSample` — 번호 여덟짜리 주머니에서 여덟 번
 * 뽑아 벌 하나를 만들기를 세 벌 되풀이하는 조각이다. 타일이 벌로 날아가 복제본을
 * 남기고 **제자리로 돌아오는** 왕복이 화면의 동사이며, 눈금이 하나도 안 찍힌
 * 타일이 벌마다 다르게 남는다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `randomForest` 는 방법 전체와 산출(확신의 정도)을 말하고, 형제 조각
 * `manyTreesVote` 는 모으는 쪽을 말한다. 이 조각의 무게중심은 **뽑기 한 번의
 * 산술** — 되돌려 넣기 때문에 자리가 겹치고, 겹친 만큼 빠지는 것이 생기며, 그
 * 비율이 대략 3분의 1 이라는 것 — 이다. 나무도 투표도 화면에 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const baggingSampleConcept: FacetConceptSource = {
  id: 'baggingSample',
  label: 'Bagging (Bootstrap Sample with Replacement)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:baggingSample',

  surface: {
    definition:
      'Drawing n rows out of n with replacement: duplicates take up the room, so roughly a third of the rows are never drawn, and a different third is missing from each sample.',
    exemplarKeywords: [
      'bootstrap sample',
      'bagging',
      'sampling with replacement',
      'out-of-bag',
      'OOB rows',
      'resampling one dataset',
      '(1 - 1/n)^n',
      'about 36.8 percent',
      'making models see different data',
      'free validation set',
    ],
  },

  briefing: {
    observable: [
      'A tile lifts out of the pool, flies down into a slot of the bag, leaves a copy there and travels back to where it came from; the empty notch it left is dashed while it is away and filled again on its return.',
      'The return is the whole point of the motion: because the notch closes, the same tile can and does come out again a moment later, and the caption says so when it does.',
      'Tally marks accumulate under each pool tile counting how many times that number was drawn into the current bag, so a tile with two marks and a tile with none sit side by side.',
      'When a bag is finished the tiles with no marks stand out and their copies drop into a separate area that stays on screen, which is where the leftovers of that bag are read off.',
      'Three bags run one after another and the leftovers differ each time, both in which numbers they contain and in how many there are.',
      'The closing caption puts the observed leftovers against the figure the formula gives for eight draws, and the three bags come out at a quarter, three eighths and three eighths rather than all landing on it.',
    ],

    screen: {
      affordances: [
        'The screen plays all three bags on its own, eight draws each, and stops on the closing caption.',
        'Two buttons: Replay, and a step control for taking one draw at a time, which is how a reader can pause on a tile being drawn for the second time.',
        'The pool and the three draw orders are fixed, so an article can name the number that comes out twice in the first bag and the numbers that never come out at all.',
      ],
    },

    useWhen: [
      'The article says the models in an ensemble are trained on different data, and the reader objects that there is only one dataset. The tile going out and coming back is the entire mechanism by which one dataset becomes several.',
      'A reader treats "with replacement" as an incidental detail of the sampling procedure. Without the return trip the eight draws would empty the pool and every bag would be the original, which is what the closing notch makes visible.',
      'The prose needs the leftovers to be a resource rather than waste — rows a model has provably never seen, available for testing it without setting anything aside in advance.',
      'The article quotes a figure near a third for how much is left out and the reader wants to know whether that is a rule. Three bags landing on three different fractions at this size is the honest answer.',
    ],

    avoidWhen: [
      'The subject is splitting data once into training and test parts, or rotating folds for cross-validation. Both draw without replacement and nothing is ever duplicated in them.',
      'The article uses the bootstrap to attach a confidence interval to a statistic. No quantity is estimated here and nothing is aggregated across the bags.',
      'The topic is bootstrapping in the software sense — a machine starting up, a compiler compiling itself, a CSS framework of that name.',
      'The point is what is done with the samples afterwards: growing a model on each, or combining their answers. Nothing is trained or predicted on this screen.',
      'The article needs weighted or stratified sampling, or a scheme that guarantees coverage. Every draw here is uniform and independent.',
    ],

    contrastWith: [
      {
        concept: 'randomForest',
        note: 'This is one draw-and-replace pass in isolation; the forest is what happens after the same trick is applied sixteen times and something is grown on each result.',
      },
      {
        concept: 'manyTreesVote',
        note: 'Sibling halves of one argument: this makes the members differ, that one shows why differing members are worth aggregating.',
      },
      {
        concept: 'decisionTree',
        note: 'The tree is the thing each of these bags would be fed to; here nothing is fitted, only the data handed over is being shaped.',
      },
    ],
  },
};
