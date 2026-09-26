/**
 * compressBlockByBlock 개념 선언.
 *
 * canonical facet 은 `facet:compressBlockByBlock` — 메시지 `MEET AT 9` 가 2 바이트 덩어리로 잘리고 패딩 `80 00 48` 이
 * 붙은 뒤, 걸음마다 덩어리 하나가 f 를 건너 상태 칸으로 들어가 사라진다. 상태는 6a09 에서 4a00 까지 16 비트 그대로.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `sha` 는 열쇠 · 공격 · 판정을 견주고, 형제 조각 `internalStateCarries` 는 끝 값이 다음 접기의 출발점이라는
 * 것을 말한다. 이쪽은 **해시 하나의 안쪽 — 자르고 채워 한 덩어리씩 흡수하는 것** 하나다. 그래서 definition 은
 * pad · fixed-width block · absorb · state width never grows 를 독점하고, 열쇠 · 이어 접기 · 공격 낱말을 쓰지 않는다.
 *
 * 전제 (설명 글 `compressBlockByBlock.md`):
 *  - 장난감 해시 — 상태 16 비트 · 덩어리 2 바이트 · 길이 칸 16 비트 · 세 라운드 · IV 6a09 (SHA-256 첫 IV 단어의 앞 16 비트).
 *  - 실물과 같은 것: 덩어리로 자르기 · 80/00/길이 패딩 · 앞 상태와 함께 접고 더해 넘기기 · 끝 상태가 해시값.
 *  - f 의 라운드 안쪽은 그리지 않는다. 메시지는 예로 정한 값.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const compressBlockByBlockConcept: FacetConceptSource = {
  id: 'compressBlockByBlock',
  label: 'Hash Absorbs the Message Block by Block',
  canonicalFacet: 'facet:compressBlockByBlock',

  surface: {
    definition:
      'A Merkle–Damgård hash pads the message to a whole number of fixed-width blocks, then feeds one block per compression call into a state whose width never changes; the final state is the digest.',
    exemplarKeywords: [
      'Merkle–Damgård construction',
      'compression function',
      'SHA-256 padding',
      'message block',
      'how SHA-256 processes a message',
      'length padding 0x80',
      'Merkle–Damgård strengthening',
      'iterated hash',
      'initialization vector IV',
      'how a hash handles long input',
    ],
  },

  briefing: {
    observable: [
      'The message `MEET AT 9` sits as nine bytes in one line, with "Message bytes: 9". A State box beside it holds the IV 6a09, marked "Width (bits): 16".',
      'The cut: the bytes spread into 2-byte blocks and a Padding group `80 00 48` joins the end — "Bytes: message 9 + padding 3 = 12. Blocks: 6." The last letter `9` (39) and the padding byte 80 share one block, 3980; the final block 0048 is the length, "Length (bits): 72".',
      'Each following step moves the front block across `f` into the State box, where it disappears, and "Blocks left" drops by one: "Block 4d45 folded in: f(6a09, 4d45) = 55b8. Blocks left: 5."',
      'The state runs 6a09 → 55b8 → b8a9 → 3579 → cc60 → c926 → 4a00. It stays four hex digits the whole time; the blocks do not pile up inside it.',
      'After the last block 0048, "Blocks left: 0" and the State box is relabelled "Hash value: 4a00". The run is eight steps including the start.',
      'The hash is a reduced model of SHA-256: 16-bit state instead of 256, 2-byte blocks instead of 64, a 16-bit length field instead of 64, three rounds instead of 64, and the IV 6a09 taken from the first 16 bits of SHA-256\'s first IV word. The cutting, the 80/00/length padding, the folding of each block with the previous state, and the final state being the digest are the real structure. The inside of `f` is not drawn. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays its eight steps on its own and stops after the hash value appears.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging the strip between the cut and the first fold shows the whole line of blocks waiting beside a state that has not moved yet.',
        'The message and every value are fixed, so an article can quote each block and state exactly.',
      ],
    },

    useWhen: [
      'The reader pictures a hash swallowing the whole file at once and cannot see how any length ends up the same size; watching blocks vanish into a state that never widens answers it.',
      'The article explains what the padding bytes 80, 00 and the length field are for, and needs a message where the last character and the 80 share a block.',
    ],

    avoidWhen: [
      'The article compares digest lengths across many inputs of different sizes. Only one message is hashed here.',
      'The subject is length extension or forging a tag. Nothing here continues from a digest or involves a key.',
      'The point is what happens inside one round of SHA-256 — message schedule, Σ functions, constants. The compression step is drawn as a single box.',
      'The article is about sponge constructions such as SHA-3. The structure here is Merkle–Damgård only.',
    ],

    contrastWith: [
      {
        concept: 'hashFixedLength',
        note: 'That every input yields a digest of one width is an external property; absorbing padded blocks into a fixed-width state is the mechanism that produces it.',
      },
      {
        concept: 'internalStateCarries',
        note: 'Both concern the state passed from block to block. Absorbing covers one message from IV to digest; carrying asks what happens when someone starts again from that digest.',
      },
      {
        concept: 'sha',
        note: 'Block-by-block absorption is the hash with no key and no adversary. Message authentication builds on it and asks whether keyed variants of it can be forged.',
      },
      {
        concept: 'hashChain',
        note: 'Both feed a previous hash into the next computation. Within one hash that is the internal state between blocks; across records it is a stored digest linking separate entries.',
      },
    ],
  },
};
