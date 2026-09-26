/**
 * blockCipher 개념 선언.
 *
 * canonical facet 은 `facet:blockCipher` — 같은 메시지 `SENDSEND`(덩어리 넷)를 같은 열쇠로 두 번 잠그되 두 번째에는
 * 한 비트만 바꾸고, 두 암호문을 겹친다(C ⊕ C′). 손잡이 셋(모드 ECB · CBC · CTR, 라운드 1~4, 바꾼 비트 평문 · IV)을 돌리면
 * 겹침 격자에서 켜진 비트 자리가 옮겨 간다. 기본 판(CBC · 라운드 4 · 평문)은 다른 비트 29 · 다른 칸 15 · 다른 덩어리 4 / 4.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 일곱)
 *
 * 조각 일곱은 각각 한 장면이다 — 라운드 안의 두 층(`substituteAndPermute`) · 라운드 열쇠(`roundKeyMix`) ·
 * 덩어리 크기와 채우기(`fixedSizeBlock`) · 앞 암호문의 건너감(`modeChainsBlocks`) · IV 가 가르는 두 암호문(`ivMakesDifferent`) ·
 * 키스트림 겹침(`xorWithKeystream`) · 키스트림 재사용(`neverReuseKeystream`). 이쪽은 **손잡이를 돌려 견주는 것** 을 맡는다 —
 * 차이가 한 덩어리 안에서 퍼지는 것은 라운드가, 덩어리 사이로 넘어가는 것은 모드가 정한다는 대비. 그래서 definition 은
 * modes of operation · ECB · CBC · CTR · number of rounds · across blocks 를 쥐고, 조각들이 독점한 S-box · nibble ·
 * key schedule · padding · keystream reuse 같은 한 장면의 동사를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `blockCipher.md` 가 밝힌 것):
 *  - 장난감 치환-순열 망(Stinson 교과서): 16 비트 덩어리 · 4 비트 S-상자 · 비트 순열 · 창 미끄러짐 열쇠 일정. 라운드 4 판이
 *    그 암호이고 라운드 1~3 은 실물에 없는 판이다. 짜임(바꾸기 · 섞기 · 열쇠 섞기, 마지막 라운드가 섞기를 뺌)은 AES 와 같다.
 *  - ECB 는 실물에서 쓰지 않는다. CTR 의 IV 는 논스 겸 첫 카운터다(실물은 가른다).
 *  - 열쇠 · IV · 메시지는 뽑은 값이고 채우기는 없다. 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const blockCipherConcept: FacetConceptSource = {
  id: 'blockCipher',
  label: 'Block Cipher and Modes of Operation (ECB, CBC, CTR)',
  canonicalFacet: 'facet:blockCipher',

  surface: {
    definition:
      'Encrypting a message twice with one bit changed and XORing the ciphertexts shows how the number of rounds and the mode of operation — ECB, CBC or CTR — decide where the difference spreads across blocks.',
    exemplarKeywords: [
      'block cipher modes of operation',
      'ECB vs CBC vs CTR',
      'AES',
      'why ECB is insecure',
      'ECB penguin',
      'error propagation between blocks',
      'diffusion across blocks',
      'how many rounds does a cipher need',
      'counter mode turns a block cipher into a stream cipher',
      'IV in CBC and CTR',
      'nonce reuse in CTR mode',
      'symmetric encryption',
    ],
  },

  briefing: {
    observable: [
      'The message `SENDSEND` stands as four plaintext blocks (5345 4E44 5345 4E44), with the IV A7F0 at the head and "Main key 9E3B7124" beside a closed box drawn as R stacked layers ("Rounds: 4"). A mark shows which bit is flipped for the second lock — bit 8 of block 1 by default.',
      'Each round has four steps. "Original lock" drops ciphertext C out of the box block by block; "Flipped lock" drops C′ below it; in the last step the two bit rows fold onto a grid of 4 blocks × 16 bits labelled C ⊕ C′, where only the differing bits stay lit, and a bar per block gives its count of differing bits and nibbles.',
      'In the default setting (CBC, 4 rounds, plaintext bit flipped) the caption reads "C ⊕ C′: different bits 29 · different nibbles 15 · different blocks 4 / 4", with 6 · 11 · 5 · 7 bits per block.',
      'Switching the mode moves the lit bits: ECB gathers them in the first block (11 · 0 · 0 · 0) and its original lock pairs the equal blocks 1–3 and 2–4 ("repeated blocks 2"); CBC spreads them over all four (6 · 11 · 5 · 7); CTR shrinks them to the single flipped bit (1 · 0 · 0 · 0), because there C ⊕ C′ equals the difference between the two plaintexts.',
      'The lines between blocks change with the mode: none for ECB, each ciphertext running into the next block\'s input for CBC, and "IV + i" counters feeding the box whose output is XORed beside the plaintext for CTR.',
      'Lowering the rounds thins the box. At 1 round every block keeps its lit bits inside one nibble — under CBC all four sit in nibble 2 as one vertical stripe — and from 2 rounds they spill into other nibbles. The ECB first block climbs 2 → 5 → 9 → 11 bits over rounds 1 to 4, yet the whole-grid total under CBC goes 7 → 38 → 33 → 29, not upward.',
      'Moving the flipped bit to the IV moves the mark to the IV: the ECB grid goes dark (0), the CTR grid lights all four blocks (9 · 8 · 12 · 6), and the CBC grid stays exactly as it was (29 bits), since the first block enters the box as P₁ ⊕ IV and flipping the same position on either side gives the same input.',
      'The cipher is a toy substitution-permutation network from a textbook — 16-bit blocks, 4-bit S-boxes, a bit permutation, round keys cut from the main key by a sliding window. Its 4-round setting is the textbook cipher, and rounds 1 to 3 are cut-down versions that no real cipher uses; the layering of substitute, permute and key mixing, with the permute dropped from the last round, is the same as in AES. ECB is shown for contrast and is not used in practice, and the CTR counter here starts from the IV, where real CTR keeps a separate nonce and counter. Key, IV and message are chosen values and the message needs no padding. The screen footnotes none of this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus three handles: "Mode" (ECB · CBC · CTR, starting at CBC), "Rounds" (1 to 4, starting at 4) and "Flipped bit" (Plaintext · IV, starting at Plaintext). Each setting plays its four steps and then waits for the next turn of a handle.',
        'Four readouts under the controls carry each round: Different bits, Different nibbles, Different blocks and Repeated blocks. Between settings the per-block bars leave the previous heights as dotted outlines, so a change of handle shows as bars growing or shrinking from them.',
        'The move that makes the idea land is stepping the Mode handle ECB → CBC → CTR with everything else fixed, then trying the IV flip under each mode.',
        'The code panel, labelled "Code", starts empty with a "+ Add language" button; the chosen language shows `encryptBlock` (the rounds) and `encryptMode` (one routine that branches on the mode number) and highlights the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#, not language-specific behaviour.',
      ],
    },

    useWhen: [
      'An article compares ECB, CBC and CTR and needs one input changed by one bit to show, side by side, which mode keeps the change in its block, which carries it forward and which hands it over untouched.',
      'A reader asks what rounds and modes each contribute to security, and the answer needs the split made visible: rounds spread a difference inside one block, the mode decides whether it reaches the others.',
      'The text claims that more rounds always means more scrambling, and a counterexample is wanted where the total over several blocks rises and then falls.',
    ],

    avoidWhen: [
      'The article is about the internals of AES — MixColumns, the Rijndael S-box, GF(2⁸) arithmetic or the real key expansion. The cipher here is a 16-bit toy and its box is not opened layer by layer.',
      'The subject is authenticated encryption, GCM or padding-oracle attacks. There is no authentication tag and no padding in this message.',
      'The topic is public-key encryption or key exchange. Both locks here use one shared secret key.',
    ],

    contrastWith: [
      {
        concept: 'substituteAndPermute',
        note: 'Substitution and permutation explain how one round moves a difference out of its nibble. Comparing modes takes that spreading as given and asks whether it ever crosses a block boundary.',
      },
      {
        concept: 'modeChainsBlocks',
        note: 'Chaining is the CBC rule on its own, one ciphertext feeding the next block. Setting modes against each other asks what that rule buys compared with encrypting blocks separately or through a counter.',
      },
      {
        concept: 'neverReuseKeystream',
        note: 'Keystream reuse is the specific failure of a stream construction used twice. Among the modes it is the case where CTR under one IV leaks the plaintext difference exactly.',
      },
      {
        concept: 'ivMakesDifferent',
        note: 'A fresh IV hides that the same message was sent again. Across modes the same IV change does very different things: nothing under ECB, which reads no IV, and every block under CTR.',
      },
      {
        concept: 'asymmetricRsa',
        note: 'RSA splits locking and unlocking between two keys; a block cipher uses one secret key for both and is chosen for speed on bulk data.',
      },
      {
        concept: 'hashAvalanche',
        note: 'Both measure how many output bits a one-bit input change flips. A hash has one output and no key; a block cipher under a mode also has to decide which blocks the change reaches.',
      },
    ],
  },
};
