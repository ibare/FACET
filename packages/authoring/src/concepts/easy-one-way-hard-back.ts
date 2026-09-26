/**
 * easyOneWayHardBack 개념 선언.
 *
 * canonical facet 은 `facet:easyOneWayHardBack` — 조각. 가는 쪽은 두 소수 37 · 41 을 쥐고 곱셈 한 번으로 1517 을 낸다.
 * 돌아오는 쪽은 1517 만 쥐고 2 부터 작은 소수로 차례로 나눠 보며, 나머지가 0 이 아닌 시도가 열하나 쌓인 뒤 37 에서 멈춰
 * 37 × 41 을 되찾는다. 곱셈 1 · 나눗셈 12 두 더미가 같은 바닥에 선다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `asymmetricRsa` 는 열쇠 쌍으로 잠그고 여는 전체다. 형제 `trapdoorWithKey` 는 숨긴 소수에서 d 를 얻어 왕복이 닫히는 쪽 —
 * **열쇠가 있을 때**. 이쪽은 **열쇠가 아예 없는** 한 장면: 같은 두 수 사이를 오가는 두 방향의 수고가 다르다는 것. 그래서
 * definition 은 multiplying primes · trial division · factoring · count 쪽 낱말을 쥐고, key · encrypt · exponent · φ 는 쓰지 않는다.
 *
 * 전제 (설명 글 `easyOneWayHardBack.md`): 37 · 41 은 예로 정한 작은 소수 · 실제 RSA 의 n 은 2048 비트(617 자리) 이상 · 그 크기에서
 * 차례로 나눠 보기는 끝나지 않고 일반 수체 체도 현실적 시간 안에 닿지 못한다 · "√n 까지만 보면 된다" 는 아낌은 이 조각의 말이 아니다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const easyOneWayHardBackConcept: FacetConceptSource = {
  id: 'easyOneWayHardBack',
  label: 'One-Way Function: Multiplying vs Factoring',
  canonicalFacet: 'facet:easyOneWayHardBack',

  surface: {
    definition:
      'Multiplying two primes takes a single multiplication, but recovering them from the product alone means trial division by prime after prime, so the two directions between the same numbers cost very different amounts of work.',
    exemplarKeywords: [
      'one-way function',
      'integer factorization',
      'factoring is hard',
      'trial division',
      'product of two primes',
      'RSA modulus n = p × q',
      'easy to compute hard to invert',
      'why RSA is secure',
      'general number field sieve',
    ],
  },

  briefing: {
    observable: [
      'Two columns, "Going" and "Coming back", standing on a shared floor. Going holds "p = 37" and "q = 41": "In hand: two primes, 37 and 41."',
      'Step 1 is the whole forward trip: "37 × 41 = 1517", "n = 1517", "Going: 37 × 41 = 1517. Only 1517 is handed across." The counter reads "Multiplications: 1" and never moves again.',
      'Coming back holds only n. Each following step stacks one more division on its pile — "1517 ÷ 2 · remainder 1", "1517 ÷ 3 · remainder 2", "1517 ÷ 5 · remainder 2", "1517 ÷ 7 · remainder 5" and on through 11, 13, 17, 19, 23, 29 and 31 — each captioned "… Not a factor."',
      'The twelfth division, 1517 ÷ 37, leaves remainder 0: "Coming back: 1517 ÷ 37 = 41, remainder 0. Recovered: 37 × 41." The counters end at "Multiplications: 1" and "Divisions: 12", and the two piles stand at those heights side by side.',
      'Only primes are tried, smallest first; composite numbers such as 4 or 9 never appear as candidates.',
    ],

    screen: {
      affordances: [
        'The screen plays fourteen steps by itself, counting the opening, and stops on the recovered pair.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip from step 1 to the end shows the one-item Going pile staying put while the Coming back pile climbs.',
        'The primes 37 and 41 are fixed, so every remainder along the way can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces one-way functions and needs a concrete case where the forward direction is visibly trivial and the reverse visibly laborious.',
      'The reader asks why publishing n = p × q does not give away p and q, before any talk of keys or encryption.',
    ],

    avoidWhen: [
      'The article is about RSA encryption, decryption or the private key. No key and no message appear.',
      'The subject is how to test primality efficiently or why checking up to √n suffices. The stopping point here is simply the first divisor found.',
      'The point is the real cost of factoring 2048-bit numbers or the number field sieve. The product has four digits.',
      'The article is about hash functions being one-way. Nothing is hashed.',
    ],

    contrastWith: [
      {
        concept: 'trapdoorWithKey',
        note: 'A trapdoor adds a secret that makes the hard direction easy for its holder; a one-way function on its own has no such secret, and the reverse is equally hard for everyone.',
      },
      {
        concept: 'asymmetricRsa',
        note: 'RSA builds a key pair on top of this asymmetry; this concept is the asymmetry alone, with no key pair, message or lock.',
      },
      {
        concept: 'mixAndCannotUnmix',
        note: 'Both are one-way. This one counts the effort of going back through factoring; that one shows why modular exponentiation leaves no ordering to steer a search back to the exponent.',
      },
      {
        concept: 'pigeonholeCollision',
        note: 'Hard to reverse and easy to collide are different properties: a one-way function resists finding the input from the output, while the pigeonhole argument guarantees that a shorter output must be shared by many inputs.',
      },
      {
        concept: 'birthdayParadox',
        note: 'Finding a preimage by searching grows with the size of the space; finding any two inputs that collide takes only about its square root. That gap is about hashes, not about factoring.',
      },
      {
        concept: 'divisorPairsSqrt',
        note: 'Stopping the search at the square root is a saving in how to look; this concept is about how much looking remains even with that saving, against a single multiplication.',
      },
    ],
  },
};
