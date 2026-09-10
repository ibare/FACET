/**
 * takeBestNow 개념 선언.
 *
 * canonical facet 은 `facet:takeBestNow` — 25 · 10 · 5 · 1 짜리 동전으로 41 을
 * 만들며, 진열대에서 동전 하나가 쟁반으로 내려오고 남은 몫이 줄어드는 것만
 * 되풀이하는 조각이다. 스스로 재생하고 멈춘 뒤 한 걸음씩 되짚을 수 있다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `greedy` 는 절차 전체와 그 결과(정렬 한 번 + 훑기 한 번이 최적을 낸다)
 * 를 말한다. 이 조각은 그 절차의 **한 걸음** 만 확대한다 — 무엇을 보고(남은 몫
 * 하나) 무엇을 하는가(들어가는 가장 큰 것을 집는다), 그리고 화면에 **없는**
 * 것 둘(재는 걸음 · 무르는 걸음). 같은 묶음의 `greedyCanFail` 은 이 걸음이
 * 빗나가는 입력을 다루므로, 여기서는 옳고 그름을 말하지 않는다.
 *
 * exemplarKeywords 는 거스름돈 습관과 "돌아보지 않는다" 는 성질에 몰아 두고,
 * 활동 선택 어휘는 완제품에, 반례 어휘는 greedyCanFail 에 남겼다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const takeBestNowConcept: FacetConceptSource = {
  id: 'takeBestNow',
  label: 'Greedy Choice (One Pick, No Second Look)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:takeBestNow',

  surface: {
    definition:
      'The single decision step of a greedy method: read only the state left right now, commit to the largest option that still fits, and never take it back.',
    exemplarKeywords: [
      'greedy choice',
      'locally optimal pick',
      'no lookahead',
      'no backtracking',
      'irrevocable decision',
      'making change with coins',
      'largest denomination first',
      "cashier's algorithm",
      'commit and move on',
      'one criterion, one step',
    ],
  },

  briefing: {
    observable: [
      'A shelf holds the four denominations and a tray below it collects what has been taken; the same four stay on the shelf however many times they are used.',
      'Only the remaining amount is shown as the thing being consulted, and the caption names it before each pick — the largest that fits in what is left.',
      'Denominations that no longer fit in the remaining amount visibly drop out of reach, so the set of candidates narrows without anything being compared against anything else.',
      'No coin ever leaves the tray and returns to the shelf, and the tray fills from left to right with no gaps, which is what makes the absence of undoing something the reader can check rather than take on faith.',
      'Nothing on the screen weighs one candidate against another; a pick happens immediately after the remaining amount is read.',
      'The run ends when the remaining amount reaches zero, with a caption giving how many coins were taken and stating that none was put back.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole run by itself and stops on the closing count.',
        'Two buttons: Replay, and a step control that walks the same run one pick at a time, which is how a reader can hold on a single decision and read the remaining amount beside it.',
        'The denominations and the amount are fixed, so an article can name the coins that come down in order.',
      ],
    },

    useWhen: [
      'The article introduces greedy as an attitude — "grabby", "short-sighted" — and the reader has no mechanical picture to attach to that. Watching one criterion applied and the remainder shrink turns the adjective into a procedure.',
      'The reader assumes any method that reaches a good answer must compare alternatives somewhere. The absence of any weighing on this screen is the point being made.',
      'The prose claims a greedy pass is cheap because it does no work per decision beyond one look. Seeing that no coin ever returns to the shelf is what makes the cheapness concrete.',
    ],

    avoidWhen: [
      'The article is about whether the greedy rule gives the best answer. Nothing here checks the result against an alternative, and these denominations happen to be a case where it works.',
      'The subject is minimum-coin change as a dynamic-programming exercise, with a table over amounts. This shows the picks alone and never builds one.',
      'The article uses "greedy" for regular-expression quantifiers or for greedy decoding when sampling from a model.',
      'The point is which key to sort by, or how to prove a key is the right one. The criterion here is fixed and is never argued for.',
    ],

    contrastWith: [
      {
        concept: 'greedy',
        note: 'This is the step; that concept is the same step carried to the end of a scheduling problem and the maximal answer it provably reaches.',
      },
      {
        concept: 'greedyCanFail',
        note: 'The same rule, two rows deep: here it is only shown working, there it is set against the smallest possible answer and comes out longer.',
      },
      {
        concept: 'tryAndUndo',
        note: 'The opposite discipline — one commits and never returns, the other advances precisely so that it can walk the choice back.',
      },
      {
        concept: 'pickNearestUnsettled',
        note: 'Both take whichever candidate looks best at the moment; that one takes it from a frontier that keeps being revised, this one from a fixed shelf.',
      },
    ],
  },
};
