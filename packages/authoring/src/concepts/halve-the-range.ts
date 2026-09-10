/**
 * halveTheRange 개념 선언.
 *
 * canonical facet 은 `facet:halveTheRange` — 조각(piece)이다. 값 일곱이 한 줄로
 * 서 있고 살아 있는 구간에 띠가 둘러진다. 견줌 한 번마다 후보에서 빠지는 자리들이
 * 알약으로 떨어져 나가며 그 개수를 달고 간다. 계기도 코드 패널도 없고 컨트롤은
 * 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `binarySearch` 는 두 가지 종료 조건을 가진 절차 전체와 그 코드를 맡고,
 * 조각 `requiresSorted` 는 버림이 정당한 전제를 맡는다. 이 조각이 홀로 맡는 것은
 * **한 번의 견줌이 후보에서 몇을 지우는가라는 셈** 이다 — 「절반을 버린다」가
 * 어림이 아니라 수라는 것, 그리고 7 → 3 → 1 이 로그 비용의 전부라는 것.
 * definition 의 주어가 "한 번의 견줌" 이고, keywords 는 축소율 · 로그 어휘만
 * 갖는다 (완제품의 구현 어휘, 조각 requiresSorted 의 사전 조건 어휘와 겹치지
 * 않게).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const halveTheRangeConcept: FacetConceptSource = {
  id: 'halveTheRange',
  label: 'Halving the Range (What One Comparison Removes)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:halveTheRange',

  surface: {
    definition:
      'The counting behind one comparison: probing the middle removes the probed position and everything on one side at once, so the candidate count falls by half each time.',
    exemplarKeywords: [
      'halving the search space',
      'log base two of n',
      'how many steps to get down to one',
      'a thousand items in ten steps',
      'doubling the data adds one step',
      'exponential shrinkage',
      'search space reduction per probe',
      'why it is logarithmic',
      'folding a range in half',
      'guessing a number between one and a hundred',
      'random access to the middle',
    ],
  },

  briefing: {
    observable: [
      'Seven boxes stand in a row and a band marks the seats still in play, labelled with how many candidates that is.',
      'Every comparison sends the eliminated seats out of the band as one chip carrying their count, so the removal is a single visible event rather than a series of them.',
      'The caption names both numbers each time — how many leave at once and how many are left — and the run reads seven, three, one across two comparisons.',
      'The seats that leave stay on screen as dashed, muted boxes, so the removed candidates remain countable next to the surviving ones.',
      'Landing on the wanted value also removes candidates: the survivors on both sides of it leave with the same chip, which is why the count reaches one rather than stopping at two.',
      'The closing caption states the whole arithmetic in one line — how many comparisons took how many candidates down to how many.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole narrowing on its own and stops with a single candidate left.',
        'Two buttons: Replay, and a step control that rewinds and walks the same comparisons one at a time, which is how a reader can pause on the chip as it leaves.',
        'The seven values and the value being looked for are fixed, so an article can name the counts seven, three and one and the two comparisons that produce them.',
      ],
    },

    useWhen: [
      'The article says a search "throws away half" and a reader hears an approximation. The chip leaving with its count on it turns the phrase into an exact number of positions.',
      'A reader is being asked to accept a logarithmic cost and needs a shorter argument than the algebra. Seven down to three down to one, on two comparisons, is that argument in the form of three numbers.',
      'The prose has to explain why the probed position is thrown away along with its side rather than kept for later — the chip carries the probe out together with the half it rules out.',
    ],

    avoidWhen: [
      'The article needs the case where the value is absent. The band here always closes on the value it was looking for, so the empty range never appears.',
      'The subject is the code of a search — how the bounds are updated, what the loop condition must be, what is returned when nothing matches. Nothing here is written as code.',
      'The point is that the row has to be in order for any of this to be sound. The premise holds on this screen and is never tested.',
      'The article uses "halving" for bisection on a continuous function, for exponential backoff, or for cutting a workload in two across workers.',
      'The subject is divide and conquer that keeps both halves and combines them afterwards. Here one half is abandoned without ever being examined.',
    ],

    contrastWith: [
      {
        concept: 'binarySearch',
        note: 'The full procedure is that same narrowing carried to both of its endings; this concept stops at the arithmetic of one comparison and what it removes.',
      },
      {
        concept: 'requiresSorted',
        note: 'The halving counted here is what the ordering buys; that concept is what becomes of the same halving once order cannot vouch for the discarded side.',
      },
      {
        concept: 'depthDoublesCount',
        note: 'The same logarithm from the other direction — there each level doubles what can be held, here each comparison halves what is left.',
      },
      {
        concept: 'splitUntilOne',
        note: 'Both cut a range in half by position, but splitting keeps both halves and has to come back for the other one, while this one is discarded unexamined.',
      },
    ],
  },
};
