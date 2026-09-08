/**
 * chainingBucket 개념 선언.
 *
 * canonical facet 은 `facet:chainingBucket` — "같은 자리에 둘 이상이 오면 어떻게
 * 되는가" 한 질문에만 답하고 멈추는 짧은 화면이다. 자리마다 아래로 사슬이 자라고,
 * 뒤에 온 키가 그 끝에 걸리며, 찾을 때는 그 사슬 하나만 훑는다.
 *
 * 다섯 키를 스스로 넣고 하나를 찾아 보인 뒤 멈춘다. 독자가 키를 넣거나 값을
 * 고르는 자리는 없고, 다시 보기와 한 걸음씩 짚기만 기다린다.
 *
 * 변별어를 붙인 이유: "chaining" 은 연결 리스트 · 마르코프 연쇄 · 해시 체인 등
 * 여러 것을 자칭한다. 이 개념이 말하는 것은 버킷 하나에 달린 사슬이므로
 * 도착지(bucket)를 id 에 넣어 자리를 좁혔다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const chainingBucketConcept: FacetConceptSource = {
  id: 'chainingBucket',
  label: 'Chaining onto an Occupied Bucket',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:chainingBucket',

  surface: {
    definition:
      'Separate chaining resolves a collision by keeping every key that hashes to one bucket in a list attached to that bucket, so a lookup walks only that list.',
    exemplarKeywords: [
      'separate chaining',
      'collision resolution',
      'bucket list',
      'linked bucket',
      'hash map collision',
      'chain length',
      'two keys same bucket',
      'lookup walks the chain',
      'HashMap buckets',
    ],
  },

  briefing: {
    observable: [
      'Eight numbered buckets sit in a row, each with a short hook underneath, and keys travel in from the left along a lane above them before dropping.',
      'Three of the five keys hash to the same bucket. The second and third descend beside the ones already hanging and hook onto the bottom of the chain, and the earlier ones do not shift by a pixel.',
      'Every hung node carries the key name with its raw hash value printed beneath it, so where it hangs can be checked against the number that put it there.',
      'The search token flies in an arc that passes over the other buckets without touching them and lands on one bucket, whose outline lights up.',
      'It then steps down that chain link by link, marking each mismatch as it passes and highlighting the match, and the closing line reports three comparisons in a table that holds five keys.',
    ],

    screen: {
      affordances: [
        'Ten moments play by themselves — five insertions and then one search — and the screen stops when the search succeeds.',
        'Two buttons: Replay, and Step. Step empties the board and re-runs the same ten moments one press at a time, which is how the order of the insertions can be tied to the shape of the chain.',
        'The keys, their hash values and the bucket count are fixed, and the buckets come from those hashes rather than from arrangement, so the collision on screen is a real one.',
      ],
    },

    useWhen: [
      'The prose says a collision is handled by keeping both keys, and the reader pictures the earlier one being overwritten or pushed aside. The first key not moving at all while the second hooks below it settles which of the two happens.',
      'The article is about to say that cost depends on how many keys share one bucket rather than on how many the table holds. A search that skips every other bucket and walks only the links under one of them is where that distinction gets made.',
    ],

    avoidWhen: [
      'The subject is a cryptographic hash and its collision resistance. A collision here means two keys sharing a bucket in a lookup structure, which is an ordinary event rather than a weakness.',
      'The article is about open addressing — linear probing, quadratic probing, double hashing. No key ever moves to a different bucket here.',
      'The point is resizing: load factor thresholds, growing the table, recomputing positions. The bucket count is fixed for the whole run.',
      'The article needs ordered iteration, sorted output or range queries. There is no ordering across buckets to point at.',
    ],

    contrastWith: [
      {
        concept: 'openAddressingProbe',
        note: 'Two answers to the same collision: one keeps the newcomer attached to the bucket it belongs to, the other sends it to a different bucket inside the table.',
      },
      {
        concept: 'pigeonholeCollision',
        note: 'One argues that collisions cannot be avoided at all; this one takes that as given and shows what a table does the moment one occurs.',
      },
      {
        concept: 'linkedListSingly',
        note: 'The structure hanging from a bucket is a list of links, but its length is governed by how keys distribute rather than by anything the list itself does.',
      },
    ],
  },
};
