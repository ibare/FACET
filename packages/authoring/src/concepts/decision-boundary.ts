/**
 * decisionBoundary 개념 선언.
 *
 * canonical facet 은 `facet:decisionBoundary` — 왼쪽 입력 평면(점 여덟 +
 * 24×24 격자)과 오른쪽 확률자. 점마다 확률을 묻고 → 여덟만으로는 반이 되는
 * 자리를 못 짚는다는 것을 보이고 → 평면 전체를 훑고 → 반을 넘나드는 칸을
 * 켜고 → **마지막에** 선을 긋는 조각이다. 무게와 치우침은 주어진 값이고
 * 학습은 보이지 않는다.
 *
 * ── 묶음 안에서 갈라 둔 자리
 *
 * 완제품 `logisticRegression` 은 배우는 것과 고르는 것을, `squashToProbability`
 * 는 축이 띠로 접히는 함수 하나를 진다. 이 조각이 지는 것은 **선의 출처** 다 —
 * 경계가 미리 그어진 것이 아니라 자리마다 매겨진 확률에서 나중에 드러난다는
 * 것. definition 의 주어를 "선" 이 아니라 "확률이 문턱과 같아지는 자리들" 로
 * 둔 까닭이 그것이다.
 *
 * 변별어를 붙이지 않았다. "decision boundary" 는 분류 문헌 안의 용어다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const decisionBoundaryConcept: FacetConceptSource = {
  id: 'decisionBoundary',
  label: 'Decision Boundary (Where the Probability Crosses the Cut-off)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:decisionBoundary',

  surface: {
    definition:
      'The set of places where a model\'s output equals the cut-off, found by scoring every place in the input space rather than by drawing a divider between the groups.',
    exemplarKeywords: [
      'decision boundary',
      'where the classes split',
      'p = 0.5',
      'class regions on a plane',
      'linear separator',
      'contour of equal probability',
      'which side of the line',
      'the boundary is not the midpoint between the clusters',
      'shading a classification map',
      'straight boundary versus curved boundary',
    ],
  },

  briefing: {
    observable: [
      'The order of the run is the argument: eight points are asked one at a time, the plane is asked everywhere, the crossing cells are lit, and only after all of that is a line drawn end to end.',
      'Each answer is a probability, not a side — the point takes on a colour for its value and the same value flies across and sticks into a ruler on the right.',
      'When all eight have landed, the stretch of the ruler between the two clumps is empty and gets closed in from above and below, which is how "these eight cannot tell you where the boundary is" becomes something to look at.',
      'A bar then sweeps across the plane in three passes and the grid takes on the probability as a density, and the pale seam near the boundary appears on its own rather than being drawn.',
      'The cells that straddle the cut-off are chosen by disagreeing with a neighbour, not by being within some tolerance, and they swell and settle back to mark themselves.',
      'The lit cells form a band with a thickness, and that thickness is the grid resolution rather than the line — a finer grid would give a thinner band.',
      'The two axes are drawn to the same scale, so the boundary reads as a diagonal at forty-five degrees and the equation on screen can be checked against it.',
      'The closing caption puts the point negatively as well as positively: the line sits where the probability is a half, and that is not the same as halfway between the two clumps.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole sequence by itself on mount and stops with the line drawn.',
        'Two buttons: Replay, and a step control that walks the same sequence one move at a time, which is how a reader can stop on the empty stretch of the ruler before the plane gets swept.',
        'The weights, the bias, the eight points and the grid resolution are all fixed, so an article can point at the pale seam or at the equation and know they are on screen.',
      ],
    },

    useWhen: [
      'The article has drawn a boundary first and coloured the two sides, and the reader has come away thinking the line is the model. Running the order backwards — probabilities everywhere first, line last — corrects what the usual picture teaches.',
      'The reader assumes the boundary must sit midway between the two groups. Seeing it come out of a formula that never looks at where the groups are is the cleanest way to unlearn that.',
      'The prose has said a model "divides the space", and the reader needs to see that the division is a by-product of a value that exists at every single place, including places with no data.',
      'A handful of labelled examples are being used to argue about where a boundary lies, and the reader should see why that is not enough: none of the eight lands anywhere near the cut-off.',
    ],

    avoidWhen: [
      'The subject is how the weights got their values — fitting, descent, training. They are handed over here and never move.',
      'The article is about how much clearance a point should have from the boundary, or about which points determine where it goes. Distance from the line is not measured anywhere on screen.',
      'The boundary in the article is curved or piecewise — from a tree, from neighbours, from a kernel. What is drawn here is straight, and the article would be borrowing a picture that contradicts it.',
      'The article uses "decision boundary" loosely for a policy cut-off, an eligibility rule, or a business threshold.',
      'The subject is finding groups in data that has no labels. The split here comes from a given model, not from the points.',
    ],

    contrastWith: [
      {
        concept: 'logisticRegression',
        note: 'The same boundary with the weights held still and its origin unpacked, against a run where the weights move and the cut-off becomes the reader\'s choice.',
      },
      {
        concept: 'squashToProbability',
        note: 'The probability arrives from the same function in both, but there it is one value on a band and here it is a value at every place in a plane.',
      },
      {
        concept: 'widestMargin',
        note: 'Both put a line between two groups: this one takes whatever line the model implies, that one selects among the many lines that would work.',
      },
      {
        concept: 'voteByNeighbors',
        note: 'A boundary that comes from an equation evaluated everywhere, against one that has no equation at all and emerges from who is nearby.',
      },
    ],
  },
};
