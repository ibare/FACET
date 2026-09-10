/**
 * kChangesBoundary 개념 선언.
 *
 * canonical facet 은 `facet:kChangesBoundary` — 조각(piece)이다. 왼쪽 무대에
 * 이름표 없는 물음점 하나와 이름표 있는 점 열이 있고, 그 위로 테두리가 자라
 * 담기는 이웃 수가 1 · 3 · 5 · 7 로 늘어난다. 오른쪽에서는 든 이웃이 표를 날려
 * 저울을 기울이고, 기운 쪽이 물음점의 카드에 새겨진다. 계기도 코드 패널도 없고
 * 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `knn` 은 훈련이 없다는 것과 그 대가, 그리고 평면 전체의 경계를 맡고,
 * 조각 `voteByNeighbors` 는 발언권이 거리로 갈린다는 판정 규칙 자체를 맡는다.
 * 이 조각이 홀로 맡는 것은 **답이 k 에 매달려 있다** 는 것이다 — 점도 자료도
 * 거리 재는 법도 그대로인데 테두리를 넓히는 것만으로 다수가 바뀌어 답이
 * 뒤집히고, 자료가 반반이라 "전체에게 물으면 된다" 는 도피처도 없다는 것.
 * definition 의 주어가 "k 에 대한 의존" 이고, keywords 는 k 고르기 · 홀수 k ·
 * 잡음과 매끄러움 어휘만 갖는다 (완제품의 훈련 없음 · 예측 비용 어휘, 다른
 * 조각의 다수결 · 발언권 어휘와 겹치지 않게).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const kChangesBoundaryConcept: FacetConceptSource = {
  id: 'kChangesBoundary',
  label: 'How k Changes the Answer (The Same Point, Two Verdicts)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:kChangesBoundary',

  surface: {
    definition:
      'The verdict of a distance-based vote depends on how many neighbours are consulted: widening the circle admits further examples and can reverse which label holds the majority.',
    exemplarKeywords: [
      'choosing k',
      'k is a hyperparameter',
      'odd k avoids ties',
      'small k follows the noise',
      'large k smooths everything away',
      'the answer flips when k grows',
      'sensitive to a single nearest point',
      'jagged versus smooth boundary',
      'one mislabelled point changes the result',
      'tuning a neighbour count',
    ],
  },

  briefing: {
    observable: [
      'A circle centred on the unlabelled point grows in stages, and each stage is sized so it holds exactly one, three, five and then seven neighbours — the radius stops between two points so nothing sits on the rim.',
      'Each neighbour admitted by the circle sends one vote to a balance on the right, and the beam tips further with every vote rather than being redrawn.',
      'The verdict is written on a card at the query point, and at the first widening the card is rewritten to the other label while nothing on the plot has moved.',
      'The nearest single point carries one tag and the two behind it carry the other, which is why the reversal happens between the first and second widening and not later.',
      'Widening the circle twice more admits more of both tags without tipping the balance back, so the closing caption can state that the nearest one says one thing and a few more say another.',
      'The ten labelled points are five of each tag, so there is no overall majority anywhere on the screen to fall back on.',
      'Only odd sizes are shown, so the balance never comes to rest level and every stage produces an answer.',
      'The plot is kept square, so the growing boundary reads as a circle and equal distances look equal.',
    ],

    screen: {
      affordances: [
        'The screen plays through all four sizes on its own and stops with the last verdict on the card.',
        'Two buttons: Replay, and a step control that rewinds and walks the widenings one at a time, which is how a reader can hold the moment the card is rewritten.',
        'The ten points, the query position and the four sizes are fixed, so an article can name the nearest point and the two that overturn it.',
      ],
    },

    useWhen: [
      'An article presents the neighbour count as a setting to tune later and the reader files it under configuration. The same point receiving two different labels, with nothing else changed, is what makes it part of the method rather than a knob beside it.',
      'A reader proposes consulting everything to be safe. The data here is exactly even, so a total count has no majority at all, and that objection dies on the screen rather than in prose.',
      'The prose says a small count follows noise and a large one washes out local structure, and the reader has no way to feel the trade-off. Watching one nearest point be outvoted by the two behind it puts both halves of the trade-off in a single reversal.',
    ],

    avoidWhen: [
      'The subject is the mechanics of the vote itself — how distances are ranked, why the distant examples cast nothing. That is settled before the first widening here.',
      'The article is about the boundary across a whole region, the cost of answering queries, or the absence of a training step. One query point is examined on this screen.',
      'The letter k stands for a number of clusters or of folds in cross-validation rather than a number of neighbours.',
      'The point is a procedure for choosing the count — a validation sweep, an elbow, a grid search. Four sizes are shown to contrast their answers, not to select one.',
      'The article needs weighted voting, where nearer examples count for more and the count matters less. Every admitted neighbour here carries the same single vote.',
    ],

    contrastWith: [
      {
        concept: 'voteByNeighbors',
        note: 'That fixes how many are consulted and shows what the rule does with them; this varies that number and shows the result changing underneath the same rule.',
      },
      {
        concept: 'knn',
        note: 'Both make the neighbour count the subject, but that screen repaints an entire plane and counts the cost of doing so, while this one follows a single point through four sizes.',
      },
      {
        concept: 'kMustBeGiven',
        note: 'Two numbers named k that have to be chosen from outside the data, one counting how many groups to form and this one counting how many examples to consult.',
      },
      {
        concept: 'decisionBoundary',
        note: 'The reversal here is the boundary crossing over this one point; that concept takes the divide itself as the object rather than a single point caught on either side of it.',
      },
    ],
  },
};
