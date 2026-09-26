/**
 * keyPlusMessage 개념 선언.
 *
 * canonical facet 은 `facet:keyPlusMessage` — Alice · Bob 이 열쇠 K 7c1e 를 나눠 갖고, 글 `PAY 10` 과 표가 한 길로 간다.
 * 길 가운데 Mallory 는 K 가 없어 글을 `PAY 90` 으로 고치고 열쇠 없는 H 를 표로 붙이지만, Bob 이 셈한 MAC 과 갈라져
 * 버려진다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `sha` 는 방식 셋 × 공격 둘의 판정을 견주고, 형제 `hashTwiceWithPads` 는 MAC 의 안쪽 짜임을 연다. 이쪽은 MAC 을
 * 한 번의 셈으로 닫아 두고 **열쇠가 없으면 맞는 표를 만들 수 없다** 하나만 말한다. 그래서 definition 은 shared secret key ·
 * same channel · alter · receiver recomputes 를 독점하고, 이어 붙이기 · H(K‖m) · ipad/opad 를 쓰지 않는다.
 *
 * 전제 (설명 글 `keyPlusMessage.md`): 장난감 HMAC (상태 16 비트 · 덩어리 2 바이트 · 세 라운드 · IV 6a09),
 * 식과 ipad/opad 규칙은 RFC 2104 그대로. 열쇠 7c1e 와 두 글은 예로 정한 값. 열쇠를 어떻게 나눠 가졌는지는 다루지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const keyPlusMessageConcept: FacetConceptSource = {
  id: 'keyPlusMessage',
  label: 'MAC: A Tag Only the Key Holder Can Make',
  canonicalFacet: 'facet:keyPlusMessage',

  surface: {
    definition:
      'A message authentication code puts a shared secret key into the tag computation, so someone altering a message on the same channel can attach only a keyless hash, and the receiver\'s recomputed tag rejects it.',
    exemplarKeywords: [
      'MAC',
      'message authentication code',
      'HMAC',
      'shared secret key',
      'message integrity and authenticity',
      'man in the middle tampering',
      'why a plain hash is not enough for integrity',
      'verify a tag',
      'API request signing with a secret',
      'webhook signature',
    ],
  },

  briefing: {
    observable: [
      'Alice and Bob each hold "K 7c1e"; Mallory stands midway on the road between them marked "no K". Message and tag travel along that one road.',
      'Alice computes "MAC(K, PAY 10) = 1b13" and the tag rides with the message. Bob computes the same MAC with his key, gets 1b13, matches the attached tag and accepts.',
      'The message is sent again; Mallory catches it midway and changes `PAY 10` to `PAY 90`. The attached tag is still 1b13.',
      'Without K, all Mallory can compute is the keyless "H(PAY 90) = 3bea", which he attaches as the new tag.',
      'Bob computes "MAC(K, PAY 90) = 76b1 ≠ attached tag 3bea → reject." The correct tag for `PAY 90` exists, but only a key holder can compute it; even the keyless H(PAY 10) is 8ed4, not Alice\'s 1b13.',
      'The run is six steps including the start. The MAC is drawn as one computation taking the key and the message; its inner construction is not opened.',
      'The MAC is a reduced HMAC: a 16-bit toy hash (state starting at 6a09, 2-byte blocks, three rounds) inside the real HMAC formula with ipad 3636 and opad 5c5c. The key 7c1e and both messages are example values. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays its six steps on its own and stops on the rejection.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging the strip between the step where Mallory attaches H(PAY 90) and Bob\'s verdict sets the forged tag right beside the one the key produces.',
        'The key, both messages and every tag are fixed, so an article can quote them exactly.',
      ],
    },

    useWhen: [
      'The article must explain why a checksum sent alongside the data does nothing against an active tamperer, and why adding a secret key changes that.',
      'A reader thinks a MAC is just a hash; seeing the tamperer compute a perfectly valid hash that the receiver still refuses makes the role of the key concrete.',
    ],

    avoidWhen: [
      'The article is about how HMAC is constructed internally — inner and outer keys, ipad and opad. The MAC is a closed box here.',
      'The subject is digital signatures, where the verifier holds a different key from the signer. Both ends here share one secret.',
      'The point is keeping the message secret. `PAY 10` travels in the clear; only its integrity is protected.',
      'The article is about length extension against a secret-prefix hash. The only forgery here is rewriting the message.',
    ],

    contrastWith: [
      {
        concept: 'hashIntegrityCheck',
        note: 'An unkeyed digest protects integrity only if it arrives by a separate trusted route. A keyed tag can share the route with the message because producing a valid one needs the secret.',
      },
      {
        concept: 'xorWithKeystream',
        note: 'Both mix a secret key into the data, for opposite purposes: combining with a keystream hides the content, while a keyed tag leaves the content visible and proves who produced it.',
      },
      {
        concept: 'hashTwiceWithPads',
        note: 'That the tag depends on a key is the claim; how the key enters twice, masked two different ways, is the construction that makes the dependence safe.',
      },
      {
        concept: 'sha',
        note: 'One forger failing without the key establishes why a key is needed. Comparing ways of adding the key shows that a naive placement can still be forged by extension.',
      },
      {
        concept: 'signatureKeyDirection',
        note: 'A MAC is checked with the same secret that made it, so any verifier could also forge. A signature is made with a private key and checked with a public one, so verifying grants no power to sign.',
      },
    ],
  },
};
