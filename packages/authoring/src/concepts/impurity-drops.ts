/**
 * impurityDrops 개념 선언.
 *
 * canonical facet 은 `facet:impurityDrops` — 왼쪽 작은 산점도에 가름선이 그어지고,
 * 화면의 대부분은 오른쪽 **섞임을 재는 자** 가 쓰는 조각이다. 자 위의 가로 막대
 * 하나가 통 하나이며 폭은 담긴 개수, 색 경계의 자리는 비율, 높이는 섞임이다.
 * 높이를 정하는 것이 폭이 아니라 경계의 자리라는 것 — 첫 층에서 일곱짜리 통이
 * 다섯짜리보다 더 높이 남는 장면 — 이 이 조각의 논증이다.
 *
 * ── 묶음 안에서 무엇을 맡는가
 *
 * 형제 `splitByQuestion` 은 질문이 무엇을 고르는 일인지를 말하고 수를 내놓지
 * 않는다. 이 조각은 반대로 고름의 과정을 보이지 않고 **재는 자 하나** 만 말한다 —
 * 섞임이 비율에서 나온다는 것, 층의 값은 통 크기로 가중한 평균이라는 것, 0 이
 * 멈추는 자리라는 것. 완제품 `decisionTree` 는 이 수를 이미 쓰고 있는 절차라,
 * definition 에 재귀도 깊이도 넣지 않았다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const impurityDropsConcept: FacetConceptSource = {
  id: 'impurityDrops',
  label: 'Impurity Drop (Scoring a Split)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:impurityDrops',

  surface: {
    definition:
      'Gini impurity turns the label mixture of a group into one number that depends on proportions alone, and a cut is scored by how far the size-weighted number falls.',
    exemplarKeywords: [
      'gini impurity',
      'entropy and information gain',
      'weighted average impurity of a level',
      'impurity decrease',
      'how a candidate split is scored',
      'proportions not counts',
      'a pure node',
      'criterion gini or entropy',
      '0.5 for a fifty-fifty group',
      'why the tree stops when a group is pure',
      'measuring how mixed a group is',
    ],
  },

  briefing: {
    observable: [
      'The scatter on the left is small and the measuring rule on the right takes most of the screen — the cuts are context, the number is the subject.',
      'A group is drawn as one horizontal bar whose width is how many points it holds, whose colour boundary marks the share of each label, and whose height on the rule is its impurity.',
      'The formula sits on screen beside the rule, so the reader can match what moves to which term.',
      'The starting bar spans the whole width with its colour boundary exactly on the halfway tick, and sits at the top of the rule.',
      'When a cut lands, the bar splits in place and the two pieces descend to their own heights; their widths still add up to the width of the bar they came from.',
      'After the first cut the wider piece — the one holding seven points — comes to rest higher than the narrower one holding five, which is the whole claim about proportions made visible.',
      'A band is drawn across the pieces at the level impurity, and it sits at their centre of mass rather than midway between them, so the wider piece visibly pulls it down.',
      'Each level reports its value and the drop from the level above it.',
      'At the last step every bar has a single colour and lies flat on the bottom of the rule, and the caption says there is nothing left to ask.',
    ],

    screen: {
      affordances: [
        'The measurement plays through on its own, one layer at a time, and stops with every bar at zero.',
        'Two buttons: Replay, and a step control that rewinds and advances one step at a time — the useful place to pause is between the split and the band being drawn.',
        'The twelve points and the cut positions are fixed and chosen to reach zero in two layers, so the article can quote the values the screen prints.',
      ],
    },

    useWhen: [
      'The article gives the impurity formula and the reader cannot tell what it responds to; watching a wide bar sit higher than a narrow one settles that it reads proportion and not size.',
      'The level score is about to be introduced as a weighted average and the reader needs a reason for the weights — the band resting at the centre of mass is that reason.',
      'A tree is said to stop at a pure node, and the reader should see that stopping as arithmetic — there is no drop left to buy — rather than as a rule imposed from outside.',
    ],

    avoidWhen: [
      'The article means the Gini coefficient of income or wealth inequality. It is a different measure that shares a name.',
      'The subject is entropy in thermodynamics, or in coding and compression, where it measures information content rather than the mixture of labels in a group.',
      'The subject is how candidate cuts are searched and compared. The cuts here are given in advance; the screen measures them, it does not choose them.',
      'The article is about a regression tree scored by squared error or variance reduction. Every group here holds two class labels.',
    ],

    contrastWith: [
      {
        concept: 'splitByQuestion',
        note: 'That one shows a question failing or working without ever quantifying it; this one produces the number that lets two candidate questions be ranked.',
      },
      {
        concept: 'decisionTree',
        note: 'Here the score falls to zero and the story ends there; in the full procedure that zero is reachable on any data by asking enough questions, which is where the trouble starts.',
      },
      {
        concept: 'leastSquares',
        note: 'Both compress how badly a model fits into one number so that candidates can be ordered, but one sums squared distances and the other reads label proportions.',
      },
      {
        concept: 'manyTreesVote',
        note: 'A single impurity score is computed from one group of points; a forest instead reduces error by disagreeing trees, which no per-node measure can express.',
      },
    ],
  },
};
