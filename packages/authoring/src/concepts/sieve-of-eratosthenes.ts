/**
 * sieveOfEratosthenes 개념 선언.
 *
 * canonical facet 은 `facet:sieveOfEratosthenes` — 판 2..60 에서 소수 2 · 3 · 5 · 7 의 차례마다 배수를 짚는다.
 * p × p 앞 배수는 모두 더 작은 소수가 이미 지워 놓았고(지운 이가 적혀 있다), 새로 지워지는 첫 수는 4 · 9 · 25 · 49.
 * 11 × 11 = 121 > 60 에서 멈추고 17 개가 남는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리 · 기존 `sieve` 와 가른 선
 *
 * 완제품 `numberTheory` 와는 "소수 법이면 모든 뜀이 돈다" 는 설명 글의 끈뿐이다. 더 붙기 쉬운 것은 기존 `sieve` 다 —
 * 저쪽은 **판을 키워도 지우개가 넷 그대로**(규모)를 쥐고, 이쪽은 **판 하나에서 p × p 앞은 이미 지워져 있다**
 * (까닭)를 쥔다. 그래서 definition 은 below p × p · already removed · smaller prime factor · first new removal 을 쥐고
 * producing every prime · limit grows 를 쓰지 않는다.
 *
 * 전제: 판 끝 60 은 예로 정한 값. 까닭(p × k, k < p 는 k 의 소인수가 먼저 지웠다)은 화면에 식 틀만 있고 설명은
 * 설명 글 `sieveOfEratosthenes.md` 가 한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const sieveOfEratosthenesConcept: FacetConceptSource = {
  id: 'sieveOfEratosthenes',
  label: 'Sieve of Eratosthenes (Why Crossing Out Starts at p × p)',
  canonicalFacet: 'facet:sieveOfEratosthenes',

  surface: {
    definition:
      'When multiples are crossed out prime by prime, every multiple of p below p × p was already removed by a smaller prime factor, so p\'s first new removal is p squared.',
    exemplarKeywords: [
      'sieve of Eratosthenes',
      'start crossing out at p squared',
      'why start at p*p',
      'smallest prime factor',
      'stop when p squared exceeds n',
      'composite numbers',
      'prime numbers up to 60',
      'multiples already crossed out',
    ],
  },

  briefing: {
    observable: [
      'The board holds 2 to 60, 59 cells ("Board 2–60 · cells: 59"); 1 is left off. The count starts at "Crossed out: 0".',
      'On each prime\'s turn a marker hops over its multiples 2p, 3p, … in order. An empty cell is struck in that prime\'s colour and labelled with it; a cell already struck keeps the prime that first crossed it and only gains a dotted ring.',
      'The region before p × p is shaded, a fence stands before the cell p × p, and a note lists the multiples p × k with k < p and who crossed each: for 5, "5 × 2 = 10 · by 2", "5 × 3 = 15 · by 3", "5 × 4 = 20 · by 2".',
      'The captions give the counts per turn: prime 2 — "first new cross-out at 2 × 2 = 4", 0 before it, 29 new; prime 3 — at 9, 1 already crossed, 9 new; prime 5 — at 25, 3 already, 3 new; prime 7 — at 49, 5 already, 1 new. The running total goes 29, 38, 41, 42.',
      'The last step reads "Next prime 11: 11 × 11 = 121 > 60 · stop" and "Primes left: 17 · crossed out: 42"; the survivors are 2 3 5 7 11 13 17 19 23 29 31 37 41 43 47 53 59.',
      'The board end 60 is an example value; the screen works one board, and the reason the pattern holds on every board is not written out on it.',
    ],

    screen: {
      affordances: [
        'The screen plays six steps by itself (the empty board, four primes and the stop) and stops with seventeen primes left.',
        'A Replay button and a playback strip sit below it. Dragging to the turn of 5 or 7 holds the shaded region with every cell already struck by an earlier prime.',
        'The board is fixed, so every count and every "by" label can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains the optimisation of starting each prime\'s crossing-out at p squared and wants readers to see who had already removed every earlier multiple.',
      'A reader asks why the sieve may stop once p squared passes the limit; the article needs the empty result of the next prime\'s turn and the reason tied to smaller prime factors.',
    ],

    avoidWhen: [
      'The article is about how the sieve scales with the limit or its running time. Only one board of 60 appears.',
      'The subject is testing a single number for primality. The board sifts a whole range and never tests one number in isolation.',
      'The article needs segmented, wheel or linear sieves. Only the classic crossing-out appears.',
    ],

    contrastWith: [
      {
        concept: 'sieve',
        note: 'As the limit grows, the primes that do any crossing out barely increase; that is a claim about scale. That no prime removes anything below its own square is the reason behind it, and it holds for any single limit.',
      },
      {
        concept: 'primality',
        note: 'Trial division stops at the square root of one number being tested. The sieve stops at the prime whose square passes the limit, because every composite up to the limit has a prime factor no larger than its square root.',
      },
      {
        concept: 'numberTheory',
        note: 'The sieve identifies which numbers are prime. A prime modulus is the case where every stride that is not a multiple of it has gcd 1 with it and reaches every residue.',
      },
      {
        concept: 'divisorPairsSqrt',
        note: 'Divisors pair up around the square root of one number. The p × p boundary is the same fact seen from the sieve: a composite below p squared must have a prime factor smaller than p.',
      },
    ],
  },
};
