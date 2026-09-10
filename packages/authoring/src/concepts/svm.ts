/**
 * svm 개념 선언.
 *
 * canonical facet 은 `facet:svm` — 점 열 개짜리 점판 위에서 힌지 손실 +
 * 준경사하강으로 선을 실제로 훈련하고, C 슬라이더(0.1 / 1 / 10)와 겹침 토글로
 * "얼마나 틀려도 되는가" 를 값으로 옮겨 보는 완결형이다. 기록장이 C 마다의
 * 마진 폭을 막대로 쌓고, 코드 패널이 훈련 한 걸음을 여섯 언어로 펼친다.
 *
 * ── 묶음 안에서의 자리 (조각 셋과 definition 을 어떻게 갈랐는가)
 *
 * 조각 셋은 전부 **완벽히 갈리는 자료** 위에 선다 — 어느 선을 고르는가
 * (widestMargin) · 어느 점이 그 선을 정하는가 (supportVectorsOnly) · 곧은 선으로
 * 안 되면 어떻게 하는가 (kernelLifts). 이 완제품의 definition 은 그 전제가
 * 깨졌을 때의 **모형 전체와 그 결과** 를 진다 — 벌점을 매기고 C 로 환율을 정해
 * 훈련하는 절차. exemplarKeywords 도 그렇게 갈랐다: 여기에는 모형의 이름과
 * 손잡이(soft margin · hinge loss · C · 정칙화)만 두고, "widest gap" ·
 * "support vectors" · "kernel trick" 은 각 조각이 가져간다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const svmConcept: FacetConceptSource = {
  id: 'svm',
  label: 'Support Vector Machine (Soft Margin)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:svm',

  surface: {
    definition:
      'A linear classifier trained by charging each point for how far it falls short of the margin, with a constant C fixing the exchange rate between a wider gap and fewer errors.',
    exemplarKeywords: [
      'support vector machine',
      'SVM',
      'soft margin',
      'hinge loss',
      'the C parameter',
      'regularisation strength',
      'subgradient descent',
      'overlapping classes',
      'trade accuracy for a wider gap',
      'SVC',
      'linear classifier training',
      'penalty for misclassification',
    ],
  },

  briefing: {
    observable: [
      'Ten labelled points sit on a square plot with the line drawn through them and a band of equal width on either side; a point inside the band gets an outline and a point on the wrong side of the line gets a warning-coloured one.',
      'Training is not shown frame by frame — the run is sampled densely at the start and sparsely at the end, so the line lunges into position and then only trims itself, which is the shape of gradient descent.',
      'The first step and the last step are walked point by point: the reader sees which points the run stops at and which it passes over.',
      'A ledger on the right writes the current C, the equation of the line and its width, and stacks one bar per C, so the three settings stand side by side instead of replacing one another.',
      'Three counters run under the plot — steps, margin width and how many points are inside the band — and the width counter is the number the whole argument rests on.',
      'Turning the overlap on carries one point into the middle of the opposing group and leaves a ghost at the place it came from; the ledger empties, because the data it recorded is no longer the data on screen.',
      'With the overlap on, every setting of C gives that point up — what changes is how much the band narrows while doing it.',
      'Moving C retrains from a blank line rather than continuing from the line already drawn, so the two answers on the ledger differ only in C.',
      'The code panel starts empty with an Add language button; once a language is picked, the line matching the current step is highlighted, and the accumulate line is skipped entirely whenever the walked point is already clear of the margin.',
    ],

    screen: {
      affordances: [
        'Playback controls — play, single step, pause, reset and a speed setting — plus a three-position C slider (0.1, 1, 10) and an Overlap button.',
        'It trains once on its own after mounting and then waits; from there the reader moves C or flips the overlap and the screen retrains rather than replaying.',
        'The way to see the cost of insisting on accuracy is to note the margin width at C = 0.1, move the slider to 10, and read the two bars against each other.',
        'The data is fixed apart from the one point the overlap button moves, so an article can name that point and the group it lands in.',
      ],
    },

    useWhen: [
      'The prose says a classifier "tolerates some error" and the reader hears a concession rather than a setting. Watching the same data trained at three values of C, with the resulting widths stacked next to each other, turns the tolerance into a dial with a readable cost.',
      'The reader needs to see that a single stray point does not break the method — the line still gets drawn, the point is simply paid for, and the price appears as a narrower band.',
      'The article claims that only the points near the boundary influence training, and the reader wants that verified inside the arithmetic rather than asserted: the walked step shows the accumulate line being skipped for every point already clear of the margin.',
    ],

    avoidWhen: [
      'The subject is a kernel — RBF, polynomial, the kernel trick, curved decision boundaries. The line here stays straight, and buying errors with a value is presented as the alternative to lifting the data.',
      'The article is about SMO, quadratic programming, dual variables or Lagrange multipliers. The training shown is plain descent on the primal objective, which is a different route to the same model.',
      'The point is multi-class classification, one-vs-rest, or probability outputs. There are two labels here and the answer is a side of a line, not a score.',
      'The subject is "support" in the statistical sense — the support of a distribution, or a support set — or vector arithmetic in graphics. The words match and nothing else does.',
      'The article needs feature scaling, class weights, or cross-validated hyperparameter search. C is moved by hand here between three prepared values.',
    ],

    contrastWith: [
      {
        concept: 'widestMargin',
        note: 'The criterion for picking one line out of many, against the model that has to keep working once no line satisfies that criterion at all.',
      },
      {
        concept: 'supportVectorsOnly',
        note: 'One asks which points fix a boundary on clean data; here that question is answered by arithmetic instead — a point stops mattering exactly when its penalty falls to zero.',
      },
      {
        concept: 'kernelLifts',
        note: 'Two answers to inseparable data: add a dimension until a straight cut works, or keep the straight cut and buy the errors with a value.',
      },
      {
        concept: 'logisticRegression',
        note: 'Both draw a straight boundary between two labels, but one fits probabilities to every point while this one ignores every point that is already comfortably placed.',
      },
      {
        concept: 'decisionBoundary',
        note: 'The region a classifier assigns to each label, against one particular way of choosing where that division goes and what it costs to move it.',
      },
    ],
  },
};
