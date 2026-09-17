/**
 * euclidean 개념 선언.
 *
 * canonical facet 은 `facet:euclidean` — 가로가 큰 수, 세로가 작은 수인 직사각형에서
 * 작은 변짜리 정사각형이 자라 나오며 잘리고, 남은 직사각형으로 파고드는 화면이다.
 * 한 번의 나눗셈이 한 번의 "재고 자르기" 이고, 손잡이는 피보나치 인접쌍 다섯이다.
 * 나눗셈이 6 → 14 로 둘씩 늘고 몫의 합은 늘 그보다 하나 크다.
 *
 * ── 이 묶음에서 혼자 서는 개념이다
 *
 * 이 완제품에는 딸린 조각이 없다. 그래서 definition 이 이 셈법 자체를 진다.
 *
 * ── 옆 개념과 어떻게 갈랐나
 *
 * `findRoot` 도 「줄여 가며 닿는다」는 결이다. 저쪽이 따라가는 것은 미리 저장된
 * 부모 연결이고, 이쪽이 바꾸는 것은 **나머지**다. `divisorPairsSqrt` · `primality`
 * 와는 묻는 것이 다르다 — 저쪽 둘은 한 수의 약수를 묻고, 이쪽은 두 수가 함께
 * 가지는 가장 큰 약수를 **한쪽도 인수분해하지 않고** 구한다.
 *
 * `discrete-math` 의 `number-theory` 에 「큰 것에서 작은 것을 덜어낸다」는 뺄셈
 * 조각이 계획돼 있다. 아직 구현 전이라 가리키지 않았다. 다만 definition 을
 * **나눗셈·나머지 쪽으로 분명히 기울여** 두어 그 조각이 서도 갈리게 했다 — 이
 * 화면이 뺄셈을 다루는 자리는 몫의 합 하나뿐이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const euclideanConcept: FacetConceptSource = {
  id: 'euclidean',
  label: 'Euclidean Algorithm (Trading the Larger Number for the Remainder)',
  canonicalFacet: 'facet:euclidean',

  surface: {
    definition:
      'Finding the greatest common divisor of two numbers by replacing the larger with the remainder it leaves on division by the smaller, until the remainder is zero.',
    exemplarKeywords: [
      'Euclidean algorithm',
      'greatest common divisor',
      'gcd',
      'highest common factor',
      'a mod b',
      'gcd(a, b) = gcd(b, a mod b)',
      'reducing a fraction to lowest terms',
      'coprime numbers',
      'how many division steps the gcd takes',
      'the worst input for the Euclidean algorithm',
      'consecutive Fibonacci numbers as the slowest pair',
      'dividing instead of subtracting repeatedly',
    ],
  },

  briefing: {
    observable: [
      'The pair is drawn as one rectangle whose width is the larger number and whose height is the smaller, so the two numbers are lengths rather than digits and the question becomes what square fits inside.',
      'Each division grows squares of the smaller side out of the rectangle and cuts them away; the number of squares that come off is the quotient, and what is left standing is a rectangle whose sides are the next pair.',
      'After the cut the drawing travels into the leftover rectangle until it fills the frame again, and the rectangle that appears there has nearly the same proportions as the one before it.',
      'On every pair the handle offers, exactly one square comes off per division until the last division, which takes two — so the rectangle is whittled at the slowest rate it can be whittled at.',
      'A ladder on the right gains one line per division, each written as the division itself in the form 21 = 1 x 13 + 8, and the lines for a whole run fit without any being dropped.',
      'A miniature of the starting rectangle keeps every square that has been cut, and the first cut alone takes most of the area while the dozen after it are slivers.',
      'Two counters run side by side: the divisions performed, and the sum of the quotients. On each of the five pairs the quotient sum lands exactly one above the division count.',
      'Pushing the handle through the five pairs moves the division count 6, 8, 10, 12, 14 — two more each time — and the answer that all this work arrives at is 1 on every one of them.',
    ],

    screen: {
      affordances: [
        'Playback controls sit under the drawing: play, single step, pause, reset and a speed slider. A first run plays through on its own and then the screen waits.',
        'One handle beside them, a segmented slider over five labelled pairs from "21, 13" to "987, 610". Once a run has finished, play and step go quiet and only reset and this handle stay live, so the way forward is to move the handle.',
        'Stepping is what lets a reader stop on a single division and read the line just added to the ladder before the drawing travels into what is left.',
        'The code panel starts empty. The reader clicks "+ Add language" and picks from Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side. It holds two routines over the same loop, one returning the divisor and one returning the number of turns.',
      ],
    },

    useWhen: [
      'The prose calls the method fast without saying what would make it slow, and a reader has nothing to measure that against. Every pair on the handle is the worst input of its size, and the divisions rise by exactly two from one to the next, which puts a ceiling on the growth rather than an example under it.',
      'A reader grants the remainder rule as an identity but cannot see why the pair collapses so quickly. A division bites off as many squares as the quotient allows, so a large quotient is a large bite, and these pairs are the ones where only a single square ever comes off.',
      'The article is about to weigh dividing against subtracting over and over. The quotient sum is what subtracting would have cost, it stands beside the division count throughout, and on these pairs it is larger by one — the case where dividing buys nothing.',
    ],

    avoidWhen: [
      'The subject is the extended form that also yields the coefficients of Bezout identity or a modular inverse. Only the common divisor is produced here.',
      'The article is about breaking a number into prime factors, or about which divisors one number has. Two numbers are given and neither is ever taken apart.',
      'The point is reducing a specific fraction or finding a specific common factor as an arithmetic result. Every pair on the handle is coprime, so the answer is always 1 and the interest is entirely in the number of steps.',
      'The subject is what a single division or remainder costs once the operands are enormous, as in cryptographic sizes. Every division counts as one step here regardless of the size of the numbers.',
      'The word "greatest" refers to a maximum being searched for in a collection, or "common" to shared elements of two sets.',
    ],

    contrastWith: [
      {
        concept: 'findRoot',
        note: 'Both answer a question by moving to a smaller stand-in until there is nowhere left to move, and what the move is differs: one follows stored links to a representative that already exists, this one manufactures the next term as a remainder.',
      },
      {
        concept: 'divisorPairsSqrt',
        note: 'Divisors are the subject of both, and the number of numbers is not: one takes a single number apart to see how its divisors are arranged, while this finds the largest divisor two numbers share without listing the divisors of either.',
      },
      {
        concept: 'primality',
        note: 'Both settle a question about numbers by dividing repeatedly, but one asks whether anything at all divides a single number and this asks how large a divisor two numbers already share.',
      },
    ],
  },
};
