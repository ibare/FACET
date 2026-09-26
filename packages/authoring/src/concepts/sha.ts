/**
 * sha 개념 선언.
 *
 * canonical facet 은 `facet:sha` — Alice 가 글 `PAY 10` 에 표를 붙여 보내고, 가운데 Mallory 가 열쇠 없이 다른 글과
 * 맞는 표를 붙이려 한다. 손잡이 둘: 방식(`H(m)` · `H(K‖m)` · `HMAC`) × 공격(고치기 · 이어 붙이기). 걸음 5 에서
 * Mallory 가 접은 칸이 Bob 의 줄에 내려앉는지(land) 끊기는지 보인다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 넷)
 *
 * 조각 넷은 각각 한 장면이다 — 덩어리마다 접기(`compressBlockByBlock`) · 끝 상태가 출발점(`internalStateCarries`) ·
 * 열쇠 없는 사람은 표를 못 만든다(`keyPlusMessage`) · 안팎 두 번 접기(`hashTwiceWithPads`). 이쪽은 그것들을
 * 한 판에 잇고 **방식 셋 × 공격 둘의 판정을 견주는 것**을 맡는다. 그래서 definition 은 세 방식의 이름 ·
 * 두 공격(rewrite · append) · 받아들임/버림을 쥐고, 조각들이 독점한 padding · fixed-width block ·
 * ipad/opad 파생 · 같은 길(one channel) 을 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `sha.md` 가 밝힌 것):
 *  - 해시는 장난감 H — 상태 16 비트 · IV 6a09 · 덩어리 2 바이트 · 세 라운드 · 길이 칸 16 비트. 실물은 SHA-256 · HMAC-SHA-256.
 *  - 실물과 같은 것: 메르클-담고르 짜임 · 끝 상태가 곧 해시값 · 패딩이 길이를 담는다 · HMAC 의 식과 ipad/opad 규칙.
 *  - 열쇠 7c1e · 글 PAY 10 · 고친 글 PAY 90 · 이어 붙일 글 ME 는 예로 정한 값.
 *  - `H(K‖m)` 은 실제로 쓰는 방식이 아니다 — 길이 늘이기를 보이려고 둔 판이다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const shaConcept: FacetConceptSource = {
  id: 'sha',
  label: 'Hash-Based Message Authentication (H(m), H(K‖m), HMAC)',
  canonicalFacet: 'facet:sha',

  surface: {
    definition:
      'Three ways to tag a message — plain hash, key-prefixed hash H(K‖m), and HMAC — tested against a rewritten and an appended forgery: prefixing the key stops rewriting but not appending, HMAC blocks both.',
    exemplarKeywords: [
      'HMAC',
      'length extension attack',
      'H(key || message) is insecure',
      'secret prefix MAC',
      'why not just hash the key and message',
      'message authentication with SHA-256',
      'Merkle–Damgård',
      'forged tag',
      'HMAC vs keyed hash',
      'SHA-256 vs HMAC-SHA-256',
    ],
  },

  briefing: {
    observable: [
      'Three rows face each other: Alice and Bob each marked "key 7c1e", Mallory in the middle marked "no key". Alice sends the message `PAY 10` with a tag; each fold of the hash is drawn as a cell holding a block and the state after it, starting from "IV 6a09".',
      'Alice folds to the end and the last state becomes the tag — under `H(K‖m)` that is 6b5d. The message and tag then cross over and Mallory takes them.',
      'Under "Rewrite", Mallory changes the message to `PAY 90` and folds it from IV with no key. Under "Extend", he appends the original padding (shown as boxed hex bytes, `80 00 00 40`) and then `ME`, puts the received tag into the state box and keeps folding: `6b5d → be14 → f715 → cf98`.',
      'Bob refolds the message he received in his own row. Columns are block positions, so Mallory\'s cells stand directly above the matching cells of Bob\'s row. Under `H(m)` and `H(K‖m)` with Extend, block and state agree and the caption reads "Mallory\'s 3 cells land on his row"; under HMAC the blocks agree but the states do not ("Same blocks, other states: Mallory\'s cells break off"), and Bob still has an outer fold to go.',
      'The round ends with "Bob accepts: cf98 = cf98" or "Bob rejects: 62e3 ≠ 3bea". Over the six combinations: `H(m)` accepts both forgeries, `H(K‖m)` accepts Extend and rejects Rewrite, HMAC rejects both. The count per scheme across both attacks is not shown in any single round.',
      'Three readouts under the controls: Mallory folds (5 for Rewrite, always 3 for Extend), Bob folds (8, 9, 13 under Extend as the scheme goes H(m), H(K‖m), HMAC), and Accepted (1 or 0).',
      'The hash is a reduced model: a 16-bit state starting at 6a09, 2-byte blocks, three rounds, a 16-bit length field. What matches real SHA-256 and HMAC-SHA-256 is the structure — blocks folded one after another into a state, the final state used as the digest, padding that records the length, and the HMAC formula with ipad and opad. The key 7c1e and the messages are example values, and `H(K‖m)` is included to exhibit length extension, not as a scheme anyone should deploy. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Scheme" with segments H(m), H(K‖m) (default) and HMAC, and "Attack" with segments Rewrite and Extend (default). Each round runs seven steps and then waits for a handle.',
        'The move that makes the idea land is holding Attack on Extend and turning Scheme from H(K‖m) to HMAC: the same three appended cells stop landing on Bob\'s row and the verdict flips from accept to reject. Switching H(K‖m) between Rewrite and Extend shows the one scheme whose verdict depends on the attack.',
        'A code panel labelled "Code" sits under the controls; the reader adds a language to see the tag computation, which is one IR rendered in Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article argues that putting a secret in front of the message before hashing is not enough, and needs the one case where that scheme is accepted set right beside the case where it holds.',
      'A reader wants to know what HMAC buys over a keyed hash in concrete terms: the same forgery is run against all three schemes and only the verdicts change.',
    ],

    avoidWhen: [
      'The article is about digital signatures or public-key authentication. Every party here that can make a tag shares one symmetric key.',
      'The subject is password storage, salting or key stretching. The key here authenticates a message in transit; nothing is stored or slowed down.',
      'The point is collision resistance or finding two messages with the same digest. No forgery here relies on a collision.',
      'The article needs real SHA-256 digests or bit lengths. The values are 16-bit and come from a reduced model.',
    ],

    contrastWith: [
      {
        concept: 'keyPlusMessage',
        note: 'That a key-dependent tag cannot be recomputed by someone without the key is the premise; the comparison of schemes asks how the key is mixed in, because one way of mixing still lets an outsider extend a valid tag.',
      },
      {
        concept: 'internalStateCarries',
        note: 'A digest doubling as a resumable state is a property of the hash alone. It becomes an attack only once a secret-prefixed digest is used as an authentication tag, which is what the scheme comparison is about.',
      },
      {
        concept: 'hashTwiceWithPads',
        note: 'The inner and outer keyed hashes are how HMAC is built; comparing HMAC with simpler schemes is about which forgery that construction defeats.',
      },
      {
        concept: 'compressBlockByBlock',
        note: 'Absorbing a padded message block by block is how the underlying hash works in any use. Authentication adds a key and an adversary to that mechanism and asks whether a forged tag passes.',
      },
      {
        concept: 'hashIntegrityCheck',
        note: 'An unkeyed hash detects tampering only when the digest travels by a route the tamperer cannot touch. Keyed tags travel with the message, so their protection has to come from the key instead.',
      },
      {
        concept: 'hashSalt',
        note: 'A salt is a public value placed before the input and a secret prefix is a private one; neither placement closes the extension gap, which is why authentication moves to HMAC rather than to a longer prefix.',
      },
    ],
  },
};
