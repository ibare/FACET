/**
 * neverReuseKeystream 개념 선언.
 *
 * canonical facet 은 `facet:neverReuseKeystream` — 보내는 쪽이 `SELL` · `HOLD` 를 한 벌의 키스트림 7C D1 09 A4 로 잠가
 * C1 = 2F 94 45 E8 · C2 = 34 9E 45 E0 을 보낸다. 공격자는 둘을 겹쳐 키스트림을 지우고 P1 ⊕ P2 = 1B 0A 00 08 을 얻으며
 * (셋째 바이트 00 = 같은 글자 L), `SELL` 을 짐작해 겹치면 `HOLD` 가 나온다. 키스트림은 끝까지 쓰지 않는다. 걸음 다섯.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `blockCipher` 의 CTR · IV 판에 같은 사실이 숨어 있지만, 이쪽은 **공격자 쪽에서 키스트림이 지워지는 것** 한
 * 장면이다. `xorWithKeystream` 은 한 메시지의 잠금 · 풀기를 쥐므로, definition 은 two messages · same keystream ·
 * cancels · XOR of the plaintexts · guess one reveals the other 를 독점하고 "잠그기와 풀기가 같다" 는 말을 쓰지 않는다.
 *
 * 전제: 키스트림 생성기를 그리지 않는다 — 실물(ChaCha20 · AES-CTR)에서는 같은 열쇠에 같은 논스를 두 번 넣으면 이 상황이
 * 된다. 짐작(SELL)은 가정이다 — 실물에서는 형식이 정해진 머리글이나 흔한 낱말이 이 자리를 채운다. 암호문 바이트는
 * 16 진 · 2 진으로만 보인다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const neverReuseKeystreamConcept: FacetConceptSource = {
  id: 'neverReuseKeystream',
  label: 'Keystream Reuse Leaks the Plaintexts',
  canonicalFacet: 'facet:neverReuseKeystream',

  surface: {
    definition:
      'When two messages are encrypted with the same keystream, XORing the two ciphertexts cancels the keystream and leaves the XOR of the plaintexts, so guessing one message reveals the other without ever knowing the key.',
    exemplarKeywords: [
      'keystream reuse',
      'nonce reuse',
      'two-time pad',
      'one-time pad must not be reused',
      'many-time pad attack',
      'crib dragging',
      'known-plaintext attack',
      'AES-CTR nonce reuse',
      'ChaCha20 nonce misuse',
      'WEP IV reuse',
    ],
  },

  briefing: {
    observable: [
      'On the "Sender" side sit two plaintexts, `SELL` (53 45 4C 4C) and `HOLD` (48 4F 4C 44), and one "Keystream S", 7C D1 09 A4: "Sender: two plaintexts, one keystream". An "Attacker" side lies across a line.',
      'Step 1 lays a copy of the keystream over the first message — "Sender: C1 = P1 ⊕ S = 2F 94 45 E8" — and C1 crosses to the attacker. Step 2 does the same to the second: "Sender: C2 = P2 ⊕ S = 34 9E 45 E0". "Times the keystream was used" goes 1, then 2.',
      'Step 3 is the attacker\'s, holding only C1 and C2: "Attacker: C1 ⊕ C2 = 1B 0A 00 08". Tags at the left of each row name the values it is an XOR of; the two S tags meet and fold away, leaving "S terms left: 0".',
      'The third byte comes out 00 — "Zero byte at position: 3" — because both messages have `L` there. Without the keystream, the attacker already knows where the two messages agree.',
      'Step 4 XORs a "Guess" of `SELL` into that result: "Attacker: SELL ⊕ (C1 ⊕ C2) = HOLD (48 4F 4C 44)", with "Bytes equal to P2: 4 / 4" and "Times the attacker used the keystream: 0". Five steps in all, counting the start.',
      'No keystream generator is drawn; in real stream ciphers (ChaCha20, AES-CTR) the same key used with the same nonce twice produces exactly this situation. The guess is an assumption — in practice fixed headers, file signatures or common words supply it, and a guess that is right in one byte already exposes the other message\'s byte there. Ciphertext bytes are shown only in hex and binary. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays its steps on its own and stops. Neither control below it is needed for it to finish what it has to say.',
        'Under it sit a Replay button and a playback strip. Once the run has finished, dragging the strip back to the attacker\'s first XOR shows the two keystream tags folding away.',
        'The two messages and the keystream are fixed, so every byte can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article warns against reusing a nonce or keystream and needs to show the concrete damage: an attacker with two ciphertexts and no key gets the XOR of the two messages.',
      'A reader asks why the one-time pad is "one-time" if the pad itself is perfectly random, and the pad cancelling out of two ciphertexts answers it.',
    ],

    avoidWhen: [
      'The article is about how a stream cipher encrypts and decrypts a single message. The subject here is the failure when the keystream is shared.',
      'The subject is how nonces or IVs are generated, counters versus random. No nonce or generator appears.',
      'The topic is brute-forcing or recovering the key. The key is never found or used by the attacker.',
    ],

    contrastWith: [
      {
        concept: 'xorWithKeystream',
        note: 'XORing the same keystream twice is how the legitimate receiver decrypts. The same cancellation across two different messages is what hands the plaintexts to an outsider.',
      },
      {
        concept: 'ivMakesDifferent',
        note: 'A fresh IV per message is the precaution; reusing a keystream is what happens when that precaution fails in a stream construction, and it leaks content rather than just the fact of repetition.',
      },
      {
        concept: 'blockCipher',
        note: 'Counter mode turns a block cipher into a keystream generator, so reusing its IV and counter gives exactly this leak; comparing modes places that failure beside the others.',
      },
      {
        concept: 'sharedSecretInPublic',
        note: 'Key exchange establishes a secret nobody else can form. Keystream reuse shows that a secret can stay unknown and still stop protecting anything once it is applied twice.',
      },
    ],
  },
};
