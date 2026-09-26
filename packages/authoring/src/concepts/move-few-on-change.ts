/**
 * moveFewOnChange 개념 선언.
 *
 * canonical facet 은 `facet:moveFewOnChange` — 같은 키 열둘(`doc:153`..`doc:164`)이 서버 넷(`node-a`..`node-d`)에
 * 두 방식(해시 링 · 나머지 해싱)으로 놓여 있다. 걸음 1 에 `node-a` 가 두 쪽에서 함께 빠지고, 걸음 2..13 에 키를 하나씩
 * 두 쪽에서 다시 놓는다. 옮김 누계가 링 3 / 12, 나머지 9 / 12 로 끝난다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `ringOfHashes` 가 키의 주인이 정해지는 규칙을, 완제품 `roundRobinLb` 가 요청 흐름 위 방식 대비를 맡는다. 이쪽의 한
 * 질문은 **서버 하나가 빠지면 키 몇이 주인을 바꾸는가** — 링과 h mod N 을 나란히 센다. definition 은 removed ·
 * reassigned · fraction · N changes 쪽 낱말을 독점하고 clockwise walk · load · session 을 쓰지 않는다.
 *
 * 전제 (설명 글 `moveFewOnChange.md`):
 *  - 해시는 예로 고른 것 (FNV-1a 32 + fmix32), 두 쪽이 같은 해시 값을 쓴다. 링 크기 100, 윗자리 비트로 자리.
 *  - 가상 노드 없음 — 그래서 빠진 서버의 키가 모두 한 서버(`node-b`)로 간다. 실제 시스템은 여러 서버로 흩는다.
 *  - 링의 평균 옮김 K/N (12 / 4 = 3) 은 평균이다 — `node-a` 가 마침 셋을 쥐었다. 나머지는 대략 (N−1)/N.
 *  - 조각 화면에 코드가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const moveFewOnChangeConcept: FacetConceptSource = {
  id: 'moveFewOnChange',
  label: 'Keys Remapped When a Server Is Removed (Hash Ring vs Hash Mod N)',
  canonicalFacet: 'facet:moveFewOnChange',

  surface: {
    definition:
      'When one of N servers is removed, a hash ring reassigns only the keys that server held, while hash mod N changes the divisor and remaps most keys among the surviving servers too.',
    exemplarKeywords: [
      'minimal disruption',
      'rehashing when a node fails',
      'hash mod N problem',
      'cache miss storm after resizing',
      'keys remapped after scaling down',
      'K/N keys move',
      'data migration on cluster resize',
      'rebalancing a distributed cache',
      'why consistent hashing',
      'modulo sharding breaks on node change',
    ],
  },

  briefing: {
    observable: [
      'Two panels side by side hold the same twelve keys, `doc:153` to `doc:164`, on the same four servers `node-a` to `node-d`: "Hash ring" on the left, "Remainder hashing" on the right. The ring shows server positions `node-a` 23, `node-b` 39, `node-d` 45, `node-c` 93; the right panel is headed "h mod 4" with slots 0 to 3. The start caption reads "Servers: 4 · Keys: 12".',
      'At step 1 `node-a` is removed from both panels ("Removed: node-a"); the right header becomes "h mod 3" with slots 0 to 2, the surviving servers renumbered in their original order.',
      'From step 2 each key is placed again in both panels at once ("Placing again: doc:153"). The ring side shows its position ("Position: 40"), the remainder side its old and new slot ("h mod 4 = 1 → h mod 3 = 0"), and each side is marked "Stayed · node-d" or "Moved · node-a → node-b".',
      'On the ring, only the three keys `node-a` held — `doc:156`, `doc:161`, `doc:164` — move, all to `node-b`, the next server clockwise; the other nine stay. The left counter ends at "Moved: 3 / 12".',
      'On the remainder side, those three move too, and so do six keys that had nothing to do with `node-a`, such as `doc:154` going from `node-b` to `node-d`. The right counter ends at "Moved: 9 / 12".',
      'With no virtual nodes, every key the removed server held goes to a single successor. The hash is an illustrative choice (FNV-1a 32-bit with a murmur3 finalizer), shared by both panels; the ring has 100 positions. That `node-a` held exactly 3 keys matches the average K/N = 12 / 4 here only by the data.',
    ],

    screen: {
      affordances: [
        'The screen plays its fourteen steps by itself: the start, the removal, then twelve re-placements. It stops after `doc:164`.',
        'A Replay button and a playback strip sit below it. Holding step 3 shows `doc:154` staying put on the ring while it moves on the remainder side.',
        'Keys, servers and the removed server are fixed, so an article can quote every position, slot and counter exactly as it appears.',
      ],
    },

    useWhen: [
      'The article argues why consistent hashing exists and needs the count that justifies it: removing one server of four moves 3 of 12 keys on a ring against 9 of 12 with a modulo.',
      'A reader thinks only the failed server\'s keys should be affected under any hash scheme, and the article needs keys unrelated to the removed server visibly changing owner under h mod N.',
    ],

    avoidWhen: [
      'The subject is how a key finds its owner on the ring in the first place. That lookup is taken as given here.',
      'The article is about adding servers, virtual nodes or spreading the removed server\'s keys over many successors. Only one removal with one successor is shown.',
      'The topic is a single-machine hash table growing its bucket array. The divisor here shrinks because a server left, not because a table filled up.',
    ],

    contrastWith: [
      {
        concept: 'ringOfHashes',
        note: 'Owner lookup on a ring holds for a fixed set of servers; the count of reassigned keys is what that same rule yields once the set shrinks by one.',
      },
      {
        concept: 'loadFactorRehash',
        note: 'Both change the number of slots and recompute where keys go. A growing hash table accepts moving everything because it is local; across servers every moved key is a cache miss or a data transfer, which is why the ring avoids it.',
      },
      {
        concept: 'roundRobinLb',
        note: 'Reassignment is a property of the whole key space; in request routing its cost appears only when an affected user returns, and it is weighed against how evenly the servers are loaded.',
      },
    ],
  },
};
