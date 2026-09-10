/**
 * supportVectorsOnly 개념 선언.
 *
 * canonical facet 은 `facet:supportVectorsOnly` — 점 열 개에서 최대 마진 선을
 * 좌표에서 직접 풀고, 손질 셋(닿지 않은 여섯을 통째로 버리기 · 그중 하나를 두
 * 칸 옮기기 · 닿은 하나를 한 칸 내리기)마다 처음부터 다시 풀어 선의 자리를
 * 오른쪽 기둥으로 쌓는 조각이다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 묶음 안에서의 자리
 *
 * `widestMargin` 은 **얼마나 벌어졌는가** 를 재고, 이 조각은 **누가 그것을
 * 붙들고 있는가** 를 묻는다. 그래서 definition 의 동사가 다르다 — 저쪽은
 * 부풀리기, 이쪽은 지우고 옮겨 보기다. 완제품(`svm`)은 같은 사실을 벌점의
 * 산술로 말하므로 이 조각의 낱말(지운다 · 옮긴다 · 그대로다)을 쓰지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const supportVectorsOnlyConcept: FacetConceptSource = {
  id: 'supportVectorsOnly',
  label: 'Support Vectors (The Points That Fix the Boundary)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:supportVectorsOnly',

  surface: {
    definition:
      'Only the few points resting against the edge of the margin determine a maximum-margin boundary: deleting or displacing any of the others leaves the same answer, and moving one of them changes it.',
    exemplarKeywords: [
      'support vectors',
      'which training points actually matter',
      'the model keeps only a few examples',
      'sparse solution',
      'throwing away training data',
      'outliers far from the boundary',
      'points on the edge',
      'robust to distant examples',
      'why prediction stays cheap',
    ],
  },

  briefing: {
    observable: [
      'Solving is shown as work: a probe swings through directions around the groups before settling, so a line that ends up unchanged is visibly the outcome of a search rather than a frozen picture.',
      'The first solution stays behind as a ghost band, and every later solve is watched against it — the probe either climbs back onto that ghost or drops below it.',
      'Sixty per cent of the points are deleted in one move and the line lands back exactly where it was; the caption counts how many were touching and how many had no say.',
      'The three edits do not accumulate — the points snap back to their starting places before each one, so each result is a comparison against the same original.',
      'Displacing a non-touching point by two units leaves the answer alone, while lowering a touching point by a single unit pulls the line down with it and halves the band.',
      'Each solve sends a cross-section of the line and its band flying off the plot into a column on the right, drawn against a dotted line at the original height, so unchanged results sit on the dotted line and the changed one hangs below it and is shorter.',
      'The columns are drawn at a larger scale than the plot, which is what makes a difference of a fraction of a unit legible.',
    ],

    screen: {
      affordances: [
        'The screen runs all three edits on its own and stops with the three columns standing side by side.',
        'Two buttons: Replay, and a step control for taking one edit at a time, which is how a reader can stop between an edit and the solve that follows it.',
        'The points, the edits and the order they happen in are fixed, so an article can name the point that is moved and the amount the band loses.',
      ],
    },

    useWhen: [
      'The article states that a trained model can be stored as a handful of examples and the reader has no reason to believe the rest were dispensable. Deleting most of the data and getting the identical line back is the demonstration that claim needs.',
      'The reader assumes a large displacement changes the answer more than a small one. Two units of movement doing nothing while one unit halves the band is the counterexample, and it is the size of the edit that has to be visible for it to land.',
      'Someone needs to be persuaded that "nothing happened" is a result rather than a missing animation, which is why the solve is replayed in full each time.',
    ],

    avoidWhen: [
      'The groups overlap or the article is about tolerating errors, hinge penalties or a regularisation constant. Every solve here assumes a clean separation and would fail without one.',
      'The subject is feature selection — deciding which columns or attributes matter. What is discarded here are examples, not features.',
      'The article is about a kernel, a curved boundary, or what a support vector means once the data is lifted. Only straight lines and the original coordinates appear.',
      'The point is data pruning or coreset construction as a technique for speed. Nothing here is about the cost of training; the deletion is an experiment about influence.',
      'The subject is vector support in a library, or "support" in the sense of a distribution\'s support. The words coincide and the topic does not.',
    ],

    contrastWith: [
      {
        concept: 'widestMargin',
        note: 'The same contact between band and point read two ways: as the thing that stops the band growing, and as the thing that makes those particular points irreplaceable.',
      },
      {
        concept: 'svm',
        note: 'Here influence is shown by deleting and moving points; in the full model the same fact is arithmetic — a point contributes nothing the moment its penalty reaches zero.',
      },
      {
        concept: 'knn',
        note: 'Both answer using a few nearby examples, but one consults its neighbours at every prediction while this one settles once which examples matter and can discard the rest.',
      },
      {
        concept: 'leastSquares',
        note: 'Two ways a point can influence a fit: every point pulls on a least-squares line in proportion to its error, while here a point either touches the edge or has no say at all.',
      },
    ],
  },
};
