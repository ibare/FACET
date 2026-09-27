/**
 * euclidGcd 개념 선언.
 *
 * canonical facet 은 `facet:euclidGcd` — (120, 84) 에서 큰 쪽이 제 자리에서 (큰 − 작은) 으로 바뀌기를 다섯 번,
 * (12, 12) 에서 멈춘다. 걸음마다 두 수 각각의 약수 줄은 바뀌지만 가운데 공약수 줄 1 2 3 4 6 12 는 그대로다.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `numberTheory` 에서 gcd 는 궤도 길이를 정하는 끝 걸음의 수 하나다. 이쪽은 **빼도 공약수 목록이 바뀌지
 * 않는다**는 사실 하나를 쥔다. 기존 `euclidean` 은 나머지로 한꺼번에 줄이는 절차와 그 걸음 수를 쥐므로,
 * definition 은 subtracting · own divisors change · common divisors unchanged · equal 을 독점하고
 * remainder · division · stride 를 쓰지 않는다.
 *
 * 전제: (120, 84) 는 예로 정한 쌍. 보존의 까닭은 화면에 없고 설명 글 `euclidGcd.md` 가 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const euclidGcdConcept: FacetConceptSource = {
  id: 'euclidGcd',
  label: 'Euclid by Subtraction (Common Divisors Survive Every Step)',
  canonicalFacet: 'facet:euclidGcd',

  surface: {
    definition:
      'Subtracting one number from the other alters each one\'s own divisor list yet keeps the shared divisors intact, so the value where repeated differences meet is the greatest common divisor.',
    exemplarKeywords: [
      'subtraction-based Euclidean algorithm',
      'gcd(a, b) = gcd(a - b, b)',
      'why the Euclidean algorithm works',
      'common divisors are preserved',
      'greatest common divisor',
      'highest common factor',
      'divisors of a number',
      'invariant',
    ],
  },

  briefing: {
    observable: [
      'Two bars show the numbers, 120 above and 84 below. Between them are three rows of divisors: 120\'s sixteen divisors, 84\'s twelve, and a middle row of the common divisors 1 2 3 4 6 12. The caption reads "Start: (120, 84) · Divisors: 16 and 12 · Common divisors: 6".',
      'Each step subtracts once, and the larger number changes in its own place while the smaller stays: "Take away: 120 − 84 = 36 → (36, 84)", then (36, 48), (36, 12), (24, 12), (12, 12).',
      'The divisor row of the changed number loses and gains cells each step — "Divisors: 16 → 9", "Divisors: 12 → 10" — while the caption reports "Common divisors: 6 → 6" every time. The middle row never moves.',
      'When the two numbers are equal the run stops: "Equal: 12 = 12. Stop · GCD: 12 · Common divisors: 6". The divisors of 12 are exactly the common-divisor row.',
      'The pair (120, 84) is an example value. The screen shows the preservation step by step for this pair; the reason it always holds is not written on it.',
    ],

    screen: {
      affordances: [
        'The screen plays six steps by itself (the start and five subtractions) and stops at (12, 12).',
        'A Replay button and a playback strip sit below it. Dragging back over any subtraction shows one divisor row changing while the common row stays still.',
        'The pair is fixed, so every difference and divisor count can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article proves that gcd(a, b) = gcd(a − b, b) and wants the reader to see the common divisors stay identical while each number\'s own divisor list changes.',
      'Readers can run the Euclidean algorithm but ask why it finds the gcd; the article needs the invariant — the shared divisors — displayed at every step until the numbers meet.',
    ],

    avoidWhen: [
      'The article uses the remainder form of the algorithm or counts how many division steps it takes. Only single subtractions are shown.',
      'The subject is the extended Euclidean algorithm, Bézout coefficients or modular inverses. No coefficients are tracked.',
      'The pair is large or the article is about performance. The numbers here are small and the run has five steps.',
    ],

    contrastWith: [
      {
        concept: 'euclidean',
        note: 'Replacing the larger number by a remainder performs many subtractions at once and finishes in far fewer steps. The subtraction form makes the preserved quantity, the set of common divisors, easy to check one step at a time.',
      },
      {
        concept: 'numberTheory',
        note: 'Here the gcd is the thing being found and its correctness is the claim. In orbits mod m the gcd is already known and explains how many positions a repeated stride reaches.',
      },
      {
        concept: 'divisorPairsSqrt',
        note: 'Divisor pairs concern finding all divisors of a single number efficiently. The subtraction argument compares the divisors two numbers share and shows that set is unchanged.',
      },
    ],
  },
};
