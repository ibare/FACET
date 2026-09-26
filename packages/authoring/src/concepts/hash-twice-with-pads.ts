/**
 * hashTwiceWithPads 개념 선언.
 *
 * canonical facet 은 `facet:hashTwiceWithPads` — 열쇠 K a53f 가 ipad 와 겹쳐 안쪽 열쇠 9309 가 되어 메시지 `HI` 앞에서
 * 한 번 접히고(안쪽 값 26a4), opad 와 겹친 바깥 열쇠 f963 뒤 메시지 자리로 안쪽 값이 옮겨 가 한 번 더 접혀 HMAC 1270.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 형제 `keyPlusMessage` 는 MAC 을 닫힌 셈으로 두고 "열쇠 없이는 표를 못 만든다" 를, 완제품 `sha` 는 방식별 판정을 말한다.
 * 이쪽은 **HMAC 의 짜임 — 열쇠가 두 무늬로 두 번 들어가고 안쪽 값이 바깥 접기의 메시지 자리를 차지한다** 하나다.
 * 그래서 definition 은 ipad · opad · inner key · outer key · inner result becomes the message 를 독점하고,
 * 위조자 · 판정 · 같은 길 을 쓰지 않는다.
 *
 * 전제 (설명 글 `hashTwiceWithPads.md`): 장난감 해시(상태 16 비트 · 덩어리 2 바이트 · 세 라운드 · IV 6a09).
 * HMAC 식과 ipad 36 · opad 5c 를 덩어리 폭만큼 되풀이하는 규칙은 RFC 2104 그대로. 열쇠는 덩어리 폭과 같아 채우거나
 * 줄이지 않는다. K a53f · `HI` 는 예로 정한 값. 두 H 는 각각 한 걸음의 셈으로만 보인다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const hashTwiceWithPadsConcept: FacetConceptSource = {
  id: 'hashTwiceWithPads',
  label: 'HMAC Construction: Inner and Outer Hash with ipad and opad',
  canonicalFacet: 'facet:hashTwiceWithPads',

  surface: {
    definition:
      'HMAC XORs the key with ipad to form an inner key hashed together with the message, then XORs the key with opad to form an outer key and hashes it with that inner result in the message\'s place.',
    exemplarKeywords: [
      'HMAC',
      'ipad and opad',
      'RFC 2104',
      'HMAC formula H((K ⊕ opad) || H((K ⊕ ipad) || m))',
      'inner hash and outer hash',
      'nested hash',
      'how HMAC works step by step',
      'HMAC-SHA-256',
      '0x36 and 0x5c',
    ],
  },

  briefing: {
    observable: [
      'The start shows the key "K = a53f · message HI" (bytes 48 49) and the two pads, ipad 3636 and opad 5c5c.',
      'K meets ipad: "Inner key: K ⊕ ipad = a53f ⊕ 3636 = 9309".',
      'The inner key is placed in front of the message and hashed once: "Inner fold: H(9309 ‖ 4849) = 26a4", labelled the inner value.',
      'K meets opad this time: "Outer key: K ⊕ opad = a53f ⊕ 5c5c = f963".',
      'The inner value 26a4 crosses to the outer line and takes the slot marked "message slot" behind the outer key: "outer input: f9 63 26 a4".',
      'The outer input is hashed once more: "Outer fold: H(f963 ‖ 26a4) = 1270 — HMAC". The run is six steps including the start.',
      'The two keys come from the same K but differ; their XOR, 9309 ⊕ f963 = 6a6a, is exactly ipad ⊕ opad.',
      'Each H is shown as a single computation step; the blocks inside it are not drawn. The hash is a reduced 16-bit model starting from 6a09; the HMAC formula and the pad rule (bytes 36 and 5c repeated to the block width, per RFC 2104) are the real ones, and the 2-byte key equals the block width so it is neither padded nor hashed first. K a53f and `HI` are example values. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays its six steps on its own and stops once the HMAC value appears.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging the strip to the step where the inner value moves isolates the hand-off: a hash output becoming the input of the next hash.',
        'Every key, pad and value is fixed, so an article can quote the arithmetic exactly.',
      ],
    },

    useWhen: [
      'The article walks through the HMAC formula and the reader cannot see why the key appears twice or what ipad and opad are for; the two masked keys and the moving inner value put each symbol in place.',
      'The reader asks why HMAC hashes twice instead of once over key and message, and the article needs the nested structure laid out before discussing what it prevents.',
    ],

    avoidWhen: [
      'The article only needs to say that a keyed tag cannot be forged without the key. The internal steps would be detail the argument does not use.',
      'The subject is an attack on a specific scheme or a comparison of verdicts. No forger or verifier appears.',
      'The point is key derivation such as HKDF or PBKDF2, which use HMAC as a building block for a different goal.',
      'The article needs real HMAC-SHA-256 outputs or how long keys are hashed down first. Values here are 16-bit and the key is exactly one block.',
    ],

    contrastWith: [
      {
        concept: 'keyPlusMessage',
        note: 'Needing a key to make a tag is the requirement; the two masked keys around two nested hashes are one standard way of meeting it safely.',
      },
      {
        concept: 'internalStateCarries',
        note: 'A single hash outputs a state that can be resumed. Nesting the inner result under a second keyed hash is the answer to exactly that weakness.',
      },
      {
        concept: 'sha',
        note: 'The nested construction stands on its own as a recipe; setting it beside simpler keyed hashes is what reveals which forgery the second hash blocks.',
      },
      {
        concept: 'hashSalt',
        note: 'A salt is one public value prepended once to vary stored hashes. HMAC prepends a secret twice, masked two ways, to bind a tag to its key.',
      },
    ],
  },
};
