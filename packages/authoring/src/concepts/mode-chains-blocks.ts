/**
 * modeChainsBlocks 개념 선언.
 *
 * canonical facet 은 `facet:modeChainsBlocks` — 메시지 `GOGOGOGO` 의 덩어리 넷이 모두 474F 인데, CBC 로 잠그면 앞 암호문이
 * 다음 덩어리 입구로 건너가 겹쳐(첫 덩어리는 IV A7F0) 상자에 드는 값이 E0BF · FCF5 · A48F · C494 로 넷 다 다르고,
 * 암호문도 BBBA · E3C0 · 83DB · 9DDB 로 넷 다 다르다. 덩어리마다 두 걸음(건너와 겹침 · 상자 지남), 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `blockCipher` 는 ECB · CBC · CTR 을 돌려 견준다. 이쪽은 **한 메시지 안에서 앞 암호문이 뒤로 건너가는 운동** 한
 * 장면이다 — 견줌은 주장이 아니다. `ivMakesDifferent` 는 같은 메시지를 두 번 보내는 두 쪽의 어긋남을 쥐므로, definition 은
 * previous ciphertext · XORed into the next block · identical plaintext blocks → different ciphertext blocks 를 독점하고
 * "두 번 보냄 · 새 IV" 쪽 낱말을 쓰지 않는다.
 *
 * 전제: 상자 E 는 Stinson 교과서의 장난감 SPN(속은 열지 않는다) · 열쇠 9E3B7124 · IV A7F0 은 뽑은 값. 메시지가 덩어리의
 * 배수라 채우기가 없다. 따로 잠갔다면(ECB) 넷 모두 FDCF 가 되었다는 대조는 화면에 없고 설명 글이 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const modeChainsBlocksConcept: FacetConceptSource = {
  id: 'modeChainsBlocks',
  label: 'CBC Mode: Each Ciphertext Feeds the Next Block',
  canonicalFacet: 'facet:modeChainsBlocks',

  surface: {
    definition:
      'In CBC mode each ciphertext block is XORed into the next plaintext block before it is encrypted, the first taking the IV, so a message of identical plaintext blocks still yields all-different ciphertext blocks.',
    exemplarKeywords: [
      'CBC',
      'cipher block chaining',
      'chaining mode',
      'repeated plaintext blocks',
      'hide patterns in ciphertext',
      'CBC encryption is sequential',
      'CBC decryption can run in parallel',
      'previous ciphertext block',
      'ECB leaks repeated blocks',
      'AES-CBC',
    ],
  },

  briefing: {
    observable: [
      'Four plaintext blocks stand in a column, every one `474F` (the message `GOGOGOGO`). A "Box E" sits beside them, and the first frame reads "Nothing locked yet — IV A7F0 sits atop the ciphertext column".',
      'Each block takes two steps. First the value above crosses down and is XORed in — "IV A7F0 crosses to block 1: 474F ⊕ A7F0 = E0BF" — then that value goes through the box: "Block 1: E(E0BF) = BBBA".',
      'The fresh ciphertext then crosses to the next block: "Ciphertext BBBA of block 1 crosses to block 2: 474F ⊕ BBBA = FCF5", and so on down to "Block 4: E(C494) = 9DDB". Nine steps in all, counting the start.',
      'Three counters sit side by side: "Distinct plaintext blocks" stays at 1, while "Distinct values into the box" and "Distinct ciphertexts" climb to 4. The column labels "Carried in", "Into box" and "Ciphertext" name the three stages of each block.',
      'The ciphertext ends as `BBBA E3C0 83DB 9DDB`, all four different, from a plaintext that repeated one block four times.',
      'The box E is a textbook toy cipher (16-bit blocks, where AES uses 128) and is not opened. Key 9E3B7124 and IV A7F0 are chosen values, and the message is a whole number of blocks so no padding is drawn. Encrypted separately (ECB), all four blocks would have come out as `FDCF`; that comparison is not on screen. Decryption XORs the previous ciphertext back in after the box, so it can run on all blocks in parallel while encryption must wait for each one. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays its steps on its own and stops. Neither control below it is needed for it to finish what it has to say.',
        'Under it sit a Replay button and a playback strip. Once the run has finished, dragging the strip across one block shows a ciphertext leaving the box and landing in the next block\'s input.',
        'The message, key and IV are fixed, so every XOR and box output can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains how CBC works and needs the one rule made visible: the ciphertext of one block is folded into the input of the next, starting from the IV.',
      'A reader asks how a mode can make identical plaintext blocks look different without changing the key, and four equal blocks turning into four unequal ciphertexts answers it.',
    ],

    avoidWhen: [
      'The article compares several modes, or needs ECB and CTR on screen. Only CBC is shown here.',
      'The subject is why the IV must be fresh for each message, or two encryptions of the same message. A single message is encrypted once.',
      'The point is CBC bit-flipping or padding-oracle attacks. Decryption and tampering are not shown.',
    ],

    contrastWith: [
      {
        concept: 'blockCipher',
        note: 'Chaining is one mode described on its own terms. Setting it against ECB and CTR is a different claim: what each mode does with a difference that enters one block.',
      },
      {
        concept: 'ivMakesDifferent',
        note: 'Chaining makes repeated blocks within one message differ. A fresh IV makes the same whole message differ from one sending to the next; one works inside a message, the other across messages.',
      },
      {
        concept: 'fixedSizeBlock',
        note: 'Splitting and padding produce the blocks; chaining decides how each block\'s encryption depends on the ones before it.',
      },
      {
        concept: 'hashChain',
        note: 'Both carry an output forward into the next item. A hash chain does it so that an edit is detected downstream; CBC does it so that equal plaintext blocks stop looking equal.',
      },
    ],
  },
};
