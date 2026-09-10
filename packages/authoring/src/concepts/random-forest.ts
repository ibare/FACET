/**
 * randomForest 개념 선언.
 *
 * canonical facet 은 `facet:randomForest` — 이름표 있는 점 열여덟 위에 나무
 * 열여섯을 하나씩 기르고, 격자 1024 칸마다 표를 세어 이긴 쪽 색과 이긴 정도의
 * 짙기로 평면을 칠하는 완결형이다. 숲 크기 슬라이더(1 · 2 · 4 · 8 · 16)와 셈 셋,
 * 코드 패널이 딸린다.
 *
 * ── 묶음 안에서의 자리 (조각 둘과 갈라 두었다)
 *
 *   randomForest    방법 전체와 그 산출 — 여럿을 어떻게 다르게 기르고, 그 결과로
 *                   무엇이 더 나오는가 (확신의 정도)
 *   baggingSample   서로 다른 나무를 만드는 뽑기 하나 — 되돌려 뽑기와 남는 것
 *   manyTreesVote   모으는 쪽 — 틀림이 흩어져 있으면 다수결이 낫다는 성질
 *
 * 변별어를 붙이지 않았다. "random forest" 는 그 자체로 한 방법의 이름이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const randomForestConcept: FacetConceptSource = {
  id: 'randomForest',
  label: 'Random Forest (Ensemble of Decision Trees)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:randomForest',

  surface: {
    definition:
      'An ensemble of decision trees grown on resampled rows and randomly chosen split axes, whose vote both labels a point and reports how strongly the trees agree on it.',
    exemplarKeywords: [
      'random forest',
      'ensemble of decision trees',
      'RandomForestClassifier',
      'majority vote of models',
      'prediction confidence',
      'how many trees',
      'a single tree overfits',
      'variance reduction',
      'decorrelated trees',
      'mtry, feature subsampling',
    ],
  },

  briefing: {
    observable: [
      'The plane is coloured cell by cell by which label wins the vote there, with the depth of the colour standing for the size of the margin, so agreement and disagreement are one picture rather than two.',
      'Trees are grown one at a time on mount, and each finished tree reports how many distinct rows it drew, how many rows it never saw, and how many leaves it ended up with — the numbers differ from tree to tree.',
      'A single tree can be right on as few as eleven of the eighteen training points and another on seventeen, so badly taught trees are visibly part of the population rather than an accident.',
      'One probe point walks from root to leaf inside every new tree, a dotted rectangle shrinking as the region narrows, and its tally grows by one vote per tree.',
      'At full size the probe stands at eight votes against eight, which is a point the forest labels without being able to prefer either label.',
      'Setting the forest size to one leaves the plane a single flat colour with zero cells where the vote splits; raising it to two makes a hundred and forty-nine such cells appear, and by sixteen there are eight hundred and fourteen. The boundary widens from a line into a band.',
      'The count of training points the forest gets right goes 16, 16, 15, 17, 18 across the sizes — it dips before it rises, so more trees does not read as monotone improvement.',
      'Three counters sit under the plane: trees grown, points the forest gets right, and cells where the vote splits.',
      'The code panel holds only the voting walk over an already grown forest — a loop descending to a leaf and adding one to a tally — with the trees flattened into parallel arrays indexed by tree and node.',
    ],

    screen: {
      affordances: [
        'On mount the screen grows sixteen trees on its own, redrawing the plane after each, then stops and waits for the reader.',
        'Play, step, pause, reset and a speed slider, plus a segmented slider for the forest size with stops at 1, 2, 4, 8 and 16.',
        'Moving the size slider recomputes the plane and the probe tally without restarting the run, which is what lets two sizes be compared against the same trees.',
        'The way to see the argument is to set the size to one, read the count of split cells, then step up through the stops and read it again.',
        'The code panel starts empty with a button for adding a language; once one is chosen its lines light up as the walk runs.',
      ],
    },

    useWhen: [
      'The article claims an ensemble is better than one model and the reader wants to know better at what. The plane at size one is uniformly certain everywhere; the band that appears at larger sizes is the thing that was missing, and it is not accuracy.',
      'A reader assumes averaging many models mainly smooths the answer. Watching the count of correct training points fall at four trees before rising is the counterexample sitting in the same screen.',
      'The prose has introduced resampling and voting as two separate tricks. Growing the trees one by one and seeing their leaf counts and scores scatter is the link between them: the resampling is what makes the vote have anything to count.',
      'The reader has to be shown that a confident-looking answer can be a coin flip underneath. The probe standing at eight to eight, on a point the plane still colours, makes that concrete.',
    ],

    avoidWhen: [
      'The subject is boosting — models trained in sequence, each correcting the last, with weighted contributions. Every tree here is grown independently and every vote counts the same.',
      'The article predicts a number rather than a label. Nothing here averages a continuous output.',
      'The topic is which input mattered — feature importance, permutation importance, attribution. The screen never ranks the two axes against each other.',
      'The article uses "forest" for a collection of trees as a data structure, such as the disjoint-set forest behind union-find.',
      'The point is how one tree chooses its cuts. The growing is done off to the side here and the code panel deliberately leaves it out.',
      'The subject is tuning depth, leaf size or other hyperparameters. The only dial on screen is how many of the already grown trees are consulted.',
    ],

    contrastWith: [
      {
        concept: 'baggingSample',
        note: 'That one stays inside a single draw-and-replace and the rows it leaves behind; here the resampling is taken as done and the subject is how far the trees it produced disagree.',
      },
      {
        concept: 'manyTreesVote',
        note: 'That one shows why scattered mistakes cancel using a fixed table of answers; here real trees are grown first, so the disagreement is earned rather than assumed.',
      },
      {
        concept: 'decisionTree',
        note: 'A single tree carves the plane into confident regions with a hard edge; running many of them turns that edge into a band whose width says how close the call was.',
      },
      {
        concept: 'decisionBoundary',
        note: 'Both put a graded surface over the plane, but one gets its gradient from a fitted probability and the other from counting how many independent models disagreed.',
      },
    ],
  },
};
