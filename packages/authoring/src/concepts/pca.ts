/**
 * pca 개념 선언.
 *
 * canonical facet 은 `facet:pca` — 등방 축척 산점도 · 두 축의 퍼짐 자 ·
 * 거듭제곱 반복 다이얼 · 자취 표 · 두 틀의 답을 쌓는 원장, 그리고 여섯 언어로
 * 갈리는 코드 패널을 갖춘 완결형이다. 손잡이 둘(축의 단위 · 사영할 축)이
 * 논증을 진다.
 *
 * ── 묶음 안에서의 자리
 *
 * 조각 둘(directionOfMostSpread · projectAndLose)은 축의 단위가 같은 자료로
 * 한 장면씩 말한다. 여기서는 단위가 다른 자료를 주고 **답이 통째로 달라지는
 * 것**을 무게중심에 둔다.
 *   - 여기(완제품)  절차 전체와 그 답이 무엇에 매여 있는가 (거듭제곱 반복 ·
 *                   표준화 · 담는 몫).
 *   - directionOfMostSpread  "가장 넓은 방향" 이라는 말이 무엇을 잰 것인가.
 *   - projectAndLose         내려 찍는 그 순간에 무엇이 사라지는가.
 *
 * keywords 도 갈랐다 — 여기는 PCA 라는 이름과 그 실무 어휘(표준화 · 설명 분산
 * 비율 · 고유벡터)를, 조각들은 각자 분산의 각도 의존과 사영 손실 어휘를 가진다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pcaConcept: FacetConceptSource = {
  id: 'pca',
  label: 'Principal Component Analysis (and What the Answer Depends On)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:pca',

  surface: {
    definition:
      'Finding the axis along which projected data spreads widest, computed by power iteration on the covariance matrix; rescaling the input axes changes which axis comes out.',
    exemplarKeywords: [
      'PCA',
      'principal component analysis',
      'dimensionality reduction',
      'eigenvector of the covariance matrix',
      'power iteration',
      'explained variance ratio',
      'standardize before PCA',
      'feature scaling',
      'should I normalise my features first',
      'first and second principal component',
      'covariance matrix',
    ],
  },

  briefing: {
    observable: [
      'The scatter is drawn at one scale for both directions, so an angle on screen is the true angle — in the original units the twelve points lie in a flat band and the axis sits almost horizontal.',
      'Two rulers below the plot give the spread of x and of y as lengths; one is sixteen times the other, and switching to standardized units makes them equal.',
      'The dial on the right keeps every vector the iteration passed through as a ray on a unit circle, so the number of rays is the number of steps: one in the original units, four after standardizing.',
      'Three counters read moving steps, axis angle and share held, and they change together — about minus three degrees at 99.88 percent, or minus forty-five degrees at 91.67 percent.',
      'The ledger at the bottom adds a row per frame without erasing the previous one, so both answers stay on screen at once, and a note names the turn between them as forty-two degrees.',
      'Choosing the second axis redraws the dotted drops from each point to the axis, and those drops are visibly longer than the ones to the first axis.',
      'The trace table shows only the last five steps of the iteration, and the turn column shrinks toward zero before the run is marked settled.',
      'The code panel highlights the line matching the running step, and the multiply-then-normalise pair is one step in it rather than a call to a solver.',
    ],

    screen: {
      affordances: [
        'The screen solves one pass in the original units on mount, then stops and waits for the reader.',
        'Playback controls — play, step, pause, reset, speed — plus two segmented sliders: Axis units, set to As given or Standardized, and Project onto, set to the 1st or the 2nd axis. Moving either one re-solves from the beginning.',
        'The code panel starts empty with an "+ Add language" button; Python, JavaScript, TypeScript, Java, C++ and C# are available and at most two panes sit side by side.',
        'The way to reach the claim is to note the angle and the step count, push Axis units to Standardized, and read both again with the earlier row still in the ledger.',
        'The twelve points are fixed and are not reshuffled on reset, so the numbers an article quotes will be the numbers the reader sees.',
      ],
    },

    useWhen: [
      'The prose says the method "finds the directions of greatest variance" as though the data alone decides them. Flipping the units switch on the same twelve points and watching the axis swing forty-two degrees turns standardizing from a preprocessing habit into a choice with a visible consequence.',
      'An article quotes a high explained-variance figure as evidence that a reduction was safe. The 99.88 percent run here is the one that merely copied the larger-scaled column, and reading it beside the 91.67 percent run separates the number from the reassurance.',
      'The reader has been handed "it is the top eigenvector of the covariance matrix" and cannot picture an eigenvector being obtained. Multiplying, renormalising and watching the turn shrink to nothing gives the phrase a procedure.',
      'The point being made is that fast convergence means one direction dominates rather than that the data is easy — one step against four, on the same points, is that difference.',
    ],

    avoidWhen: [
      'The subject is a nonlinear or neighbourhood-preserving embedding such as t-SNE or UMAP. Only a straight axis and a right-angle drop exist here.',
      'The subject is fitting a line that predicts one variable from another. The axis here is placed by spread along itself, and no vertical error to a target is ever measured.',
      'The subject is the singular value decomposition as matrix factorisation — singular values, low-rank approximation, latent semantic indexing.',
      'The data in question has many dimensions and the question is how many components to keep — scree plots, cumulative variance curves. Two dimensions and one axis at a time is all that is on screen.',
      'The article uses "component" for a software component or for an individual coordinate of a vector.',
    ],

    contrastWith: [
      {
        concept: 'directionOfMostSpread',
        note: 'That piece earns the phrase "widest direction" by turning an axis and watching the number rise; this takes the phrase as settled and asks what the answer is a function of.',
      },
      {
        concept: 'projectAndLose',
        note: 'That piece stays at the moment of the drop and measures what is discarded; here the discarded share is one figure in a ledger that exists to be compared against another run.',
      },
      {
        concept: 'leastSquares',
        note: 'Both lay a line through a cloud, but least squares minimises distance measured vertically toward a target variable and this maximises spread measured along the line itself, so the two lines differ on the same points.',
      },
      {
        concept: 'tsne',
        note: 'Both flatten a cloud to fewer dimensions; a linear axis keeps distances comparable everywhere, while a neighbourhood embedding preserves who is near whom and gives up on global distances.',
      },
    ],
  },
};
