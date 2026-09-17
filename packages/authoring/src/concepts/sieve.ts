/**
 * sieve 개념 선언.
 *
 * canonical facet 은 `facet:sieve` — 1 부터 N 까지를 열 칸씩 접어 놓은 판에서 배수를
 * 지우고, 오른쪽에 지우개가 된 소수가 칩으로 쌓이는 화면이다. 손잡이는 한계 N 하나
 * (50 · 100 · 120) 이고, 찾아낸 소수는 15 → 25 → 30 으로 느는데 **지우개는 셋 다
 * [2,3,5,7] 넷으로 고정**이다.
 *
 * ── 이 묶음에서 혼자 서는 개념이다
 *
 * 딸린 조각이 없다. definition 이 이 셈법 자체를 진다.
 *
 * ── `primality` 와 어떻게 갈랐나 — 가장 붙기 쉬운 자리다
 *
 * 둘 다 소수 이야기이고 둘 다 제곱근이 나온다. 가르는 선은 둘이다.
 *   1. **찾기 ↔ 판정** — 이쪽은 범위 안의 소수를 **전부 찾는** 일이고, 저쪽은
 *      **한 수가 소수인가**를 묻는다.
 *   2. **제곱근이 무엇의 상한인가** — 이쪽에서는 *지우개의* 상한이고, 저쪽에서는
 *      *검사의* 상한이다.
 * definition 의 주어와 keywords 를 그 둘에 맞춰 갈랐다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const sieveConcept: FacetConceptSource = {
  id: 'sieve',
  label: 'Sieve of Eratosthenes (The Board Grows, the Erasers Do Not)',
  canonicalFacet: 'facet:sieve',

  surface: {
    definition:
      'Producing every prime up to a limit by crossing out the multiples of each number that survives, where only numbers whose square is within the limit ever cross anything out.',
    exemplarKeywords: [
      'Sieve of Eratosthenes',
      'listing all the primes below a bound',
      'generating a table of primes',
      'crossing out multiples',
      'primes under 100',
      'why the crossing out starts at p squared',
      'the outer loop of a sieve stops early',
      'how many primes do the work in a sieve',
      'finding many primes at once instead of testing each',
      'prime table lookup',
      'what is left over is prime',
    ],
  },

  briefing: {
    observable: [
      'Every number from 1 to the limit sits in its own cell, ten cells to a row, so a row is one tens digit and the multiples of 2 and of 5 stand as straight columns while other multiples run as diagonals.',
      'The cell for 1 is drawn dashed and empty and takes no part in anything, and a dashed outline marks how far the board would reach at the largest limit, so a smaller board visibly sits inside its own future.',
      'A step outlines one number and asks whether it has been crossed out. If it has not, that number becomes an eraser and all of its multiples from its own square upward are struck in a single step rather than one at a time.',
      'Numbers that were already crossed out are still visited and pass without doing anything, so the run shows the difference between being examined and doing work.',
      'The run reaches a number whose square is already past the board and stops taking erasers there; the numbers still uncrossed are then gathered all at once as the answer.',
      'The erasers collect as chips at the right, and across every setting of the handle they are the same four: 2, 3, 5 and 7.',
      'A small chart below the chips carries two lines across the three limits, one for erasers and one for primes found, and it only plots the limits the reader has actually run — the others stand as dashed ghost points waiting.',
      'Three counters run at the bottom: erasers, primes, and cross-outs. At a limit of 100 the cross-outs reach 104 against a board of 100 cells, so some cells are struck more than once and the overlap is visible as a number rather than claimed to be absent.',
      'Pushing the handle from 50 to 120 more than doubles the board and takes the primes from 15 to 30, while the eraser count does not move.',
    ],

    screen: {
      affordances: [
        'Playback controls sit under the board: play, single step, pause, reset and a speed slider. A first limit is sifted on its own and then the screen waits.',
        'One handle beside them, a segmented slider over three limits: 50, 100 and 120. Once a run has finished, play and step go quiet and only reset and this handle stay live.',
        'The chart below the chips fills in as the reader visits limits, so running all three in any order is what turns the two lines into a comparison instead of a single point.',
        'A step here is one eraser doing its whole sweep, not one cell being struck, so stepping moves through the outer walk rather than through the marks.',
        'The code panel starts empty. The reader clicks "+ Add language" and picks from Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side. It holds the striking and the gathering as two routines whose loops run to different bounds.',
      ],
    },

    useWhen: [
      'The article calls the sieve efficient and leaves the reason inside an asymptotic formula. The number of primes that actually erase anything holds at four while the board more than doubles and the primes found double with it, so the ratio is watched rather than asserted.',
      'A reader is puzzled that the outer walk stops so early while the gathering runs to the end. The run halts on a number whose square already overshoots the board, and the answer is collected after that halt, so the two different bounds are two separate moments.',
      'The prose offers starting at the square as a refinement and the reader has no way to see whether anything is still being wasted. The tally of crossings still exceeds the number of cells, which places the remaining overlap on the board rather than out of sight.',
    ],

    avoidWhen: [
      'The subject is whether one particular number is prime, especially a large one. Every verdict here comes from what did or did not strike a cell, which needs the whole range built first.',
      'The article is about breaking a number into its prime factors, or about which primes divide it. Numbers here are only struck or left standing and nothing is ever divided out.',
      'The point is the memory a sieve consumes, or sieving a range too large to hold at once in segments. The entire board is held here and its size is exactly what the handle changes.',
      'The subject is a faster variant — skipping even numbers, wheel factorisation, or a scheme in which each composite is removed exactly once. The repeats are counted here rather than eliminated.',
      'The article uses "sieve" for filtering a collection by a predicate, or for a stage in signal processing.',
    ],

    contrastWith: [
      {
        concept: 'primality',
        note: 'Producing against deciding: one hands back every prime in a range and cannot be aimed at a single number, while the other answers for one number and learns nothing about its neighbours. The square root bounds which numbers still remove anything in the first and how far the dividing goes in the second.',
      },
      {
        concept: 'divisorPairsSqrt',
        note: 'Both rest on the square root as a boundary, and it bounds different things: there how far one number own divisors need to be sought, here which numbers can still take anything off a board.',
      },
      {
        concept: 'markVisitedOrLoop',
        note: 'Both keep marks on positions so that nothing is worked twice, and what a mark means differs: there it only keeps a walk from circling, while here the cells left unmarked are themselves the answer.',
      },
    ],
  },
};
