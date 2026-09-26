/**
 * internalStateCarries 개념 선언.
 *
 * canonical facet 은 `facet:internalStateCarries` — 위 줄은 M `SUN` 을 가진 쪽이 IV 에서 접어 D = af87 을 얻고,
 * D 하나(와 M 의 길이)만 벽을 건너 가운데 줄이 그 D 에서 `DAY` 를 이어 접어 D′ = 4344. 아래 줄은 이은 전체를
 * 처음부터 통째로 접어 같은 4344 에 닿는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 형제 `compressBlockByBlock` 은 메시지 하나를 IV 에서 끝까지 흡수하는 것, 완제품 `sha` 는 그 성질이 열쇠 방식마다
 * 어떤 판정을 낳는가다. 이쪽은 **끝 값이 곧 다음 접기의 출발점 — 메시지 없이 이어 접어도 통째 셈과 같다** 하나다.
 * 그래서 definition 은 resume · without the original message · equals hashing the whole 을 독점하고,
 * 열쇠 · 표 · 받아들임 · 패딩 규칙 설명을 쓰지 않는다. 공격 이름(length extension)은 exemplarKeywords 에만 둔다.
 *
 * 전제 (설명 글 `internalStateCarries.md`): 장난감 해시(상태 16 비트 · 덩어리 2 바이트 · 세 라운드 · IV 6a09).
 * 끝 상태가 곧 해시값이라는 것은 실물(SHA-256)과 같다. `SUN` · `DAY` 는 예로 정한 값. 화면은 공격을 보이지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const internalStateCarriesConcept: FacetConceptSource = {
  id: 'internalStateCarries',
  label: 'A Hash Value Is a Resumable State',
  canonicalFacet: 'facet:internalStateCarries',

  surface: {
    definition:
      'In a Merkle–Damgård hash the digest is the full internal state, so someone holding only the digest and the original length can continue hashing more data and obtain exactly what hashing everything from scratch would give.',
    exemplarKeywords: [
      'length extension',
      'SHA-256 length extension property',
      'digest equals internal state',
      'resume hashing from a digest',
      'chaining value',
      'why SHA-256 is extendable',
      'appending to a hashed message',
      'glue padding',
      'SHA-512/256 truncation',
    ],
  },

  briefing: {
    observable: [
      'Three rows. The top row, "Holder — has M", takes M = `SUN` (3 bytes), pads it to blocks 5355, 4e80, 0018 and folds from IV 6a09: 6a09 → 9362 → ba49 → af87. "Hash value D = af87."',
      'Only D crosses a wall to the middle row, together with the length of M: "Only D = af87 crosses, with the length of M. Bytes: 3. The letters stay." The middle row, "Extender — gets only D", knows the front only as `? ? ? 80 00 18`.',
      'The extender folds `DAY` on from D, one block per step, with padding for the combined 9-byte length: af87 → 06b2 → c1e3 → 4344, "Extended end D′ = 4344."',
      'The bottom row, "Whole line, folded from scratch", folds all twelve bytes `SUN 80 00 18 DAY 80 00 48` from IV: 6a09 → 9362 → ba49 → af87 → 06b2 → c1e3 → 4344. Its first four states match the top row and its last four match the middle row, value for value, and the caption ends "End 4344 = D′ 4344".',
      'The run is seven steps including the start: start, fold M, D crosses, three extension folds, fold from scratch.',
      'The hash is a reduced model of SHA-256 (16-bit state, 2-byte blocks, three rounds, IV 6a09); the property shown — the final state is output unchanged as the digest — is the same as in SHA-256. No key, tag or verifier appears; the screen stops at the property an attack would rely on. `SUN` and `DAY` are example values. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays its seven steps on its own and stops once the from-scratch row reaches the same end value.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging the strip to the step where D crosses isolates the moment the letters stay behind and only four hex digits go over.',
        'Every message, block and state is fixed, so an article can quote the numbers exactly.',
      ],
    },

    useWhen: [
      'The article is about to explain length extension and first has to convince the reader that a hash value is not a sealed endpoint but a place to keep going from.',
      'A reader doubts that someone who never saw the original message could produce the hash of a longer one; the extended row and the from-scratch row finishing on the same value settles it.',
    ],

    avoidWhen: [
      'The article is about how a message is cut and padded into blocks in the first place. Padding appears here but is not the subject.',
      'The subject is HMAC or why a keyed hash resists extension. No key enters any row.',
      'The point is hash chains or blockchains linking records by stored digests. The continuation here happens inside one hash computation.',
      'The article concerns SHA-3 or other sponge hashes, which do not output their full state and do not behave this way.',
    ],

    contrastWith: [
      {
        concept: 'compressBlockByBlock',
        note: 'Absorbing blocks until the digest appears treats the digest as the end. Carrying treats that same value as a starting point anyone can pick up without the message.',
      },
      {
        concept: 'hashTwiceWithPads',
        note: 'A resumable digest is the weakness; hashing the inner result again under an outer key is the construction that keeps the published value from being a state one can resume.',
      },
      {
        concept: 'sha',
        note: 'Resumability is a neutral property of the hash. Whether it lets a forged tag through depends on how a key is combined with the message, which is a question about authentication schemes.',
      },
      {
        concept: 'hashChain',
        note: 'Both feed a previous digest forward. In a chain each record stores the prior digest as data; here the digest is the literal internal state of an unfinished computation.',
      },
    ],
  },
};
