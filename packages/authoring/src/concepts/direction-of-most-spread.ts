/**
 * directionOfMostSpread 개념 선언.
 *
 * canonical facet 은 `facet:directionOfMostSpread` — 왼쪽에 점 열둘과 가운데를
 * 지나며 도는 축, 오른쪽에 각도에 따른 퍼짐 곡선과 합 막대를 둔 조각이다.
 * 자동으로 한 호흡 돌고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `pca` 는 절차 전체와 그 답이 축의 단위에 매여 있음을 말한다. 여기서는
 * 그 앞의 물음 하나만 든다 — **"가장 넓게 퍼진 방향" 이라는 말이 무엇을 잰
 * 것인가.** 무게중심은 각도의 함수로서의 분산과, 돌려도 합이 변하지 않는다는
 * 곁들여 드러나는 사실이다. 같은 묶음의 `projectAndLose` 는 축을 이미 주어진
 * 것으로 두므로 여기와 겹치지 않는다.
 *
 * keywords 에 PCA 실무 어휘(표준화 · 설명 분산 비율 · 고유벡터)를 넣지 않았다 —
 * 그쪽은 완제품 몫이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const directionOfMostSpreadConcept: FacetConceptSource = {
  id: 'directionOfMostSpread',
  label: 'The Direction of Most Spread (Variance as a Function of Angle)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:directionOfMostSpread',

  surface: {
    definition:
      'The spread of a point cloud read as a function of direction: turning an axis through its centre raises and lowers the spread of the projected marks, which peaks in one direction.',
    exemplarKeywords: [
      'direction of maximum variance',
      'the widest direction through a cloud',
      'rotating an axis and measuring',
      'projected variance',
      'variance depends on the angle you look from',
      'the total spread stays the same as the axis turns',
      'perpendicular directions divide the spread',
      'why variance is the criterion at all',
      'the main axis of an elongated cloud',
    ],
  },

  briefing: {
    observable: [
      'The axis pivots through the centre of the cloud, and every point drops onto it to leave a mark, so what is being measured is the spread of the marks rather than of the points.',
      'A curve on the right is written as the axis turns, with a head running along it, and the coarse pass leaves it as widely spaced readings before the neighbourhood of the highest one is measured again and fills in.',
      'The curve has one peak and one trough, and they stand a quarter turn apart.',
      'The axis comes back after the sweep and settles at the peak, around thirty-eight degrees off horizontal, which is a return rather than an arrival — the highest reading was already passed once.',
      'A bar under the curve is split between the spread along the axis and the spread across it; the split slides as the axis turns while the right-hand end of the bar never moves.',
      'The closing caption gives the peak direction\'s share of that total, above ninety percent, and the caption during the sweep names the two spreads and their sum as they are read.',
    ],

    screen: {
      affordances: [
        'The screen turns the axis, finds the peak and stops there on its own.',
        'Two buttons: Replay, and one step at a time, which is how to hold on a single angle and read the two spreads against their sum.',
        'The twelve points are fixed, so the peak angle and the share an article quotes stay the same for every reader.',
      ],
    },

    useWhen: [
      'The prose asserts that a cloud has a "direction of greatest variance" without saying what makes one direction greater than another. Watching a single number rise and fall as the axis turns converts the phrase into something that was measured.',
      'The reader suspects that choosing a direction manufactures structure that was not there. The bar whose far end never moves says the opposite — turning the axis only redistributes a fixed total between two perpendicular directions.',
      'An article is about to jump from a cloud of points to an eigenvector, and the reader needs to know what the eigenvector is the answer to before being told how it is obtained.',
    ],

    avoidWhen: [
      'The subject is how the direction is computed in practice on data with many columns — eigendecomposition, singular values, iterative solvers. Sweeping every angle only works because there are two dimensions here.',
      'The subject is what gets thrown away once a direction has been picked.',
      'The article uses "spread" for the dispersion of a single variable — standard deviation, interquartile range, a box plot. The quantity here exists only relative to a chosen direction.',
      'The subject is fitting a line to predict one variable from another, where the distance being minimised runs vertically to a target rather than perpendicular to the line.',
      'The article means the spread of a rumour, a disease, or a bid-ask spread.',
    ],

    contrastWith: [
      {
        concept: 'pca',
        note: 'This settles what the widest direction means; the full treatment takes that as given and shows the answer moving when the units on the axes change.',
      },
      {
        concept: 'projectAndLose',
        note: 'Two halves of one reduction: this chooses the line by how much spread it captures, that one stays at the moment the points land on it and measures what the landing cost.',
      },
      {
        concept: 'widestMargin',
        note: 'Both place a line by a width, but a margin is set by the few closest points of two labelled groups, while this is set by how far all the points reach along the line.',
      },
      {
        concept: 'leastSquares',
        note: 'Both look at distances between points and a line, but here the distance is what a direction fails to capture, and in a fitted line it is the error the fit is chosen to minimise.',
      },
    ],
  },
};
