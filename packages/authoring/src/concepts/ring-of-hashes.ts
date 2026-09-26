/**
 * ringOfHashes 개념 선언.
 *
 * canonical facet 은 `facet:ringOfHashes` — 자리 0..99 의 고리에 서버 셋(`cache-a` 90 · `cache-b` 62 · `cache-c` 4)이
 * 제 이름의 해시로 자리를 잡고, 키 여섯(`cart:*`)이 차례로 자리를 잡은 뒤 시계 방향으로 걸어 처음 만난 서버에
 * 멈춘다. `cart:eva` 는 98 에서 99 를 넘어 0 으로 감아 돌아 `cache-c` 에 닿는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `roundRobinLb` 는 링을 방식 넷 가운데 하나로 두고 짐 · 붙듦을 견준다. `moveFewOnChange` 는 서버가 빠질 때
 * 옮김을 센다. 이쪽의 한 질문은 **키 하나의 주인이 어떻게 정해지는가** — 자리를 잡고, 시계 방향으로 걸어, 처음 만난
 * 서버에 멈춘다. 그래서 definition 은 place · clockwise · first server · wrap 쪽 낱말을 쥐고 remove · move · count 를
 * 쓰지 않는다. 서버 수가 규칙에 끼지 않는다는 것까지만 말하고, 그 귀결(빠질 때)은 이웃 개념에 둔다.
 *
 * 전제 (설명 글 `ringOfHashes.md`):
 *  - 해시는 예로 고른 것 — FNV-1a 32 비트 뒤 fmix32. 자리는 윗자리 비트를 100 칸으로 줄인 값.
 *  - 실제 구현은 32 · 64 비트 전체를 고리로 쓴다. 가상 노드 없음 — 서버 하나가 한 자리.
 *  - 서버마다 맡는 호 길이(cache-c 14 · cache-b 58 · cache-a 28)는 화면이 세지 않는다. 이 데이터에서 키는 둘씩 나뉘었다.
 *  - 조각 화면에 코드가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const ringOfHashesConcept: FacetConceptSource = {
  id: 'ringOfHashes',
  label: 'Consistent Hashing Ring (Clockwise Lookup)',
  canonicalFacet: 'facet:ringOfHashes',

  surface: {
    definition:
      'In consistent hashing, servers and keys are placed on one ring by hashing their names, and each key belongs to the first server found walking clockwise from its position, wrapping past the top.',
    exemplarKeywords: [
      'consistent hashing',
      'hash ring',
      'ring lookup clockwise successor',
      'key to node mapping',
      'which node owns this key',
      'wrap around the ring',
      'Dynamo-style partitioning',
      'Cassandra token ring',
      'Memcached client ketama',
      'distributed cache key placement',
    ],
  },

  briefing: {
    observable: [
      'A ring of positions 0 to 99 starts empty ("The ring is empty. Positions: 0–99."), with three servers under "Servers" and six keys under "Keys" waiting beside it.',
      'Servers take their places first, one per step: "cache-a hashes its own name and takes position 90", then `cache-b` at 62 and `cache-c` at 4. Each chip flies from the waiting list to its position.',
      'Then each key takes its position and a dot walks clockwise from it, leaving footprints, until it meets a server; only then do the key and its footprints take the owner\'s colour. "cart:ben hashes to position 60 and walks clockwise. First server met: cache-b. Positions walked: 2."',
      '`cart:ian` lands at 24 and walks 38 positions, past no server, to `cache-b` at 62.',
      '`cart:eva` lands at 98. No server sits above it, so it walks past 99 back to 0 and stops at `cache-c` at 4 after 6 positions; the caption says "past 99 back to 0".',
      'At the end `cache-a` holds `cart:gus` and `cart:cho`, `cache-b` holds `cart:ben` and `cart:ian`, and `cache-c` holds `cart:eva` and `cart:ana`. No trail passes another server.',
      'The number of servers never enters the rule: a key looks only at its own position and the nearest server ahead of it.',
      'The hash is an illustrative choice (FNV-1a 32-bit followed by an extra mixing step); positions are its upper bits scaled to 100 slots, where real systems use the whole 32- or 64-bit range. Each server holds a single position — there are no virtual nodes.',
    ],

    screen: {
      affordances: [
        'The screen plays its ten steps by itself: the empty ring, three server placements, six key walks. It stops after `cart:ana` reaches `cache-c`.',
        'A Replay button and a playback strip sit below it. Holding the step for `cart:eva` shows the one walk that crosses from 99 to 0.',
        'The names and therefore every position are fixed, so an article can quote each caption, position and walk length exactly as it appears.',
      ],
    },

    useWhen: [
      'The article introduces consistent hashing and needs the lookup rule on its own: hash to a position, walk clockwise, stop at the first server.',
      'A reader is puzzled by what happens to a key hashed past the last server, and the article wants the wrap-around shown on a concrete key.',
      'The article wants to point out that the owner of a key does not depend on how many servers there are, before discussing what that means for adding or removing one.',
    ],

    avoidWhen: [
      'The subject is how many keys move when a server joins or leaves. No server changes here.',
      'The article is about virtual nodes or uneven arc lengths skewing load. Each server has one position and the arcs are not counted on screen.',
      'The topic is a hash table\'s bucket array or hash function internals. There is no table and no modulo; the hash only supplies a position.',
    ],

    contrastWith: [
      {
        concept: 'moveFewOnChange',
        note: 'The lookup rule decides who owns a key while the server set is fixed; what that rule implies when a server leaves — only its own keys change hands — is a consequence claimed separately.',
      },
      {
        concept: 'hashToBucket',
        note: 'A remainder maps a hash to one of a fixed count of buckets, so the count is part of every answer; a ring maps it to a position and lets the nearest server claim it, so the count is not.',
      },
      {
        concept: 'roundRobinLb',
        note: 'The ring rule is about ownership of a key; used as a request-routing policy, it keeps each user on one server but takes no account of how loaded that server is.',
      },
    ],
  },
};
