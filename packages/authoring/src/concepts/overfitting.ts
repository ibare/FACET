/**
 * overfitting 개념 선언.
 *
 * canonical facet 은 `facet:overfitting` — 참 곡선 6 + x − 5x² 에 잡음을 얹은 훈련 점(8 ⊂ 16 ⊂ 32)에 다항식을 닫힌 셈
 * 한 번으로 맞추고, 훈련 MSE 와 검증 스무 점의 MSE 를 오른쪽 눈금의 두 표지로 잰다. 손잡이 둘 — 훈련 점 수와 차수 —
 * 에서 주인공은 점 수다: 차수 6 에서 점 8 · 16 · 32 로 검증 1.70 · 0.55 · 0.43, 훈련 0.06 · 0.12 · 0.31.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * 조각 `memorizeVsGeneralize` 는 본 문제 점수와 새 문제 점수가 뒤바뀌는 한 장면, `trainDownValUp` 은 차수 축 위에서 두
 * 오차가 갈라지는 한 장면이다 (이 완제품의 차수 손잡이 혼자가 그 장면이다). 이쪽은 그 위에 **데이터의 양을 돌려 벌어짐이
 * 좁혀지는 대비**를 쥔다. definition 은 more training points · gap narrows · sample size 를 쥐고, 조각들의 memorize ·
 * mislabeled · degree one step at a time · U-shaped 를 쓰지 않는다.
 *
 * 전제 (설명 글 `overfitting.md`):
 *  - 장난감 데이터를 값으로 정해 두었다. 훈련 점 x 는 −0.93 … 0.93 고른 간격, 검증 스물은 맞춤에 쓰지 않는다.
 *  - 주장은 차수 6 이 진다. 잡음만 바꾼 예순 벌에서 차수 6 의 8 > 16 > 32 는 48 벌, 8 > 32 는 60 벌 — 중간 차수는 뒤집힐 수 있다.
 *  - 코드 패널은 IR 하나(`trainAndVal` · `fitPoly` · `polyMse`)를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const overfittingConcept: FacetConceptSource = {
  id: 'overfitting',
  label: 'Overfitting and Training Set Size (Closing the Generalization Gap)',
  canonicalFacet: 'facet:overfitting',

  surface: {
    definition:
      'For a highly flexible model, supplying more training points raises training error yet lowers validation error, so the generalization gap that a small sample leaves wide narrows as data grows.',
    exemplarKeywords: [
      'overfitting',
      'generalization gap',
      'more data reduces overfitting',
      'training set size',
      'learning curve by sample size',
      'high variance model',
      'bias-variance trade-off',
      'polynomial regression overfitting',
      'train error vs test error',
      'too few data points for the model',
    ],
  },

  briefing: {
    observable: [
      'A scatter shows filled "Training points" and hollow "Validation points" (twenty, never used for fitting), a "Fitted curve", and on the right an "Error (MSE)" scale with two markers, "Training" and "Validation", under the formula "MSE = Σ(ŷ − y)² / n". The fitted polynomial is written out, e.g. "ŷ = c₀ + c₁x + … + c₆x⁶".',
      'A round is four steps: the points appear; "Fitted on the training points only · Coefficients: 7" as the curve settles; a residual bar from each training point to the curve with "Training MSE: 0.06"; then a bar from each validation point with "Validation MSE: 1.70 · Training MSE: 0.06". The band between the two markers is the gap; it is not printed as a number.',
      'The point sets are nested (8 ⊂ 16 ⊂ 32), so raising the count keeps the old points in place and new ones appear between them. From the second round the previous curve stays as a dashed line and the previous markers as hollow triangles.',
      'At degree 6 with 8 points the curve plunges to −2.26 at the right edge (x 0.95) where a validation point sits at 2.4; with 32 points the same spot is 1.73. Validation MSE falls 1.70 · 0.55 · 0.43 and training MSE rises 0.06 · 0.12 · 0.31 for 8 · 16 · 32 points, so the two markers approach each other.',
      'For every point count, training error falls as degree rises; the lowest validation error is at degree 2 for 8 points and degree 4 for 16 and 32. Even at 8 points and degree 6 the curve does not pass through every point — seven coefficients, eight points.',
      'The data is fixed toy data: a true curve 6 + x − 5x² with noise, rounded to one decimal. The claim belongs to degree 6: with the noise redrawn sixty times, the gap shrank 8 > 16 > 32 in 48 of them and 8 > 32 in all 60, while middle degrees can reverse. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Training points" with 8 · 16 · 32 (starts at 8) and "Degree" with 0 … 6 (starts at 6). Turning either replays the four steps; readouts show "Training points" and "Coefficients" (degree + 1).',
        'The move that makes the idea land is leaving degree at 6 and stepping training points 8 → 16 → 32: new points sprout between the old ones, the wild curve calms, and the two error markers close in on each other.',
        'The code panel, labelled "Fit and both errors", starts empty with an add-language button; the chosen language shows `trainAndVal` calling `fitPoly` and `polyMse` twice, lighting fit, training error and validation error in turn. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article argues that collecting more data is a remedy for overfitting and needs to show both halves: validation error comes down while training error goes up.',
      'A reader asks why the same model can overfit on one dataset and not on another; holding the degree and changing only the number of points isolates the cause.',
      'The article defines the generalization gap and wants a picture where the gap is the visible distance between two markers that moves when the data changes.',
    ],

    avoidWhen: [
      'The article is about overfitting over training epochs or about when to stop. The fit is a single closed-form solve; there is no training time.',
      'The subject is classification, decision boundaries or accuracy. The task here is regression scored by mean squared error.',
      'The point is a regularization technique such as a penalty, dropout or data augmentation. None is applied; only the amount of data and the degree change.',
    ],

    contrastWith: [
      {
        concept: 'memorizeVsGeneralize',
        note: 'Scoring well on seen items and badly on new ones is the symptom; asking how the gap depends on the amount of data turns it into something that can be measured and reduced.',
      },
      {
        concept: 'trainDownValUp',
        note: 'Along model complexity, validation error bottoms out and rises; changing the training set size moves that whole pattern, so the same flexible model can go from badly to mildly overfit.',
      },
      {
        concept: 'leastSquares',
        note: 'Least squares defines the error being minimized on the training points; overfitting is about how little that minimized training error says about points the fit never saw.',
      },
      {
        concept: 'kChangesBoundary',
        note: 'In nearest-neighbour classification the flexibility knob is k; in polynomial regression it is the degree. Both overfit at the flexible end, and both are tempered by more data.',
      },
      {
        concept: 'crossValidation',
        note: 'Overfitting is the gap between training and held-out error; cross-validation is a way of estimating the held-out side reliably when data is scarce.',
      },
    ],
  },
};
