/**
 * ivMakesDifferent 개념 선언.
 *
 * canonical facet 은 `facet:ivMakesDifferent` — 같은 메시지 `PAY100` 을 같은 열쇠 61D4F29A 로 CBC 잠금하되 두 쪽의 IV 만
 * 다르다(3C5E · D18B, 다른 비트 11 / 16). 덩어리마다 한 걸음, 두 암호문이 위아래로 갈라지고 다른 비트가 칠해진다
 * (9 · 8 · 6 / 16, 합 23 / 48, 다른 덩어리 3 / 3). 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `blockCipher` 는 모드마다 IV 한 비트가 무엇을 하는지(ECB 무 · CBC 평문과 같음 · CTR 전부)를 견준다. 이쪽은
 * **같은 메시지를 두 번 보낼 때의 두 쪽 어긋남** 한 장면이다 — 한 쪽 안에서 값이 건너가는 운동은 `modeChainsBlocks` 의 말.
 * definition 은 same message sent twice · fresh IV · not secret · reveals repeat 를 독점하고, "같은 평문 덩어리 넷" 쪽
 * 낱말을 쓰지 않는다.
 *
 * 전제: 상자는 Stinson 교과서의 장난감 SPN · 열쇠와 IV 둘은 뽑은 값. 같은 IV 로 두 번 잠그면 암호문이 비트까지 같다는
 * 대조는 화면에 없고 설명 글이 밝힌다. IV 는 비밀이 아니며 암호문 앞에 붙여 보낸다. 채우기 없음(6 바이트).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const ivMakesDifferentConcept: FacetConceptSource = {
  id: 'ivMakesDifferent',
  label: 'A Fresh IV Hides a Repeated Message',
  canonicalFacet: 'facet:ivMakesDifferent',

  surface: {
    definition:
      'Sending the same message twice under the same key with a fresh, non-secret initialization vector each time yields ciphertexts that differ from the first block on, so an eavesdropper cannot tell the message was repeated.',
    exemplarKeywords: [
      'initialization vector',
      'IV',
      'random IV',
      'IV is not secret',
      'semantic security',
      'probabilistic encryption',
      'same plaintext encrypts differently',
      'IV reuse',
      'nonce',
      'deterministic encryption leaks repeats',
    ],
  },

  briefing: {
    observable: [
      'The message `PAY100` (blocks `5041` PA, `5931` Y1, `3030` 00) sits in the middle, with two rows around it: "Sent first" above and "Sent second" below. The first frame reads "Same message, same key on both sides. Only the IV differs." and the "Key (both sides)" is shared.',
      'The two IVs are `3C5E` and `D18B`, marked "Differing bits between the two IVs: 11 / 16".',
      'One step per block: "Block 1: each side XORs in its previous value and locks with the same key." The two ciphertexts split away from the shared plaintext to their own rows, and the bit positions where they differ are painted.',
      'Block 1 comes out `D7A4` against `B47E` (9 / 16 differ), block 2 `4813` against `FC58` (8 / 16), block 3 `2993` against `1DD0` (6 / 16). The run ends on "Blocks that differ: 3 / 3" and "differing bits in all: 23 / 48". Four steps in all, counting the start.',
      'The plaintext is identical under both rows, yet they differ from the very first block, and because each ciphertext feeds the next block they stay apart after it. Both still decrypt to `PAY100`.',
      'The cipher is a textbook toy (16-bit blocks, where AES uses 128), key 61D4F29A and both IVs are chosen values, and the six-byte message needs no padding. Encrypting twice with the same IV would give two identical ciphertexts bit for bit; that case is not on screen. The IV is sent in the clear ahead of the ciphertext, and in practice it is drawn fresh — and for CBC unpredictably — for every message. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays its steps on its own and stops. Neither control below it is needed for it to finish what it has to say.',
        'Under it sit a Replay button and a playback strip. Once the run has finished, dragging the strip back to the first block shows the two rows splitting apart before any later block is involved.',
        'The message, key and both IVs are fixed, so every block value and bit count can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains what an IV is for and needs to show that the same message under the same key comes out entirely different when only the IV changes.',
      'A reader thinks the IV must be kept secret like the key, and the article wants a case where two public IVs alone are enough to make the two sendings unrecognisable as the same.',
    ],

    avoidWhen: [
      'The article is about how CBC links blocks inside one message. Chaining is used here but not stepped through on its own.',
      'The subject is nonce reuse in a stream cipher or CTR mode and the plaintext it leaks. The screen shows two different IVs working, not one IV used twice.',
      'The topic is password salting. The random value here goes into encryption under a key, not into a hash.',
    ],

    contrastWith: [
      {
        concept: 'modeChainsBlocks',
        note: 'Chaining makes equal blocks within one message differ. The IV makes one whole message differ across sendings; without a fresh IV, chaining alone would repeat the same ciphertext every time.',
      },
      {
        concept: 'hashSalt',
        note: 'A salt and an IV are both public random values that make identical inputs produce different outputs. A salt goes into a one-way hash to stop precomputed guessing; an IV goes into reversible encryption to hide repetition.',
      },
      {
        concept: 'neverReuseKeystream',
        note: 'A fresh IV is the defence; keystream reuse is what happens in a stream construction when that freshness is lost, and it leaks more than the fact of repetition.',
      },
      {
        concept: 'blockCipher',
        note: 'An IV\'s effect depends on the mode: under CBC a new IV changes every block of the message, while ECB reads no IV at all and so repeats itself regardless.',
      },
    ],
  },
};
