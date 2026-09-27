/**
 * numberTheory 개념 선언.
 *
 * canonical facet 은 `facet:numberTheory` — m 칸 시계에서 말이 0 부터 a 칸씩 앞으로 뛰어 0 에 돌아올 때까지 밟은
 * 칸에 자국과 줄을 남겨 별을 긋는다. 끝 걸음에 따로 셈한 gcd(a, m) 과 m ÷ gcd 가 실제로 뛴 수와 나란히 선다.
 * 손잡이 둘 — 법 m(6~12, 처음 12) · 걸음 a(1~9, 처음 9).
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 각각 한 장면이다 — 수가 커져도 나머지는 0..m−1 을 돈다(`modularClock`) · 빼도 공약수는 그대로다
 * (`euclidGcd`) · p × p 앞은 이미 지워져 있다(`sieveOfEratosthenes`). 이쪽은 **뜀 a 와 법 m 을 돌리면 궤도의
 * 길이가 gcd 로 갈린다**는 대비를 쥔다. 그래서 definition 은 stride · orbit · returns · coprime · m ÷ gcd 를 쥐고
 * quotient · subtract · common divisors unchanged · crossed out 을 쓰지 않는다.
 *
 * 전제 (설명 글 `numberTheory.md` 가 밝힌 것 — 화면은 각주 없음):
 *  - 출발은 늘 0, m 6~12 · a 1~9 는 예로 정한 값. 화면은 한 번에 한 사례이고 m ÷ gcd 등식은 사례의 수로 받칠 뿐이다.
 *  - gcd 는 빼기꼴로 따로 셈한다. 뜀 수는 실제로 뛰어 센다 — 둘이 따로 셈한 수라 같다는 것이 주장이 된다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const numberTheoryConcept: FacetConceptSource = {
  id: 'numberTheory',
  label: 'Orbits Mod m and the GCD (Which Strides Visit Every Position)',
  canonicalFacet: 'facet:numberTheory',

  surface: {
    definition:
      'Jumping by a fixed stride a around m positions from 0, with a and m varied, returns home after m ÷ gcd(a, m) jumps, so only strides coprime to m visit every position.',
    exemplarKeywords: [
      'modular arithmetic',
      'coprime',
      'relatively prime',
      'greatest common divisor',
      'multiples of a mod m',
      'additive order mod m',
      'cyclic group generator',
      'star polygon',
      'stride coprime to table size',
      'number theory',
    ],
  },

  briefing: {
    observable: [
      'A clock of m cells numbered 0 to m − 1 is labelled "mod 12" at the default. A marker starts at 0 with the caption "Start: 0 · Visited: 1".',
      'Each jump moves the marker forward by a cells around the rim, leaves a mark on the cell it lands on and draws a line from the previous mark: "(0 + 9) mod 12 = 9", "(9 + 9) mod 12 = 6", "(6 + 9) mod 12 = 3", with "Visited" rising 2, 3, 4.',
      'The jump back to 0, "(3 + 9) mod 12 = 0", draws the closing line and the star shuts; "Visited" stays at 4.',
      'The last step places the separately computed numbers side by side: "gcd(9, 12) = 3 · 12 ÷ 3 = 4" and "Visited: {0, 3, 6, 9}" — the cells visited are the multiples of the gcd.',
      'Across the stride handle at m = 12, strides 1 to 9 close stars of 12, 6, 4, 3, 12, 2, 12, 3 and 4 points; only 1, 5 and 7 visit all twelve cells. At the prime moduli 7 and 11 every stride that is not a multiple of m visits every cell. A stride of m or more wraps past a full turn in a single jump.',
      'Two readouts under the controls: "Visited cells" and "GCD", which stays 0 until the last step. When a new round starts the previous lines fold back toward 0, and a changed modulus slides the cells to new angles.',
      'The start at 0 and the ranges of m and a are example values; one case is on screen at a time, so the equality between jumps and m ÷ gcd is shown case by case, not proved, and the screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: a "Modulus m" slider from 6 to 12, starting at 12, and a "Stride a" slider from 1 to 9, starting at 9. A round plays until the marker is home and the gcd line appears, then waits for the handles.',
        'The move that makes the idea land is sweeping the stride at m = 12: the star changes shape and point count with every setting, and the gcd line explains each one. Switching to modulus 7 or 11 then makes almost every stride fill the whole clock.',
        'The code panel, labelled "Orbit length and GCD", starts empty with a "+ Add language" button; the chosen language shows `orbitLength`, which counts jumps until the position is 0 again, and `gcdSub`, which finds the gcd by repeated subtraction, and highlights the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why a step size must be coprime to the modulus for repeated addition to reach every residue, and wants readers to try strides and see the orbit length match m ÷ gcd.',
      'A reader wonders why some stars drawn by connecting every k-th point on a circle close early; the article wants the gcd named as the reason, with several moduli including primes to compare.',
    ],

    avoidWhen: [
      'The subject is multiplicative order, powers mod m, or Fermat\'s little theorem. The marker only adds a fixed stride; nothing is multiplied or raised to a power.',
      'The article is about the Euclidean algorithm as a procedure. The gcd appears only as a final number; its steps are not shown.',
      'The modulus of interest is large, as in cryptography. The clock goes only up to 12 cells.',
    ],

    contrastWith: [
      {
        concept: 'modularClock',
        note: 'The remainder staying within 0 to m − 1 while the number grows is the basic fact of modular arithmetic. Which of those remainders a repeated stride actually reaches depends further on the gcd of stride and modulus.',
      },
      {
        concept: 'euclidGcd',
        note: 'Subtracting the smaller number from the larger preserves common divisors, which is how the gcd is found. Here the gcd is an input to another question: how long an orbit of repeated addition is.',
      },
      {
        concept: 'sieveOfEratosthenes',
        note: 'Sifting out multiples identifies which moduli are prime. A prime modulus is exactly the case where every stride that is not a multiple of it has gcd 1 and reaches every position.',
      },
      {
        concept: 'euclidean',
        note: 'The remainder-based Euclidean algorithm is a fast way to compute a gcd. Orbits mod m are one place where that gcd has a visible meaning, as the spacing of the positions reached.',
      },
    ],
  },
};
