/**
 * voteByNeighbors 개념 선언.
 *
 * canonical facet 은 `facet:voteByNeighbors` — 조각(piece)이다. 왼쪽에 이름표
 * 있는 점 아홉과 가운데 물음점, 오른쪽에 이름표마다 하나씩 놓인 표 상자가 있다.
 * 불려 나온 이웃은 자리에 유령만 남기고 호를 그리며 날아가 상자에 표로 쌓이고,
 * 부름을 받지 못한 이웃은 자리에서 쪼그라든다. 계기도 코드 패널도 없고 컨트롤은
 * 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `knn` 은 훈련이 없다는 것과 그 대가, 그리고 평면 전체의 경계를 맡고,
 * 조각 `kChangesBoundary` 는 k 를 키우면 답이 뒤집힌다는 것을 맡는다. 이 조각이
 * 홀로 맡는 것은 **판정 규칙 자체** 다 — 거리로 줄을 세워 앞에서 k 개만 발언권을
 * 갖고, 나머지는 틀려서가 아니라 멀다는 이유 하나로 침묵하며, 그래서 전체의
 * 다수와 이웃의 다수가 갈릴 수 있다는 것.
 * definition 의 주어가 "규칙" 이고, keywords 는 다수결 · 발언권 · 유사도 어휘만
 * 갖는다 (완제품의 훈련 없음 · 예측 비용 어휘, 다른 조각의 k 고르기 어휘와
 * 겹치지 않게).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const voteByNeighborsConcept: FacetConceptSource = {
  id: 'voteByNeighbors',
  label: 'Vote by Neighbours (Who Is Allowed to Speak)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:voteByNeighbors',

  surface: {
    definition:
      'A decision rule that ranks labelled examples by their distance to a query, lets only the k closest cast one vote each, and assigns the label holding the most votes.',
    exemplarKeywords: [
      'majority vote among the nearest',
      'the local majority differs from the overall majority',
      'each neighbour gets one vote',
      'ranked by euclidean distance',
      'labelling an unlabelled point',
      'classification by similarity',
      'ties in the vote',
      'the far ones have no say',
      'nearest neighbour rule',
    ],
  },

  briefing: {
    observable: [
      'The query point arrives without a tag while every other point on the plot already carries one, so what is being decided is visible before anything moves.',
      'Distances are measured to all nine points and they are lined up nearest first, so the ranking is produced from the picture rather than announced.',
      'The five closest are called out one at a time; each leaves a faint outline in its seat, flies along an arc into the ballot box for its own tag, and drops in as a stacked vote.',
      'The four that are not called shrink in their seats and send nothing, and the caption says the reason is distance and nothing else.',
      'Counting all nine tags would give five of one and four of the other, yet the five nearest come out three to two the other way, so the boxes end up naming the opposite label.',
      'The two axes are drawn to the same scale, so a point that looks closer on screen really is closer in the ranking.',
      'The votes are drawn as equal blocks in the box, so nothing on screen suggests a nearer neighbour counts for more than a further one.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole vote on its own and stops with both boxes filled and the verdict stated.',
        'Two buttons: Replay, and a step control that rewinds and calls the neighbours one at a time, which is how a reader can stop between two votes and read the running count.',
        'The nine points, the query position and the number consulted are fixed, so an article can name which neighbour votes third and which ones stay silent.',
      ],
    },

    useWhen: [
      'The article describes the rule as asking nearby examples and a reader hears a weighted opinion. Five equal blocks landing in two boxes, with four points sending nothing at all, is what makes the rule mechanical.',
      'A reader assumes the answer must agree with whichever tag is more common in the data. This data has more of one tag overall and the vote returns the other, which settles it without any argument about sampling.',
      'The prose needs the moment where distance turns into eligibility — the point that is fifth speaks and the point that is sixth does not — and the calling order on this screen is that boundary.',
    ],

    avoidWhen: [
      'The subject is how the number consulted should be chosen, or what happens as it grows. That number is fixed here and never moved.',
      'The article is about the cost of answering many queries, or about a boundary over a whole region. One query is answered on this screen.',
      'The point is an ensemble of models voting — trees, classifiers, or committee methods. The voters here are stored data points, not learners.',
      'The article uses "vote" for elections, consensus protocols, quorum in a distributed system, or upvotes on posts.',
      'The subject is grouping unlabelled points, where no tag exists to vote with.',
    ],

    contrastWith: [
      {
        concept: 'knn',
        note: 'That answers the same question everywhere on the plane and reports the cost and the boundary; this answers it once, slowly, to show what the rule actually consults.',
      },
      {
        concept: 'kChangesBoundary',
        note: 'Both stage a single vote, but that one replays it at several sizes to catch the answer flipping while this one holds the size fixed and looks at who is inside and who is not.',
      },
      {
        concept: 'manyTreesVote',
        note: 'Two majority votes with different electorates: there each voter is a model trained on part of the data, here each voter is a single stored example that qualified by being close.',
      },
      {
        concept: 'denseNeighborhood',
        note: 'Both draw a radius around a point and look at what falls inside, but that one counts how many are near to decide whether a region is dense, and this one reads their tags to decide a label.',
      },
    ],
  },
};
