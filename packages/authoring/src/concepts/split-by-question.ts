/**
 * splitByQuestion 개념 선언.
 *
 * canonical facet 은 `facet:splitByQuestion` — 점 열(아래 줄 A 다섯, 위 줄 B 다섯)
 * 위를 자름선 하나가 가로축을 따라 네 자리 미끄러지다가, 축을 갈아 세우면 첫
 * 자리에서 한 번에 갈리는 조각이다. 주인공은 점이 아니라 **자름선** 이고, 자름선에
 * 매달린 저울 둘이 양쪽에 무엇이 담겼는지를 들고 다닌다.
 *
 * ── 묶음 안에서 무엇을 맡는가
 *
 * 질문 하나 안에는 고를 것이 둘 들어 있다 — 어느 축인가, 그 축의 어디인가.
 * 이 조각은 그 **둘 중 무엇이 결정적인가** 하나만 말한다. 자름값을 아무리 옮겨도
 * 안 되던 것이 축을 바꾸면 한 번에 되는 장면이 그 논증이다.
 * 형제 `impurityDrops` 는 "잘 갈렸다" 를 재는 수 자체를 말하므로 definition 에
 * 지니도 엔트로피도 넣지 않았고, 완제품 `decisionTree` 는 이 고름을 되풀이하는
 * 절차와 멈춤을 말하므로 여기서는 재귀·깊이·과적합을 일절 말하지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const splitByQuestionConcept: FacetConceptSource = {
  id: 'splitByQuestion',
  label: 'Choosing the Split (Axis Before Threshold)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:splitByQuestion',

  surface: {
    definition:
      'A branch test chooses two things at once — which feature it looks at and where on that feature it cuts — and the wrong feature admits no cut position that works.',
    exemplarKeywords: [
      'which feature to split on',
      'choosing the split attribute',
      'threshold versus feature',
      'axis-aligned cut',
      'x < 5 style test',
      'candidate thresholds all score the same',
      'one attribute separates the classes and another cannot',
      'separable along a single feature',
      'feature choice at a node',
      'why the model needs the right variable',
    ],
  },

  briefing: {
    observable: [
      'One cut line stands on an axis with a knob on a rail, and it is that line rather than the points that moves for most of the screen.',
      'Two chips hang off the line and act as scales: each grows as long as the number of points on its side, and its colour boundary marks the mixture on that side.',
      'As the line slides, the chips change length — two against eight, four against six, six against four — while the colour boundary on each chip stays fixed at the halfway mark.',
      'Every cut position available on that axis is tried in turn, and a caption reports how many were tried once they run out.',
      'Changing axis is drawn as a rotation, not a redraw: the line turns on the plot, changes length, and the knob leaves the horizontal rail and lands on the vertical one.',
      'On the new axis the very first position drives one chip to a single colour and the other to the other colour.',
      'The closing caption names what did the work — the axis, not the position.',
    ],

    screen: {
      affordances: [
        'The argument plays through once by itself: every failing position first, then the rotation, then the position that works.',
        'Two buttons: Replay, and a step control that rewinds and then moves one cut position at a time, so the reader can stop on any of the failing positions and read its chips.',
        'The ten points are fixed and laid out in two horizontal bands, so the article can state exactly which feature separates them.',
      ],
    },

    useWhen: [
      'The article says a node picks the best question and the reader reads that as picking a number, missing that the feature is being picked too.',
      'The reader needs to see that a set of candidate cuts can be exhausted with nothing to choose between them — all equally useless — before an argument about needing better features or deeper trees will land.',
      'A model is about to be blamed for failing on data where no single given feature separates the classes, and the reader should first see what "the right feature" looks like when it exists.',
    ],

    avoidWhen: [
      'The subject is how a candidate cut is scored — impurity, entropy, information gain. No number is computed on this screen; the sides are shown, not measured.',
      'The article is about growing a whole tree, its depth, or its overfitting. Exactly one test is considered here and nothing is ever split twice.',
      'The point is a boundary that is not parallel to an axis — a linear model, a margin, a kernel. The line here only ever stands on one of the two given axes.',
      'The article uses "split" for partitioning data into training and test sets, or for sharding and splitting a dataset across workers.',
    ],

    contrastWith: [
      {
        concept: 'impurityDrops',
        note: 'This asks what a question is choosing between; that one supplies the single number by which those choices are compared and ranked.',
      },
      {
        concept: 'decisionTree',
        note: 'A single test that either separates the labels or does not, against the repetition of such tests down both sides until a depth cap stops it.',
      },
      {
        concept: 'kernelLifts',
        note: 'Both face data that a straight cut on the given features cannot separate; one answers by choosing a better existing feature, the other by manufacturing new ones.',
      },
      {
        concept: 'decisionBoundary',
        note: 'The line here is restricted to lie along a given axis, which is what makes the choice of axis decisive rather than a matter of angle.',
      },
    ],
  },
};
