/**
 * trapdoorWithKey 개념 선언.
 *
 * canonical facet 은 `facet:trapdoorWithKey` — 조각. 공개 n 33 · e 3, 숨긴 p 3 · q 11. 숨긴 칸에서 φ = (3 − 1)(11 − 1) = 20 이
 * 나오고, e 와 φ 에서 d = 7 (3 × 7 = 21 = 1 × 20 + 1). 평문 7 · 19 · 26 이 c = m³ mod 33 으로 13 · 28 · 20 이 되었다가
 * m = c⁷ mod 33 으로 하나씩 제자리에 돌아온다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `asymmetricRsa` 는 자물쇠가 건너가고 거꾸로 시도가 막히는 전체를 손잡이로 돌린다. 형제 `easyOneWayHardBack` 은 열쇠 없이
 * 되찾는 수고. 이쪽은 **열쇠를 쥐었을 때 왕복이 닫히는 셈** — d 가 숨긴 소수에서 φ 를 거쳐 나온다는 것과 m^(ed) 가 m 으로 돌아온다는
 * 것. 그래서 definition 은 private exponent d · φ(n) · modular inverse · returns the original 쪽 낱말을 쥐고, 나눗셈 · 인수분해 수고 ·
 * 공개 · 채널은 쓰지 않는다.
 *
 * 전제 (설명 글 `trapdoorWithKey.md`): 작은 수 판 · 구조(n = p × q · c = m^e mod n · m = c^d mod n · d = e⁻¹ mod φ(n))는 실물과 같다 ·
 * 실물은 2048 비트 이상 n · e 65537 · OAEP 패딩 · p · q · e · 평문은 예로 정한 값 · λ(n) 으로 셈해도 d 는 7 로 같다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const trapdoorWithKeyConcept: FacetConceptSource = {
  id: 'trapdoorWithKey',
  label: 'Trapdoor: The Private Exponent Undoes RSA',
  canonicalFacet: 'facet:trapdoorWithKey',

  surface: {
    definition:
      'The RSA private exponent d is the inverse of e modulo φ(n), computable only from the hidden primes, and raising a ciphertext to d returns exactly the original number.',
    exemplarKeywords: [
      'trapdoor function',
      'RSA private exponent d',
      'Euler totient φ(n)',
      'd = e⁻¹ mod φ(n)',
      'modular inverse',
      'extended Euclidean algorithm',
      'c = m^e mod n',
      'm = c^d mod n',
      'why RSA decryption works',
      'textbook RSA example',
    ],
  },

  briefing: {
    observable: [
      'Opening: a "Public" box with n 33 and e 3, a "Hidden" box with p 3 and q 11, empty φ and d slots, and "Plaintexts to lock: 7 · 19 · 26" sitting in a Plaintext / Ciphertext ring with "c = m³ mod 33" on its outgoing arc.',
      'Step 1 draws from the hidden box only: "The hidden p and q give φ = 20", with "(3 − 1)(11 − 1) = 20".',
      'Step 2: "From e and φ, the private exponent d = 7", checked as "3 × 7 = 21 = 1 × 20 + 1". The returning arc "m = c⁷ mod 33" appears at this moment.',
      'Steps 3 to 5 send each plaintext out along the top arc to a different number: "7³ mod 33 = 13", "19³ mod 33 = 28", "26³ mod 33 = 20", captioned "Lock with e = 3: 7 → 13" and so on.',
      'Steps 6 to 8 bring them back along the bottom arc in the same order: "13⁷ mod 33 = 7", "28⁷ mod 33 = 19", "20⁷ mod 33 = 26", with a tally "Back in place: 1 / 3" … "3 / 3".',
      'Both formulas have the same shape — raise to a power, then take the remainder mod 33 — and differ only in the exponent, 3 going out and 7 coming back.',
    ],

    screen: {
      affordances: [
        'The screen plays nine steps by itself, counting the opening, and stops when the third plaintext is back in place.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip between steps 5 and 8 shows the three ciphertexts returning to their plaintexts one by one.',
        'All values are fixed small numbers, so φ, d and every power can be quoted exactly.',
      ],
    },

    useWhen: [
      'The reader follows RSA encryption but not why decryption gives the message back. Watching m^3 and then c^7 mod 33 land on the starting numbers makes the round trip concrete.',
      'The article explains where the private key comes from — that d is derived from φ(n), which needs the factors p and q that only the key owner holds.',
    ],

    avoidWhen: [
      'The article is about how hard it is to factor n or to recover d without the primes. No attempt at reversing without the key is made.',
      'The subject is RSA padding (OAEP), real key sizes or public exponent 65537. The numbers are toy-sized and there is no padding.',
      'The point is digital signatures, where the roles of the exponents are swapped. Only locking with e and unlocking with d is shown.',
      'The article is about publishing a key over a channel or the Alice-and-Bob story. There is no second party.',
    ],

    contrastWith: [
      {
        concept: 'easyOneWayHardBack',
        note: 'A one-way function is equally hard to reverse for everyone; a trapdoor is that same function with one piece of secret knowledge — the prime factors — that turns reversal into a single exponentiation.',
      },
      {
        concept: 'asymmetricRsa',
        note: 'RSA as a whole is about a public lock that anyone may use and only the key holder can open; this concept is the arithmetic that makes the opening work and where the private exponent comes from.',
      },
      {
        concept: 'signatureKeyDirection',
        note: 'Signing applies the private exponent first and the public one to check; here e locks and d unlocks. The identity m^(ed) ≡ m mod n underlies both directions.',
      },
      {
        concept: 'fastPower',
        note: 'Raising to d is cheap only because powers can be reduced mod n and built by squaring; fast power is about that cost, while this concept is about why the result is the original number.',
      },
    ],
  },
};
