/**
 * fixedSizeBlock 개념 선언.
 *
 * canonical facet 은 `facet:fixedSizeBlock` — 16 비트씩만 받는 암호가 `HELLO`(5 바이트 · 40 비트)를 앞에서부터 16 비트씩
 * 자르고(4845 · 4C4C · 4F), 8 비트뿐인 끝 덩어리에 PKCS#7 채움 바이트 01 을 붙여(4F01) 덩어리 셋을 따로 잠근다
 * (4B79 · 7723 · C3D3). 평문 40 → 채워 48 → 암호문 48 비트. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `blockCipher` 는 덩어리가 이미 선 뒤 라운드 · 모드를 견준다. 이쪽은 **메시지가 덩어리가 되는 것** 한 장면이다 —
 * definition 은 fixed width · split · padding · PKCS#7 · same width out 을 독점하고, 덩어리 사이의 이음(IV · 앞 암호문)은
 * `modeChainsBlocks` 의 말이라 쓰지 않는다. 덩어리를 따로 잠그는 꼴이 ECB 라는 것은 전제로만 밝힌다.
 *
 * 전제: 덩어리 16 비트(AES 는 128), 상자 E 는 Stinson 교과서의 장난감 SPN · 주 열쇠 5C21E07B. 덩어리를 서로 모른 채
 * 따로 잠그는 이 꼴이 ECB 이고 실물에서는 쓰지 않는다. PKCS#7 은 길이가 딱 맞아도 채움 덩어리 하나를 통째로 붙인다
 * (이 메시지에서는 일어나지 않는다).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const fixedSizeBlockConcept: FacetConceptSource = {
  id: 'fixedSizeBlock',
  label: 'Fixed Block Size: Split, Pad, Encrypt Each Block',
  canonicalFacet: 'facet:fixedSizeBlock',

  surface: {
    definition:
      'A block cipher accepts input of one fixed width only, so a longer message is split into blocks, the short final block is filled out with PKCS#7 padding, and every block leaves the cipher at that same width.',
    exemplarKeywords: [
      'block size',
      'AES 128-bit block',
      'padding',
      'PKCS#7 padding',
      'PKCS#5',
      'why ciphertext is longer than plaintext',
      'message length not a multiple of the block size',
      'splitting a message into blocks',
      'block cipher vs stream cipher',
      'full padding block when length is exact',
    ],
  },

  briefing: {
    observable: [
      'The message `HELLO` stands as five bytes, 48 45 4C 4C 4F: "Message: 5 bytes = 40 bits". Beside it a "Block cipher E" box states "the cipher takes 16 bits at a time", with "Key 5C21E07B".',
      'The message is "Cut from the front, 16 bits each" into `4845`, `4C4C` and `4F` ("blocks: 3"); the last block is marked "last block: 8 bits".',
      '"Missing bytes: 1", so one padding byte of value 01 is attached: "padding byte 01 × 1 → last block: 16 bits", and the last block becomes `4F01`.',
      'The three blocks pass one after another through the same box E, each reading "in: 16 bits" and "out: 16 bits": "Block 1: 4845 → 4B79", "Block 2: 4C4C → 7723", "Block 3: 4F01 → C3D3".',
      'The run ends on "Plaintext 40 bits → padded 48 bits → ciphertext 48 bits", with the ciphertext `4B79 7723 C3D3`. There are six steps counting the start.',
      'The block is 16 bits where AES uses 128, and the box is a textbook toy cipher. Encrypting blocks separately with no link between them, as here, is ECB, which leaks repeated blocks and is not used in practice. PKCS#7 fills n missing bytes with n bytes of value n, and adds a whole extra block of padding when the length already fits — which this message does not trigger. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays its steps on its own and stops. Neither control below it is needed for it to finish what it has to say.',
        'Under it sit a Replay button and a playback strip. Once the run has finished, dragging the strip back to the cut shows the 8-bit stub before the padding byte fills it.',
        'The message, key and every block value are fixed, so the byte and bit counts can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains why a block cipher needs padding, and a message whose last piece comes up short makes the rule concrete, down to the value of the padding byte.',
      'A reader is surprised that the ciphertext is longer than the message, and 40 bits in against 48 bits out, traced to one added byte, explains it.',
    ],

    avoidWhen: [
      'The article is about modes of operation, IVs or chaining between blocks. The blocks here are encrypted separately and nothing passes between them.',
      'The subject is padding-oracle attacks or how padding is checked during decryption. Only encryption is shown.',
      'The topic is packet fragmentation, MTU or disk blocks. The splitting here is into cipher blocks.',
    ],

    contrastWith: [
      {
        concept: 'modeChainsBlocks',
        note: 'Cutting and padding answer how a long message fits a fixed-width cipher at all. A mode such as CBC answers the next question, how those blocks should depend on each other once they exist.',
      },
      {
        concept: 'blockCipher',
        note: 'Fixed-width blocks are the precondition; the choice of mode and number of rounds is what decides how securely those blocks are then encrypted.',
      },
      {
        concept: 'hashFixedLength',
        note: 'A hash gives a fixed-length output whatever the input length. A block cipher fixes the input width too, so the message must be cut and padded, and the ciphertext grows with the message.',
      },
      {
        concept: 'compressBlockByBlock',
        note: 'A hash also splits and pads its input into blocks, but folds them into one digest of fixed size. A block cipher keeps one output block per input block, so the result can be decrypted back.',
      },
    ],
  },
};
