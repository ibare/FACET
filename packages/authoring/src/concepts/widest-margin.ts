/**
 * widestMargin 개념 선언.
 *
 * canonical facet 은 `facet:widestMargin` — 이름표 붙은 점 여섯 위에서 후보
 * 기울기 다섯을 차례로 놓고, 기울기마다 띠를 부풀리다 점에 닿아 멈추는 두께를
 * 오른쪽 기록장 막대로 쌓은 뒤, 최적 기울기로 돌려 그 어느 후보보다 두꺼운
 * 것을 보이는 조각이다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품(`svm`)은 전제가 깨졌을 때의 모형 전체를 진다. 이 조각이 지는 것은 그
 * 앞의 한 걸음, 곧 **가르는 선이 무수히 많을 때 무엇을 기준으로 하나를 고르는가**
 * 다. 그래서 definition 에 훈련도 · C 도 · 서포트 벡터라는 말도 넣지 않는다 —
 * 여기서 움직이는 것은 두께 하나뿐이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const widestMarginConcept: FacetConceptSource = {
  id: 'widestMargin',
  label: 'Widest Margin (Choosing Among Separating Lines)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:widestMargin',

  surface: {
    definition:
      'When many lines already separate two labelled groups, the one selected is whichever can hold the thickest empty band around it before that band runs into a point.',
    exemplarKeywords: [
      'maximum margin',
      'widest gap between two classes',
      'which separating line to choose',
      'the boundary is not unique',
      'thickest band',
      'largest separation',
      'geometric margin',
      'room on both sides',
      'the safest place to draw the line',
    ],
  },

  briefing: {
    observable: [
      'Six points carrying two labels come out from the centre of their own group to their places, and the first thing shown is several different lines that all separate them, so the reader sees the ambiguity before the criterion.',
      'For each candidate slope the band does not appear at its final size — it is pushed outward from the centre line and stops the instant it reaches a point, which is what makes the thickness a measured quantity rather than a drawn one.',
      'Thickness is lifted off the plot and onto a bar in a ledger on the right; the bar grows at the same rate as the band and freezes at the same moment, so five candidates end as five bars on one scale.',
      'The plot is square with matching horizontal and vertical spacing, because a band belonging to a different slope could not otherwise be compared by eye.',
      'At the end the line pivots to a slope that was not among the candidates and its band opens wider than any of them, adding a sixth and longest bar.',
      'A vertical rule rises through the ledger at the winning length, which settles the candidates that fall only slightly short — the eye cannot separate them, the rule can.',
      'The winning band stops against four points at once, and perpendiculars drop from exactly those points to the centre line while the remaining two are left alone.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole comparison on its own and stops with the winning band and its contact points on screen.',
        'Two buttons: Replay, and a step control that takes one candidate at a time, which is how a reader can stop on a single band and see where it caught.',
        'The points and the candidate slopes are fixed, so an article can name a particular candidate and the thickness it reached.',
      ],
    },

    useWhen: [
      'The reader has been shown a boundary drawn between two groups and has no reason to think it belongs where it is. Seeing several equally valid lines first, then a rule that picks one of them, is what makes the placement an argument instead of an illustration.',
      'The prose says a classifier leaves "as much room as possible" and the reader takes that as a figure of speech. A band that inflates until it physically catches on a point is the literal reading of it.',
      'A comparison has to be made between boundaries at different angles, which the eye cannot do on the picture alone — the thicknesses are moved onto one common scale for exactly that.',
    ],

    avoidWhen: [
      'The groups in question overlap, or the article is about tolerating errors, penalties or a regularisation setting. Everything here assumes one line separates the data perfectly, and the band would never come to rest otherwise.',
      'The subject is margin in the page-layout or typographic sense, or a profit margin. The word is shared and nothing else is.',
      'The point is how a boundary is fitted from data by iteration — descent, epochs, convergence. The answer here is computed from the coordinates directly and no fitting is on screen.',
      'The article is about a curved or non-linear boundary. Only straight lines are ever drawn.',
    ],

    contrastWith: [
      {
        concept: 'supportVectorsOnly',
        note: 'The band stopping against a point is the same event both concepts turn on; one asks how wide it got, the other asks what happens to the answer when those touched points are disturbed.',
      },
      {
        concept: 'svm',
        note: 'The criterion on its own, against the model that has to keep producing a line once no band can be inflated cleanly at all.',
      },
      {
        concept: 'kernelLifts',
        note: 'Both start from a set of points and a straight cut, but one is choosing among cuts that work while the other is faced with none that do.',
      },
      {
        concept: 'decisionBoundary',
        note: 'Where a classifier changes its answer, against the specific rule that puts that division as far from both groups as it can go.',
      },
    ],
  },
};
