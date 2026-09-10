/**
 * decisionTree 개념 선언.
 *
 * canonical facet 은 `facet:decisionTree` — 왼쪽에 이름표 붙은 점 열여덟이 놓인
 * 판, 오른쪽에 자라는 나무, 아래에 카운터 셋(시험한 자름 · 잎 · 맞힌 수)과
 * 코드 패널을 갖춘 완결형이다. 컨트롤바에 깊이 상한 슬라이더(1~5, 기본 3)가
 * 얹혀 있고, **그 슬라이더를 옮겨 견주는 것이 이 완제품의 논증이다.**
 *
 * 점 열여덟에는 잡음이 하나 섞여 있다 — A 무리 깊숙이 앉은 B 하나. 그래서 깊이를
 * 3 에서 4 로 올려도 맞히는 수가 늘지 않고, 5 에서야 열여덟을 다 맞히는데 그
 * 마지막 질문들은 그 점 하나만을 위한 것이다.
 *
 * ── 묶음 안에서 무엇을 맡는가
 *
 * 조각 둘이 이 절차의 안쪽을 이미 나눠 맡고 있다. `splitByQuestion` 은 질문
 * 하나가 무엇을 고르는 일인지를, `impurityDrops` 는 그 고름을 재는 수가 무엇인지를
 * 말한다. 그래서 이 완제품의 definition 은 그 둘을 되풀이해 얻는 것 —
 * **재귀와 멈춤, 그리고 멈추지 않았을 때 일어나는 일** — 에 무게를 둔다.
 * 지니 공식도 축·기준값의 선택도 definition 에 다시 넣지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const decisionTreeConcept: FacetConceptSource = {
  id: 'decisionTree',
  label: 'Decision Tree',
  domain: 'ml-basics',
  canonicalFacet: 'facet:decisionTree',

  surface: {
    definition:
      'A classifier grown by applying the same choice of test to each side of the previous one, so its accuracy is bounded by how deep the recursion is allowed to go.',
    exemplarKeywords: [
      'decision tree',
      'CART',
      'recursive partitioning',
      'max_depth',
      'overfitting and pruning',
      'learning rules from labelled data',
      'if-else rules a human can read',
      'leaf prediction',
      'memorising the noise in the training set',
      'interpretable model',
      'DecisionTreeClassifier',
      'when to stop growing a model',
    ],
  },

  briefing: {
    observable: [
      'The point board on the left and the tree on the right are the same thing twice — every question added to the tree draws one more cut across the board, and every leaf is one region of it.',
      'While a node is being decided, a dashed candidate line slides along an axis and then stands up on the other axis, so the reader watches every cut being tried rather than only the winner.',
      'The best cut so far stays marked in the accent colour while the scan continues past it.',
      'Each node in the tree carries a small bar split into its A share and its B share, so the mixture inside a node is visible before and after it splits.',
      'Regions of the board are tinted with the label their region answers, and points that the tree gets wrong keep a red ring.',
      'Three counters run along the bottom: cuts tried, leaves, and how many of the eighteen points are answered correctly.',
      'Moving the depth slider swaps in the tree fully grown to that cap instead of replaying from the start, so two caps can be read against each other.',
      'Raising the cap from three to four leaves the correct count unchanged, and the caption below says so in those terms.',
      'At the deepest cap the tree answers all eighteen, and the last questions fence off a single stray point that sits inside the other group.',
      'The code panel highlights the line matching the current step, including the two recursive calls at the end of the growth function.',
    ],

    screen: {
      affordances: [
        'The screen grows one tree on its own at the default cap of three and then waits.',
        'Playback controls are play, step, pause, reset and a speed slider.',
        'The depth cap is a five-position slider — 1 through 5, starting at 3 — and moving it is the operation this screen exists for.',
        'The code panel starts empty with an Add language button; once a language is chosen the running line is highlighted as the animation proceeds.',
        'The eighteen points never change, so the correct count at each cap is a fixed number the article can quote.',
      ],
    },

    useWhen: [
      'The article claims a model can fit its training data perfectly and still be worse, and the reader wants that shown rather than asserted — the cap that gets every point right is also the one that grew questions for a single stray point.',
      'The reader accepts that one question splits a group but cannot see how a handful of yes-or-no tests becomes a boundary of any shape; watching regions subdivide on the board while the tree deepens supplies that.',
      'A hyperparameter is about to be introduced as something chosen rather than learned, and depth is the plainest case: the algorithm itself never decides to stop.',
    ],

    avoidWhen: [
      'The article means a decision tree drawn by hand for planning or business choices — a flowchart of options and outcomes. Nothing is learned from data in that sense here.',
      'The subject is an ensemble: random forests, gradient boosting, bagging or feature subsampling. Only one tree is ever grown on this screen.',
      'The task is regression with a tree, or a categorical feature with many values. Every test here compares one numeric coordinate against a threshold.',
      'The point is a general search or game tree — minimax, expression trees, tries. Those are trees of states, not of tests learned from labelled points.',
    ],

    contrastWith: [
      {
        concept: 'splitByQuestion',
        note: 'One branch test is about which feature it looks at and where it cuts; the tree is about repeating that choice down both sides and how deep the repetition may go.',
      },
      {
        concept: 'impurityDrops',
        note: 'That supplies the number a candidate cut is scored by; here the scores are already being used, and the interest moves to what the accumulated cuts do to accuracy.',
      },
      {
        concept: 'manyTreesVote',
        note: 'One tree deepened until it memorises a stray point is exactly the failure a forest answers by averaging many shallow, disagreeing trees.',
      },
      {
        concept: 'decisionBoundary',
        note: 'Both end in a partition of the plane, but a tree can only cut parallel to the axes, so its boundary comes out as steps rather than as a single line.',
      },
    ],
  },
};
