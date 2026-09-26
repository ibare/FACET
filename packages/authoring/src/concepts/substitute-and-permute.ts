/**
 * substituteAndPermute 개념 선언.
 *
 * canonical facet 은 `facet:substituteAndPermute` — 한 비트만 다른 두 평문 A = B2DA · B = B3DA 가 같은 라운드를
 * 나란히 지난다. 바꾸기(S) 걸음은 다른 비트를 제 칸(니블) 안에서만 늘리고, 섞기(P) 걸음은 그것을 다른 칸으로 옮긴다.
 * 다른 칸의 수는 걸음마다 1 · 1 · 2 · 2 · 3 · 3 · 4 · 4. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `blockCipher` 는 라운드 수와 모드를 돌려 차이가 덩어리 사이로 넘어가는지를 견준다. 이쪽은 **한 덩어리 안,
 * 라운드 속의 두 층**만 연다 — 주장은 "바꾸기는 칸 안에 가두고 섞기는 칸 밖으로 옮긴다" 하나다. 그래서 definition 은
 * S-box · nibble · bit permutation · stays inside / moves across 를 독점하고, 모드 · 덩어리 사이 · 열쇠 낱말을 쓰지 않는다.
 * 열쇠 섞기는 `roundKeyMix` 의 말이라 이 조각은 주 열쇠를 0 으로 두어 그 층을 뺐다.
 *
 * 전제: Stinson 교과서의 장난감 SPN(16 비트 덩어리 · 4 비트 S-상자 · 라운드 넷). 라운드마다 바꾸기와 섞기를 되풀이하고
 * 마지막 라운드가 섞기를 빼는 짜임은 AES 와 같다(AES 는 MixColumns 를 뺀다). "섞기가 늘 칸을 하나씩 늘린다" 는 법칙이
 * 아니다 — 이 두 평문은 고르게 번지는 모습을 보이려 고른 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const substituteAndPermuteConcept: FacetConceptSource = {
  id: 'substituteAndPermute',
  label: 'Substitution-Permutation Rounds: Confined, Then Spread',
  canonicalFacet: 'facet:substituteAndPermute',

  surface: {
    definition:
      'In a substitution-permutation network the S-box layer changes bits only inside their own 4-bit nibble, while the bit permutation layer moves them into other nibbles, so one flipped bit needs several rounds to reach the whole block.',
    exemplarKeywords: [
      'substitution-permutation network',
      'SPN',
      'S-box',
      'permutation layer',
      'confusion and diffusion',
      'Shannon confusion diffusion',
      'AES SubBytes and ShiftRows',
      'why a cipher needs several rounds',
      'diffusion inside a block',
      'nibble',
    ],
  },

  briefing: {
    observable: [
      'Two 16-bit rows, A = `B2DA` and B = A with only bit 8 flipped, pass through the same rounds side by side ("Start: B is A with only bit 8 flipped."). The bits where A and B differ are painted, and the nibbles that hold a differing bit are lit as bands labelled Nibble 1 to Nibble 4.',
      'The screen moves one layer per step, eight steps counting the start. A substitute step reads "substitute: each nibble goes through the S-box on its own." — the painted bits can multiply there, but only inside the nibble they were already in, so "Different nibbles" does not change.',
      'A permute step reads "permute: bits move to new positions, across nibbles." with "Bits that move: 12 / 16"; the painted bits land in other nibbles and the count of lit nibbles rises.',
      'Across the run the readout goes Different nibbles 1 / 4, 1 / 4, 2 / 4, 2 / 4, 3 / 4, 3 / 4, 4 / 4, 4 / 4. One substitute and one permute reach only two nibbles; all four are reached only after the third permute.',
      'Round 4 is a substitute with "No permute follows." After it A is `97A9` and B is `6956`, and "Different bits: 15" of 16.',
      'The cipher is a textbook toy substitution-permutation network with 16-bit blocks and 4-bit S-boxes, a scaled-down AES (128-bit blocks, 8-bit S-boxes, ShiftRows and MixColumns). Dropping the permute from the last round mirrors AES dropping MixColumns. Round-key mixing is left out by using an all-zero key. The one-nibble-per-permute pace belongs to this chosen pair — with other plaintexts a permute can even reduce the lit nibbles. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays its steps on its own and stops. Neither control below it is needed for it to finish what it has to say.',
        'Under it sit a Replay button and a playback strip. Once the run has finished, dragging the strip back and forth across one substitute step and the permute after it shows the painted bits first multiplying in place, then jumping nibbles.',
        'The plaintexts, S-box and permutation are fixed, so every hex value and count can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains confusion and diffusion and needs the two jobs pulled apart: the S-box scrambles within a small group of bits, the permutation is what carries a change beyond that group.',
      'A reader wonders why a block cipher repeats its round many times instead of running it once, and a one-bit difference still stuck in two nibbles after a full round answers it.',
    ],

    avoidWhen: [
      'The article is about modes of operation or how a change travels from one block to the next. Everything here happens inside a single 16-bit block.',
      'The subject is the key schedule or how round keys are derived. The key is held at zero so that no key is mixed in.',
      'The point is the avalanche statistic of a finished cipher or hash — about half the output bits flipping. The screen follows where differing bits sit layer by layer, not an end-state percentage.',
    ],

    contrastWith: [
      {
        concept: 'blockCipher',
        note: 'Rounds spreading a difference inside one block is the within-block half of a cipher. Whether that difference then reaches the other blocks of a message is decided by the mode, a separate question.',
      },
      {
        concept: 'roundKeyMix',
        note: 'Substitution and permutation are fixed public layers that scramble but hide nothing on their own; the round key is the secret layer interleaved with them.',
      },
      {
        concept: 'hashAvalanche',
        note: 'The avalanche effect is the finished outcome, roughly half the output bits changing. Substitution and permutation are the mechanism that produces it, one layer at a time.',
      },
    ],
  },
};
