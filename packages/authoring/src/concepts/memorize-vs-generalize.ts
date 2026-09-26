/**
 * memorizeVsGeneralize 개념 선언.
 *
 * canonical facet 은 `facet:memorizeVsGeneralize` — 같은 여섯 예(그 가운데 x = 7.3 의 답 0 은 잘못 매긴 것)를 받은
 * 두 답안자에게 본 문제 여섯, 이어 새 문제 다섯을 묻는다. 외운 쪽(가장 가까운 예의 답)은 본 것 6/6 · 새 것 3/5,
 * 배운 쪽(문턱 t = 4.20 하나)은 5/6 · 5/5. 새 문제 셋째에서 앞선 자리가 뒤바뀐다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `overfitting` 이 데이터 양을 돌려 벌어짐이 좁혀지는 대비를, 형제 `trainDownValUp` 이 유연함 축 위의 두 오차
 * 곡선을 맡는다. 이쪽은 곡선도 손잡이도 없는 **두 답안자의 점수 뒤바뀜** 한 장면이다. definition 은 memorizes ·
 * mislabeled · simple rule · seen vs new · trade places 를 독점하고, error · validation · degree · data size 를 쓰지 않는다.
 *
 * 전제 (설명 글 `memorizeVsGeneralize.md`): 외우기는 이웃 하나(1-NN)로 둔 가장 단순한 꼴, 배운 쪽의 문턱은 본 것에서 틀린
 * 수가 가장 적은 후보(다섯 중 하나)다. 데이터는 뒤바뀜이 보이도록 고른 장난감이고, 5/5 는 이 다섯 문제에서의 결과일 뿐이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const memorizeVsGeneralizeConcept: FacetConceptSource = {
  id: 'memorizeVsGeneralize',
  label: 'Memorizing vs Generalizing (Seen Questions vs New Questions)',
  canonicalFacet: 'facet:memorizeVsGeneralize',

  surface: {
    definition:
      'A learner that memorizes every example, a mislabeled one included, scores perfectly on the questions it has seen but trails on new ones behind a simple rule that got one seen example wrong.',
    exemplarKeywords: [
      'memorization vs generalization',
      'perfect training accuracy',
      'fitting label noise',
      'lookup table model',
      '1-nearest neighbour memorizes',
      'seen vs unseen examples',
      'simpler model generalizes better',
      'Occam\'s razor in machine learning',
      'high training score low test score',
    ],
  },

  briefing: {
    observable: [
      'A number line from 1 to 10 holds six labelled examples (answers 0 or 1) and a dashed threshold "t = 4.20". Below it two race lanes, "Memorizer" and "Learner", each keep two scores: "Seen questions" out of 6 and "New questions" out of 5.',
      'The Memorizer answers with the label of the nearest example, drawing an arc to it; the Learner answers 1 if x is past the threshold. Each step asks both the same question: "Seen question 5 — x = 7.3 · true answer: 0". A correct answer moves that lane\'s token forward, marked "Right" or "Wrong", and the lane in front is tagged "Ahead" and shown on top.',
      'The example at x = 7.3 has answer 0 although every other example and every new question follows "larger x is 1". On the seen questions the Memorizer reproduces it and finishes 6/6; the Learner answers 1 there and finishes 5/6, one behind.',
      'On the new questions 7.0 and 7.6 the Memorizer\'s nearest example is the mislabeled 7.3, so it answers 0 twice and is wrong both times, ending 3/5. The Learner answers all five correctly, 5/5, and takes the top place on the third new question.',
      'Twelve steps: the ready screen with "Learned threshold: t = 4.20", six seen questions, five new ones. The threshold was picked from five candidates as the one with fewest seen mistakes (one).',
      'Memorizing is reduced to its simplest form, a single nearest neighbour; the six examples and five questions are toy data chosen so the swap appears. The Learner\'s 5/5 is a result on these five questions, not a guarantee. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one question per step, twelve steps including the start, and stops after the fifth new question.',
        'A Replay button and a playback strip sit below it. Dragging back to seen question 5 holds the moment the Memorizer goes ahead by reciting the wrong label; new question 3 is where the lanes swap.',
        'All examples, questions and the threshold are fixed, so the scores 6/6 · 3/5 and 5/6 · 5/5 can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article opens the topic of overfitting for readers without mathematics and needs a case where the higher score on familiar questions belongs to the worse learner.',
      'A reader asks how a model can be 100% correct on its training data and still be bad; the Memorizer copying one noisy label and then misusing it answers that.',
      'The article argues that a simpler rule which tolerates a training mistake can be the better model, and wants the one wrong seen answer and the flawless new answers side by side.',
    ],

    avoidWhen: [
      'The article needs error curves, degrees of a polynomial, or a validation measurement over many points. There are only eleven questions and two fixed answerers.',
      'The subject is how k-nearest neighbours works or how k is chosen. The Memorizer is only a stand-in for memorizing; no k is varied.',
      'The point is class imbalance or threshold selection for a score. The threshold here is learned once and never moves.',
    ],

    contrastWith: [
      {
        concept: 'overfitting',
        note: 'The reversal between seen and new scores is the symptom in its plainest form; quantifying the gap and asking how much data it takes to close it is the next step.',
      },
      {
        concept: 'trainDownValUp',
        note: 'Here two fixed learners are compared once; along a complexity axis the same contrast becomes continuous, with training and held-out error drifting apart as flexibility grows.',
      },
      {
        concept: 'knn',
        note: 'Nearest-neighbour classification uses k neighbours to smooth over noisy labels; looking at only one neighbour is what turns it into pure memorization of every label, wrong ones included.',
      },
    ],
  },
};
