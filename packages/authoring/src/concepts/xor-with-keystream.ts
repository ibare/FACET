/**
 * xorWithKeystream 개념 선언.
 *
 * canonical facet 은 `facet:xorWithKeystream` — 평문 `HIDE`(48 49 44 45) 위로 키스트림 B3 5A E6 2F 가 한 바이트씩 흘러와
 * 1 인 자리의 비트만 뒤집어 암호문 FB 13 A2 6A 를 만들고, 같은 키스트림이 처음부터 다시 흘러와 같은 자리를 되뒤집어
 * `HIDE` 로 돌려놓는다. 뒤집힌 비트 수는 잠글 때 · 풀 때 모두 5 · 4 · 5 · 5. 걸음 아홉(처음 · 잠금 넷 · 풀기 넷).
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `blockCipher` 의 CTR 이 키스트림을 만들어 겹치는 전체라면, 이쪽은 **겹침 그 자체** — 잠그기와 풀기가 같은 연산인
 * 까닭 한 장면이다. `neverReuseKeystream` 은 같은 키스트림을 두 메시지에 쓴 결과를 쥐므로, definition 은 encryption and
 * decryption are the same operation · (P ⊕ S) ⊕ S = P · byte by byte 를 독점하고 "두 메시지 · 재사용 · 공격자" 낱말을 쓰지 않는다.
 * XOR 의 비트 규칙 자체는 `bitwiseOps` 의 말이다.
 *
 * 전제: 키스트림은 주어진 값이다 — 실물 스트림 암호(ChaCha20 · AES-CTR)는 열쇠와 논스에서 키스트림을 만든다. 생성기는
 * 그리지 않는다. 암호문 바이트는 16 진 · 2 진으로만 보인다. 같은 키스트림을 다른 메시지에 다시 쓰면 안 된다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const xorWithKeystreamConcept: FacetConceptSource = {
  id: 'xorWithKeystream',
  label: 'Stream Cipher: XOR With a Keystream, XOR Again to Decrypt',
  canonicalFacet: 'facet:xorWithKeystream',

  surface: {
    definition:
      'A stream cipher encrypts by XORing each plaintext byte with a keystream byte, and decryption is the very same operation, because XORing the same keystream a second time flips every changed bit back.',
    exemplarKeywords: [
      'stream cipher',
      'keystream',
      'XOR encryption',
      'encryption and decryption are the same',
      'one-time pad',
      'ChaCha20',
      'RC4',
      'AES-CTR keystream',
      'XOR is its own inverse',
      'symmetric key',
    ],
  },

  briefing: {
    observable: [
      'The message `HIDE` stands as four bytes, 48 49 44 45, each shown with its letter and its eight bits. At the head of a channel on the left wait four keystream bytes, B3 5A E6 2F. The first frame reads "Plaintext and keystream, paired byte by byte."',
      'Each lock step sends a copy of one keystream byte down the channel onto its message byte, and only the bits under the keystream\'s 1s turn over: "Lock 1: 01001000 ⊕ 10110011 = 11111011 (FB)". After four steps the message row reads FB 13 A2 6A.',
      'Then the same keystream flows again from the start. The same positions turn over a second time — "Unlock 1: 11111011 ⊕ 10110011 = 01001000" — and "Bytes equal to the plaintext" climbs from 0 / 4 back to 4 / 4 as `HIDE` returns.',
      'Two columns on the right, lock and unlock, give the flipped bits per byte: 5 · 4 · 5 · 5 on the way in and the same 5 · 4 · 5 · 5 on the way out, 19 of 32 bits each pass — each count is the number of 1s in that keystream byte.',
      'Nine steps in all: the start, four locks, four unlocks.',
      'The keystream is given as a fixed value; real stream ciphers such as ChaCha20 or AES in CTR mode generate it from a secret key and a nonce, and that generator is not drawn. Ciphertext bytes are shown only in hex and binary, never as letters. The same keystream must never be used for a second message. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays its steps on its own and stops. Neither control below it is needed for it to finish what it has to say.',
        'Under it sit a Replay button and a playback strip. Once the run has finished, dragging the strip between a lock step and the matching unlock step shows the same bits turning over and then back.',
        'The message and keystream are fixed, so every byte and bit count can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains how a stream cipher encrypts and wants the reader to see that the receiver decrypts by doing exactly what the sender did, with nothing but the same keystream.',
      'A reader asks why XOR, of all operations, is used to apply a key, and the answer is the pair of passes landing back on the original bytes.',
    ],

    avoidWhen: [
      'The article is about how the keystream is generated — ChaCha20 rounds, RC4 state, or a counter fed through a block cipher. The keystream here is simply given.',
      'The subject is using one keystream for two messages and what an attacker learns from it. Only one message is encrypted.',
      'The point is the truth table of XOR or bitwise operations in general. The operation is taken as known and used, not taught.',
    ],

    contrastWith: [
      {
        concept: 'neverReuseKeystream',
        note: 'XORing twice with the same keystream is what makes decryption work for the intended receiver. The same cancellation, applied across two messages that share a keystream, is what lets an outsider remove the key.',
      },
      {
        concept: 'keyPlusMessage',
        note: 'Both mix a secret key into a message. In a stream cipher the mix must be reversible so the message can be recovered; a keyed hash mixes the key in one-way so the result proves who made it and hides nothing.',
      },
      {
        concept: 'bitwiseOps',
        note: 'Bitwise XOR is the general per-position rule. A stream cipher relies on one consequence of it, that applying the same value twice cancels out.',
      },
      {
        concept: 'blockCipher',
        note: 'A block cipher transforms whole blocks and needs a separate inverse to decrypt; a stream cipher only XORs a keystream, which is why a block cipher in counter mode can serve as a keystream generator.',
      },
    ],
  },
};
