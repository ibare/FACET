/**
 * primality 개념 선언.
 *
 * canonical facet 은 `facet:primality` — 위에 2..⌊√n⌋ 후보 줄, 아래에 **아낌 자**가
 * 있는 화면이다. 자의 가로 한 줄 전체가 2..n−1 이고 왼쪽 도막이 실제로 본 것이라,
 * 1597 에서는 서른여덟 번을 다 짚어도 도막이 줄의 사십분의 일에 그친다. 손잡이
 * 다섯(97 · 211 · 409 · 797 · 1597)은 **전부 소수**다.
 *
 * ── 조각과 어떻게 갈랐나
 *
 * 조각 `divisorPairsSqrt` 는 36 에서 **짝의 대칭**만 말하고 **아낌을 한 글자도
 * 말하지 않는다** — 36 에서는 아낌이 드러나지 않아 말하면 거짓이 되기 때문이다.
 * 이 완제품은 **아낌 그 자체**다. 그래서 definition 의 주어가 완전성이 아니라
 * **비용**이고, 손잡이가 소수만 내주는 것이 그 주장의 조건이다.
 *
 * ── `sieve` 와 어떻게 갈랐나 — 가장 붙기 쉬운 자리다
 *
 * 이쪽은 **한 수가 소수인가**를 묻고 제곱근은 *검사의* 상한이다. 저쪽은 **범위 안의
 * 소수를 전부 찾는** 일이고 제곱근은 *지우개의* 상한이다. 판정 ↔ 찾기, 그리고
 * 제곱근이 무엇의 상한인가 — 이 둘로 갈랐다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const primalityConcept: FacetConceptSource = {
  id: 'primality',
  label: 'Primality by Trial Division (What Stopping at the Square Root Saves)',
  canonicalFacet: 'facet:primality',

  surface: {
    definition:
      'Deciding whether a single number is prime by dividing it by candidates in turn, and how much of that work stopping at its square root removes instead of testing everything below it.',
    exemplarKeywords: [
      'is this number prime',
      'primality test',
      'trial division',
      'checking divisibility only up to the square root',
      'how many divisions a prime check costs',
      'n % d == 0 in a loop',
      'the loop bound in a primality check',
      'testing one large number for primality',
      'Miller-Rabin as the faster alternative',
      'a prime is the slowest case to check',
      'd * d <= n versus d <= sqrt(n)',
    ],
  },

  briefing: {
    observable: [
      'The candidates to divide by are laid out as a single row of tiles running from 2 up to the whole part of the square root, and a small pointer walks it from the left.',
      'Each tile the pointer reaches is tinted, struck through, and then left as a faded dashed outline, so what has been done is distinguishable from what is still ahead at a glance.',
      'When the last candidate has been struck, a wall rises at the right end of the row carrying the square root written as a radical, so the stopping place is a thing on the board rather than a fact in the caption.',
      'Below the row is a track whose entire length stands for every candidate below the number, with the part actually examined filling from the left one candidate at a time — so the ratio is a length before it is ever stated as a figure.',
      'The two ends of the track carry their counts. At the largest setting the filled part reaches 38 against 1595, which leaves it a fortieth of the track after every candidate has been walked.',
      'Only at the end does a figure appear in the middle naming how many times fewer checks were done, and it climbs from about twelve to about forty-two across the handle.',
      'Two counters run underneath: the checks performed and the checks a full sweep would have taken.',
      'Every number the handle offers is prime, so no run ever stops early and both ways of counting are forced to their full length, which is the only situation in which their lengths can be compared.',
      'Once a language is displayed in the code panel, the branch that would report a composite verdict can be seen never to light during a whole run; not reaching that line is what makes the number prime.',
    ],

    screen: {
      affordances: [
        'Playback controls sit under the drawing: play, single step, pause, reset and a speed slider. One number is tested on its own and then the screen waits.',
        'One handle beside them, a segmented slider over five numbers: 97, 211, 409, 797 and 1597. Once a run has finished, play and step go quiet and only reset and this handle stay live.',
        'The ratio is a claim about growth, so it is read by moving the handle through the five and watching the filled part of the track shrink, not by watching one number resolve.',
        'Stepping stops the screen on a single division, which is where a candidate is struck and the track advances by one.',
        'The code panel starts empty. The reader clicks "+ Add language" and picks from Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side. It writes the bound with a square root rather than a squared comparison, so the word survives into all six languages.',
      ],
    },

    useWhen: [
      'The article states the square-root bound as a rule to be followed and the reader has no sense of how much it takes away. The examined part of a track whose whole length is every candidate below the number falls to a fortieth as the number grows.',
      'A reader tries the rule on a small composite number, sees no difference at all, and concludes the bound is a detail. Nothing composite is offered here, because a composite stops both ways at the first factor and hides the very thing being measured.',
      'The prose is about to move on to a faster or probabilistic method and the reader needs to know what is being improved on. The divisions actually performed stand beside the divisions a full sweep would have needed, so the starting point of that ladder has a size.',
    ],

    avoidWhen: [
      'The article produces all the primes in a range rather than judging one. One number is examined here and nothing is learned about its neighbours.',
      'The subject is a probabilistic or modern test — witnesses, rounds, error probability. Every candidate is genuinely divided here and the verdict carries no doubt.',
      'The point is finding the factors of a composite number, or its smallest factor. No value on the handle is composite and no run ever ends early on a hit.',
      'The subject is why the square root is far enough in the first place — the symmetry that pairs a divisor with its partner. That is assumed here, and what is measured is what assuming it buys.',
      'The article is about generating a prime large enough for a key, where dividing through the candidates is exactly what cannot be done.',
    ],

    contrastWith: [
      {
        concept: 'divisorPairsSqrt',
        note: 'One establishes that stopping at the root misses nothing, and deliberately says nothing about cost; this takes the licence as granted and asks what it is worth, which only a number with no divisor at all can show.',
      },
      {
        concept: 'sieve',
        note: 'Deciding against producing: one answers for a single number and can be pointed at a large one, while the other settles a whole range at once and cannot be aimed. The square root bounds the dividing in the first and which numbers still erase in the second.',
      },
      {
        concept: 'scanUntilFound',
        note: 'Both scan until something turns up or the bound is reached, and the expensive case is the empty one: a prime is precisely the input that denies the scan any early exit.',
      },
    ],
  },
};
