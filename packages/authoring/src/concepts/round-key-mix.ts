/**
 * roundKeyMix 개념 선언.
 *
 * canonical facet 은 `facet:roundKeyMix` — 32 비트 주 열쇠 `3A94D63F` 위를 16 비트 창이 라운드마다 4 비트씩 미끄러지며
 * 라운드 열쇠 다섯(3A94 · A94D · 94D6 · 4D63 · D63F)을 잘라 내고, 잘린 열쇠가 상태에 겹쳐(XOR) 열쇠의 1 인 자리만 뒤집는다.
 * 평문 26B7 → 암호문 BCD6 (교과서 값). 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `blockCipher` 는 라운드 수와 모드를 돌려 견준다. 이쪽은 **열쇠가 어디서 나와 어디에 닿는가** 한 장면이다 —
 * 바꾸기 · 섞기의 속은 `substituteAndPermute` 의 말이라 닫힌 상자로만 지나간다. definition 은 key schedule · master key ·
 * round key · XOR flips where the key bit is 1 을 독점하고, 차이의 퍼짐 · 모드 낱말을 쓰지 않는다.
 *
 * 전제: Stinson 교과서의 장난감 SPN · 교과서의 열쇠와 평문. 창 미끄러짐 열쇠 일정은 장난감의 규약이다 — 실물 AES 는 회전 ·
 * S-상자 · 라운드 상수로 다음 열쇠를 만들고, 창 미끄러짐은 이웃 열쇠가 비트를 많이 나눠 실물에서는 약하다.
 * 열쇠가 라운드 수보다 하나 많은 것(넷에 다섯)은 AES-128 의 10 라운드 · 열쇠 11 과 같은 구조다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const roundKeyMixConcept: FacetConceptSource = {
  id: 'roundKeyMix',
  label: 'Round Keys Cut From One Master Key',
  canonicalFacet: 'facet:roundKeyMix',

  surface: {
    definition:
      'A key schedule derives a different round key from one master key for every round, and XORing each round key into the cipher state flips exactly the state bits where that key holds a 1.',
    exemplarKeywords: [
      'key schedule',
      'round key',
      'subkey',
      'key expansion',
      'AddRoundKey',
      'master key',
      'AES-128 uses 11 round keys',
      'key whitening',
      'why not reuse the same key every round',
      'related round keys',
    ],
  },

  briefing: {
    observable: [
      'At the top sits the 32-bit "Master key" `3A94D63F`. Below it the "Plaintext" `26B7` stands as the "State". The first frame reads "Master key and plaintext. No round key mixed in yet."',
      'Each step a 16-bit window slides 4 bits further along the master key and cuts one round key: "Round 1: cut from master-key positions 1..16 and laid over the state. Flipped bits: 7", then positions 5..20, 9..24, 13..28. The cut keys pile up as a staircase — `3A94`, `A94D`, `94D6`, `4D63`, `D63F` — each sharing 12 bits with the next, none equal to another ("distinct keys: 5").',
      'The cut key drops onto the state and only the bits under its 1s flip; the flipped count always equals the number of 1s in that key — 7, 8, 8, 8, 11.',
      'Between rounds the state passes through a closed box marked Substitute and Permute and comes back as a new value — `1C23`, `874A`, `D56E`, `A90D` — without the box being opened.',
      'Four rounds use five keys. The last step reads "Last key: positions 17..32, laid over the substituted state. Flipped bits: 11" and ends on `6AE9 ⊕ D63F = BCD6`, the "Ciphertext", with "Keys mixed: 5" and "flipped bits in total: 42".',
      'The cipher, key and plaintext are a textbook toy (16-bit block, 4 rounds), and `BCD6` matches the textbook answer. The sliding-window schedule is the toy\'s own rule — AES builds each round key by rotating, S-boxing and adding a round constant, and a sliding window whose neighbouring keys share most bits would be weak in practice. One key more than rounds matches AES-128\'s 10 rounds and 11 round keys, where the final key makes the last substitution impossible to undo without it. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays its steps on its own and stops. Neither control below it is needed for it to finish what it has to say.',
        'Under it sit a Replay button and a playback strip. Once the run has finished, dragging the strip across one round shows the window sliding, the cut key dropping onto the state and the bits under its 1s turning over.',
        'The master key and plaintext are the textbook values, so every hex value and flip count can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains what a key schedule is for and needs to show that one secret key yields a different key for every round, and where each one comes from.',
      'A reader asks what "mixing in the key" physically does to the data, and the answer is that the state bits flip exactly where the round key has a 1 and nowhere else.',
    ],

    avoidWhen: [
      'The article describes the actual AES key expansion — RotWord, SubWord, Rcon. The sliding window here is a simplified rule and is not how AES derives its keys.',
      'The subject is how a single-bit change in the plaintext spreads through the rounds. The screen follows one plaintext and does not compare two.',
      'The topic is key exchange or key distribution between two parties. The master key here is already in place and nothing is sent.',
    ],

    contrastWith: [
      {
        concept: 'substituteAndPermute',
        note: 'Substitution and permutation are fixed, public layers that anyone can undo; the round key is the only part that depends on the secret, which is why it sits between them.',
      },
      {
        concept: 'blockCipher',
        note: 'Round keys concern how one block is encrypted under one secret. Modes of operation and round counts are the choices made around that block encryption once it exists.',
      },
      {
        concept: 'xorWithKeystream',
        note: 'Both lay key material over data with XOR. A round key is one layer among several inside each round, while a keystream is XORed over the message once and is the whole encryption.',
      },
      {
        concept: 'sharedSecretInPublic',
        note: 'Key exchange is how two parties come to hold the same master key; a key schedule starts from that key already held and expands it into per-round keys.',
      },
    ],
  },
};
