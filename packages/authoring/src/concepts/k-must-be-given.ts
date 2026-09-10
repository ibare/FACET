/**
 * kMustBeGiven 개념 선언.
 *
 * canonical facet 은 `facet:kMustBeGiven` — 조각(piece)이다. 왼쪽 좁고 긴 칸에
 * 점 열둘이 그대로 있고 자르는 테두리만 바뀐다. 오른쪽 위에 k = 2 · 3 · 4 의
 * 답이 세 줄로 쌓이고, 오른쪽 아래에 흩어짐 합과 그 줄어든 폭이 계단으로 그려진다.
 * 계기도 코드 패널도 없고 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `kmeans` 는 k 를 고정하고 시작을 바꿔 **멎은 자리가 여럿** 임을,
 * 조각 `assignThenMove` 는 한 바퀴의 두 몸짓과 멎음의 조건을 맡는다.
 * 이 조각이 홀로 맡는 것은 **k 가 입력이라는 사실** 이다 — 흩어짐 합은 k 가
 * 커질수록 늘 줄어들어 고르는 잣대가 되어 주지 못하고, 이 자료에서는 꺾이는
 * 자리조차 없다. definition 의 주어가 "군집 수" 이고, keywords 는 군집 수 고르기 ·
 * 하이퍼파라미터 어휘만 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const kMustBeGivenConcept: FacetConceptSource = {
  id: 'kMustBeGiven',
  label: 'k Has to Be Given (the Number of Groups Is an Input)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:kMustBeGiven',

  surface: {
    definition:
      'The number of groups is an input the method never determines: raising it always lowers the total scatter, so that measure cannot say which of the splits is the right one.',
    exemplarKeywords: [
      'how many clusters',
      'choosing k',
      'elbow method',
      'there is no elbow',
      'the curve has no kink',
      'inertia keeps falling',
      'silhouette score',
      'gap statistic',
      'hyperparameter you have to set',
      'model selection',
      'the algorithm will not tell you how many groups there are',
    ],
  },

  briefing: {
    observable: [
      'The twelve points never move. What changes between runs is only the outline drawn around them, which snaps back to a single group before each new k and then tears into k pieces.',
      'Each answer stays on screen as its own row of twelve membership cells with the group sizes written beside it, so the splits at 2, 3 and 4 can be read against one another instead of one replacing the last.',
      'The outlines are drawn with different insets and dash patterns per k, and the same pattern appears at the head of the matching answer row, so the three splits can be told apart when they are finally overlaid together.',
      'Every split looks defensible on its own terms: the first cuts top from bottom, the second halves the lower part, the third gives four groups that each hold together.',
      'The scatter panel measures how far the total fell between consecutive k, and the later fall is the larger one — a straight line from the first point to the last passes through the middle point, so there is no corner to read a choice off.',
      'The closing caption puts the conclusion as a property of the method rather than of this data: all three cuts stand, and how many groups there are is given rather than found.',
    ],

    screen: {
      affordances: [
        'The screen plays all three runs on its own and ends with the three outlines left overlaid on the same points.',
        'Two buttons: Replay, and a step control that rewinds and walks the same three runs one step at a time, which is the way to stop on a single split before the next one is drawn.',
        'The points and the three values of k are fixed, so an article can name the sizes each split produces and the two drops in the scatter panel.',
      ],
    },

    useWhen: [
      'The article introduces the elbow method as the way to settle the question, and the reader expects a curve with a visible corner. A run where the second fall is bigger than the first, on data with a plainly nested structure, is the counter-case.',
      'The prose slides from "the method finds groups" to "the method finds how many groups", and the reader does not notice the second claim entering. Three splits that all survive, side by side, is where that slide becomes visible.',
      'A reader is choosing between two clusterings and reaching for the lower objective as the tiebreaker. Here the objective is lower at every larger k and still says nothing about which grouping to report.',
    ],

    avoidWhen: [
      'The subject is methods that decide the number of groups from the data — density-based grouping that leaves points out, or a tree of merges cut at a chosen height.',
      'The article is about why the same k gives different answers on different runs. Starting centres are picked deterministically here, so each k always produces the same split.',
      'The point is how the alternating rounds work, or why they converge. This screen shows only the settled answer for each k.',
      'The letter k means a neighbour count in a nearest-neighbour classifier, a fold count in cross-validation, or a top-k cut-off.',
    ],

    contrastWith: [
      {
        concept: 'kmeans',
        note: 'That screen fixes the number of groups and varies the start; this one varies the number itself and asks whether any measure on screen can choose between the results.',
      },
      {
        concept: 'assignThenMove',
        note: 'That is the machinery inside one run; this treats a run as a single event and compares three of them.',
      },
      {
        concept: 'dendrogramCut',
        note: 'Both put the number of groups in the reader\'s hands, but cutting a tree offers every number at once from one build, while here each number requires its own run.',
      },
      {
        concept: 'kChangesBoundary',
        note: 'Another k that is set rather than learned, but there it counts the neighbours consulted about one question point, and the answer flips as it grows.',
      },
    ],
  },
};
