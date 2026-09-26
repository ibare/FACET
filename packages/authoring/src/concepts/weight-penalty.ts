/**
 * weightPenalty 개념 선언.
 *
 * canonical facet 은 `facet:weightPenalty` — 벌점 없이 맞춘 무게 여섯 a = (1.10, −0.70, 0.45, −0.26, 0.18, −0.08) 가
 * η 0.4 로 갱신 열 번을 한다. 손잡이 둘 — 벌점(L1 · L2)과 세기 λ(0 · 0.1 · 0.3 · 0.5 · 0.8 · 1.2) — 을 돌리면
 * L1 에서 정확히 0 인 무게가 0 · 1 · 3 · 4 · 5 · 6 개로 늘고, L2 에서는 여섯이 같은 비 w / a(1.00 … 0.45)를 지키며
 * 어느 λ 에서도 0 이 없다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * 조각 `pushToZero` 는 L1 한 가지의 한 장면(같은 폭으로 끌려 0 에 붙는다), `shrinkAll` 은 L2 한 가지의 한 장면
 * (같은 비율로 오그라든다)이다. 이쪽은 두 벌점을 **같은 무게 · 같은 λ 에서 맞바꾸고 λ 를 올려 보는 대비**를 맡는다.
 * 그래서 definition 은 lasso · ridge 를 나란히 두고 "λ 를 올리면 0 인 무게 수가 는다 / 공통 배율만 준다" 를 쥐며,
 * 조각들의 same width · pinned · same ratio · proportional share 를 쓰지 않는다.
 *
 * 전제 (설명 글 `weightPenalty.md`):
 *  - 모형은 특징이 서로 겹치지 않는 선형 회귀로 줄였다 — 데이터 손실 ½·Σ(w − a)² 라 무게마다 따로 셈한다.
 *  - 무게 · η · λ 사다리는 예로 고른 값이다. 시작 무게가 벌점 없는 손실의 바닥이라 λ 0 에서는 아무것도 움직이지 않는다.
 *  - 코드 패널은 IR 하나(`penalize`)를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const weightPenaltyConcept: FacetConceptSource = {
  id: 'weightPenalty',
  label: 'L1 vs L2 Regularization (Lasso vs Ridge Penalty)',
  canonicalFacet: 'facet:weightPenalty',

  surface: {
    definition:
      'Comparing lasso and ridge penalties on identical weights: as regularization strength λ grows, L1 sets more and more coefficients exactly to zero, whereas L2 only scales them all by one common factor.',
    exemplarKeywords: [
      'L1 vs L2 regularization',
      'lasso vs ridge',
      'regularization strength lambda',
      'sparse model',
      'feature selection with L1',
      'weight decay',
      'elastic net',
      'scikit-learn Lasso alpha',
      'how many coefficients become zero',
      'penalty term in the loss',
      'choosing lambda',
    ],
  },

  briefing: {
    observable: [
      'Six rows, one per weight w1 … w6, lie across a horizontal axis from −1.10 to 1.10 with a vertical line at 0. An empty ring marks each start a, a filled dot the current w, and a line between them the distance the penalty has taken. Two columns on the right read the current "w" and "w / a".',
      'A round is twelve steps: the start (w = a, "At 0: 0 / 6"), updates 1 to 10, and a final count, "Weights exactly at 0: 4 of 6 (penalty L1, λ = 0.5)". The formula for the chosen penalty and a line "η = 0.40   λ = 0.5   ηλ = 0.20" stand above the rows.',
      'Under L1 a shaded "band |h| ≤ ηλ — lands at 0" surrounds the zero line. A weight whose pulled value falls inside it turns into a square on the zero line and its row reads "0 since update k"; a caption names which weights fell in on that update.',
      'Under L2 there is no band. Captions read "all six keep the same ratio w / a = r", and the w / a column shows one number in every row at every update.',
      'After ten updates the count of weights exactly at 0 is: L1 0 · 1 · 3 · 4 · 5 · 6 for λ 0 · 0.1 · 0.3 · 0.5 · 0.8 · 1.2; L2 0 at every λ. The shared L2 ratio ends at 1.00 · 0.91 · 0.77 · 0.67 · 0.56 · 0.45 along the same ladder.',
      'At the default L1, λ 0.5 the final weights are 0.60 · −0.20 · 0.00 · 0.00 · 0.00 · 0.00; switching to L2 at the same λ gives 0.73 · −0.47 · 0.30 · −0.17 · 0.12 · −0.05, all with w / a = 0.67. Raising λ under L1 also moves the zeros earlier: at λ 1.2 four weights land on update 1.',
      'The model is reduced to linear regression with non-overlapping features, so the data loss is ½·Σ(w − a)² and each weight can be computed on its own; the start weights, η 0.4 and the λ ladder are chosen example values. At λ 0 nothing moves because a is already the bottom of the unpenalized loss. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Penalty" with L1 · L2 (starts at L1) and "Strength λ" with 0 · 0.1 · 0.3 · 0.5 · 0.8 · 1.2 (starts at 0.5). Turning either sends the six weights from their last positions back to a and replays ten updates; a readout "Weights at 0" follows the count.',
        'The move that makes the idea land is holding λ and flipping Penalty between L1 and L2: the weights pinned at zero come loose and settle as small nonzero values, then stepping λ up under L1 pins them one by one.',
        'The code panel, labelled "Penalized updates", starts empty with an add-language button; the chosen language shows `penalize`, which runs the same updates and returns the number of zero weights. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article contrasts lasso and ridge and needs to show that the difference is not strength but shape: at the same λ one produces exact zeros and the other none.',
      'A reader asks how to pick λ for an L1 model and what turning it up does; the table of zero counts climbing 0 to 6 while L2 stays at 0 answers it concretely.',
      'The article claims L1 performs feature selection and wants to show coefficients dropping out one at a time as regularization grows.',
    ],

    avoidWhen: [
      'The subject is the geometry of the constraint region — the diamond against the circle, or contour lines meeting a corner. There is no loss surface or constraint drawing here, only weights moving along one axis each.',
      'The features are correlated and the article is about how lasso picks among them. The features here do not overlap, so each weight is shrunk independently.',
      'The point is regularization by dropping units or by halting training. Only an explicit penalty term on the weights is shown.',
    ],

    contrastWith: [
      {
        concept: 'pushToZero',
        note: 'Why an L1 update produces zeros is a single mechanism; setting it against L2 and sweeping λ shows that the zeros come from the penalty\'s shape and that their number is controlled by its strength.',
      },
      {
        concept: 'shrinkAll',
        note: 'That L2 keeps every weight in proportion is one property; placing it next to L1 at equal strength shows it is exactly what prevents L2 from ever producing a sparse model.',
      },
      {
        concept: 'linearRegression',
        note: 'Plain least-squares fitting finds the unpenalized weights; regularization starts from that fit and asks how much of it to give up in exchange for smaller or fewer coefficients.',
      },
      {
        concept: 'earlyStopping',
        note: 'Both curb overfitting, but a penalty changes the objective being minimized, while stopping early keeps the objective and limits how long it is followed.',
      },
      {
        concept: 'dropout',
        note: 'A weight penalty shrinks parameters directly through the loss; dropout leaves the loss alone and regularizes by randomly removing units during training.',
      },
    ],
  },
};
