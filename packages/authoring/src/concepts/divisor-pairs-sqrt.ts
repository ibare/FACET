/**
 * divisorPairsSqrt 개념 선언.
 *
 * canonical facet 은 `facet:divisorPairsSqrt` — n = 36 을 한 줄에 깔고 1 부터 위로
 * 짚어 올라가며, 약수를 만나면 그 짝(n/d)이 제자리에서 떠올라 작은 쪽 위로 날아와
 * 앉는 화면이다. **날아오는 거리가 요점이다** — (1,36) 은 줄 끝에서 끝까지 오고,
 * (6,6) 은 거리가 0 이라 제자리에서 떠오르기만 한다. 거리가 0 이 되는 그 칸에서
 * 수직선이 자라고 √36 = 6 이 붙는다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 무엇을 말하지 않는가
 *
 * **아낌을 말하지 않는다.** 「몇 번 덜 보는가」는 완제품 `primality` 의 몫이고,
 * 화면에는 셈한 횟수를 재는 것이 아예 없다. 마지막 캡션이 말하는 것은 빠짐없음
 * 하나다. definition 도 그래서 비용이 아니라 **완전성**을 주어로 둔다.
 *
 * `pigeonholeCollision` 과는 결이 스친다 — 둘 다 예시가 아니라 셈으로 결판낸다.
 * 다만 저쪽은 자리가 모자라 반드시 부딪힌다는 주장이고, 이쪽은 짝이 대칭이라
 * 하나도 빠지지 않는다는 주장이다. 겹침이 아니라 빠짐없음이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const divisorPairsSqrtConcept: FacetConceptSource = {
  id: 'divisorPairsSqrt',
  label: 'Divisor Pairs (Why the Square Root Is Far Enough)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:divisorPairsSqrt',

  surface: {
    definition:
      'Divisors occur in pairs whose product is the number itself, and the smaller member of every pair lies at or below its square root, so walking only that far still meets every pair once.',
    exemplarKeywords: [
      'divisors come in pairs',
      'factor pairs',
      'checking up to the square root',
      'why sqrt(n) is enough',
      'i times i is less than or equal to n',
      'the loop bound in a trial division',
      'finding all the divisors of a number',
      'if d divides n then so does n over d',
      'perfect square',
      'the square root as a fold in the range',
    ],
  },

  briefing: {
    observable: [
      'All thirty-six positions lie in one row and a small cursor walks up from the first, so the search only ever moves in one direction and only ever over the lower part of the row.',
      'Every divisor found sends its partner flying in from further right to settle in a second row above it, and the position the partner left keeps a dashed outline, so the far end of the row empties out without ever being visited.',
      'The distance a partner travels shrinks as the walk proceeds — the first crosses the entire row, a later one only a few positions — and the flight takes visibly longer the further it comes.',
      'At the sixth position the partner is the position itself: the tile rises in place and travels no distance at all, and the caption says the pair has met itself.',
      'A vertical line grows through that same position and is labelled with the square root, so the place where the travel distance reaches zero and the place where the root falls are one place rather than two facts to reconcile.',
      'One probe finds nothing: its highlight fades and no tile flies, and the walk carries on rather than stopping.',
      'The run closes by washing a tint over everything past the root and stating that every pair has its smaller side at or before it, so walking that far meets them all.',
    ],

    screen: {
      affordances: [
        'The screen walks up to the root on its own and stops with the region beyond it covered over.',
        'Two buttons: Replay, and a step control that rewinds and then takes the same probes one at a time, which is how a reader can stop on a single flight and see where the partner came from.',
        'The number is fixed at thirty-six, and because it is a square the folding place lands on a position rather than between two, which is what lets the pair that meets itself appear at all.',
      ],
    },

    useWhen: [
      'The prose instructs the reader to check only as far as the square root, and what they cannot shake is the suspicion that something past it goes unexamined. Every value out there arrives on its own before the walk would have reached it, and the outlines it leaves behind are the ones never visited.',
      'The article is about to argue from the symmetry of a factorisation — that naming one side of a product names the other — and the symmetry has to be granted before it can carry any weight. Each partner appears at the same moment as the divisor rather than being looked up afterwards.',
      'A square number is about to be treated as the awkward case where a divisor pairs with itself and gets counted once instead of twice. The one position whose partner is itself is on screen, and it is the same position the root falls on.',
    ],

    avoidWhen: [
      'The point is how much work is saved by stopping early. Nothing on this screen is counted, and no second walk runs alongside for comparison.',
      'The subject is whether a number is prime. This number has divisors from the very first steps, and the walk never stops early on finding one.',
      'The article is about prime factorisation — dividing factors out repeatedly until only primes remain. Divisors are found here and the number is never broken down.',
      'The subject is factoring numbers large enough to matter in cryptography, where walking as far as the root is precisely what cannot be done. The whole range fits in one row here.',
      'The article sieves many numbers at once for their primes or their divisors. One number is on screen and the argument is about its own pairs.',
    ],

    contrastWith: [
      {
        concept: 'primality',
        note: 'This establishes that stopping at the root can miss nothing, and deliberately says nothing about what is saved; that one is entirely about the saving, which only a number with no divisor at all can put a size on.',
      },
      {
        concept: 'pigeonholeCollision',
        note: 'Both settle their claim by counting rather than by producing an example, but one counts places to prove two things must land together, while this one pairs things off to prove nothing can be missed.',
      },
      {
        concept: 'squareAndHalve',
        note: 'Both cut the work on a number down to something far smaller than the number, and the warrant differs: one rests on how an exponent is written in base two, this on the symmetry of a product.',
      },
      {
        concept: 'linearSearch',
        note: 'Both walk positions in order from the front, but one is hunting a value and is finished the moment it appears, while this one walks a distance fixed in advance and every hit adds to an answer that is only complete at the end.',
      },
    ],
  },
};
