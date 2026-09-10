/**
 * logisticRegression 개념 선언.
 *
 * canonical facet 은 `facet:logisticRegression` — 왼쪽 평면(점 열아홉 + 옅게
 * 물든 두 영역 + 선 하나)과 오른쪽 0~1 띠(시그모이드 곡선 위에 앉는 점들)를
 * 한 화면에 두고, 무게가 학습되는 동안 둘이 함께 움직인다. 재생 컨트롤 위에
 * 결정 문턱 슬라이더가 얹혀 있고, 카운터 셋과 코드 패널을 갖춘 완결형이다.
 *
 * ── 묶음 안에서 갈라 둔 자리
 *
 * 이 개념이 지는 것은 **모형 전체와 그 안에서 무엇이 배워지고 무엇이 골라지는가**
 * 다 — 경사하강이 무게를 옮기는 동안 선이 돌고, 학습이 끝난 뒤에도 남는 문턱이
 * 놓침과 헛짚음을 맞바꾼다.
 *
 * 무한한 점수가 0~1 로 접히는 대목은 `squashToProbability`, 확률의 마당에서
 * 선이 드러나는 대목은 `decisionBoundary` 가 맡는다. 셋 다 같은 모형을 다루므로
 * definition 의 무게중심을 서로 다른 데 두었다 — 이쪽은 학습과 선택,
 * 조각 둘은 함수 하나와 자취 하나다.
 *
 * 변별어를 붙이지 않았다. "logistic regression" 은 이 모형 하나를 가리킨다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const logisticRegressionConcept: FacetConceptSource = {
  id: 'logisticRegression',
  label: 'Logistic Regression',
  domain: 'ml-basics',
  canonicalFacet: 'facet:logisticRegression',

  surface: {
    definition:
      'A two-class model that learns weights turning features into a probability, and then leaves the cut-off at which that probability is called a decision to the user.',
    exemplarKeywords: [
      'logistic regression',
      'binary classification',
      'log loss',
      'cross-entropy',
      'gradient descent on weights',
      'decision threshold',
      'precision and recall trade-off',
      'false positives and false negatives',
      'spam or not spam',
      'medical screening cut-off',
      'predicted probability of a class',
    ],
  },

  briefing: {
    observable: [
      'Two panels move as one: the line turning in the plane on the left and the points sliding along the curved ribbon on the right are the same weights seen twice.',
      'At the first frame every point sits at the middle of the ribbon and the caption says so — the weights begin at zero, so the model starts by giving every point the same answer.',
      'The frames are unevenly spaced through the run, close together early and far apart late, so the early rush and the long slow tail of the descent both stay visible.',
      'A readout under the panels carries the step number, both weights, the bias and the log-loss together, so the reader can see the loss falling while the numbers that caused it change.',
      'Three tallies — right, missed, false alarm — are kept apart instead of being summed into one accuracy figure, which is what makes the two kinds of mistake comparable.',
      'Moving the threshold changes the tallies and slides the line while the weights in the readout stay exactly where they were, and the caption names that: only the place where you say "this one" has moved.',
      'Two of the nineteen points stand inside the other side\'s territory, so no setting of the threshold ever drives both missed and false alarm to zero.',
      'The line in the left panel is drawn where the probability crosses the threshold, so raising the threshold moves it parallel to itself rather than tilting it.',
      'The code panel holds one training step, and the highlighted line follows the five stages the animation is playing.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider, with the training replaying from zero weights on reset.',
        'A three-position slider sets the decision threshold at 0.3, 0.5 or 0.8, and it stays live after the training has finished — that is where the argument of this screen is made.',
        'The code panel starts empty. The reader presses "+ Add language" and picks from Python, JavaScript, TypeScript, Java, C++ and C#; two can sit side by side.',
        'The nineteen points and the learning rate are fixed, so the article can send the reader to the two overlapping points and know they are there.',
        'Letting the run finish and then moving the slider across all three positions is how the trade-off is read: the tallies change while the weights do not.',
      ],
    },

    useWhen: [
      'The article treats a classifier as something that outputs a class, and the reader has to see that it outputs a number and that someone chose where to cut it. Sliding the threshold on finished weights separates the two acts in one gesture.',
      'The prose claims that reducing false alarms costs you misses, and the reader has no way to feel the exchange. Three tallies moving in opposite directions under a slider is the exchange itself.',
      'The reader believes a model that cannot classify everything correctly is badly trained. Two points sitting in each other\'s territory, surviving the whole run, shows that the limit is in the data.',
      'The article needs the reader to accept that fitting is a slow crawl rather than a solve: the early frames move the line visibly and the late ones barely at all, while the loss keeps inching down.',
    ],

    avoidWhen: [
      'The target in the article is a continuous quantity — a price, a duration, a temperature. Everything on screen is a two-way label.',
      'The subject is more than two classes, or the normalisation across several outputs that goes with it. There is one probability here and one cut-off.',
      'The article is about regularization, overfitting, validation or held-out data. One dataset is shown and nothing here measures generalisation.',
      'The article uses "logistic" for a growth curve, an adoption S-curve, or anything to do with logistics and supply chains.',
      'The point is feature engineering or high-dimensional inputs. Two features exist here so that the whole model can be drawn as a plane and a line.',
    ],

    contrastWith: [
      {
        concept: 'squashToProbability',
        note: 'The function that makes the probability, taken on its own with no data and no learning, against the whole model in which that function is one stage.',
      },
      {
        concept: 'decisionBoundary',
        note: 'That one holds the weights still and asks where the line comes from; this one moves the weights and asks what is left for the reader to choose afterwards.',
      },
      {
        concept: 'linearRegression',
        note: 'Both fit a straight line by descending a loss, but one puts the line through the points to predict a value and the other puts it between them to split labels.',
      },
      {
        concept: 'svm',
        note: 'Two ways to place a separating line: one by making predicted probabilities agree with labels, the other by pushing the gap between the groups as wide as it will go.',
      },
    ],
  },
};
