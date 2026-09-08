/**
 * openAddressingProbe 개념 선언.
 *
 * canonical facet 은 `facet:openAddressingProbe` — "제 자리가 차 있으면 키는
 * 어디에 앉는가" 한 질문에만 답하고 멈추는 짧은 화면이다. 표 밖으로 나가지 않고
 * 한 칸씩 옆으로 밀려가 빈 자리에 앉으며, 그 대가로 앉은 자리가 제 자리가 아닌
 * 키가 생긴다.
 *
 * 네 키를 스스로 넣고, 남의 충돌에 밀려난 자리를 마지막에 짚은 뒤 멈춘다.
 * 독자가 키를 넣는 자리는 없고, 다시 보기와 한 걸음씩 짚기만 기다린다.
 *
 * 변별어를 붙인 이유: `openAddressing` 만으로는 선형 탐사 · 이차 탐사 · 이중 해싱을
 * 다 자칭한다. 이 화면이 보이는 것은 한 칸씩 걸어가는 탐사 하나이므로 그 동작
 * (probe)을 id 에 넣었다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const openAddressingProbeConcept: FacetConceptSource = {
  id: 'openAddressingProbe',
  label: 'Open Addressing: Probing for a Free Bucket',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:openAddressingProbe',

  surface: {
    definition:
      'Open addressing resolves a collision inside the table itself: a key whose bucket is occupied moves to the next bucket in sequence until an empty one is found.',
    exemplarKeywords: [
      'open addressing',
      'linear probing',
      'probe sequence',
      'primary clustering',
      'no chains',
      'next free slot',
      'home bucket',
      'closed hashing',
      'probing hash table',
    ],
  },

  briefing: {
    observable: [
      'A line at the top spells out the arithmetic for the key being placed — the key, its raw hash value, and the masked remainder that names its home bucket.',
      'The key lands above its home bucket. If that bucket is occupied the occupant flashes and the key slides one bucket to the right, leaving a dotted trail behind it across the buckets it passed.',
      'When it reaches an empty bucket it drops into the table and its name is written inside the cell, and a caret marks where its home was even after it has left.',
      'Every key that did not stay at home leaves an arc drawn beneath the table spanning the distance between its home bucket and the bucket it actually sits in.',
      'The last step singles out one key whose home was taken by a key that had itself been pushed there, naming the blocker — one collision has spread to a key that was not part of it — and then a frame closes around the whole table to say that every key found a place inside it.',
    ],

    screen: {
      affordances: [
        'Four insertions play through on their own, followed by the note about the displaced key, and then the screen stops.',
        'Two buttons: Replay, and Step. Step clears the table and advances one moment per press, which is what makes the order of insertion legible — a different order produces different seats.',
        'The keys and their hash values are fixed; the bucket for each one is derived from the hash rather than written down, so the walk on screen is the walk the arithmetic forces.',
      ],
    },

    useWhen: [
      'The reader believes a stored key can be found at the bucket its hash names, and this method quietly breaks that. A key pushed along by a collision between two other keys is what makes the break visible instead of asserted.',
      'The article needs the reader to accept that a search cannot inspect the home bucket alone and declare a key missing — the sideways walk taken while inserting is exactly what a search has to repeat.',
    ],

    avoidWhen: [
      'The subject is a cryptographic hash and how hard collisions are to produce. A collision here is two keys wanting the same bucket, which the table simply absorbs.',
      'The article is about separate chaining or bucket lists. Nothing is ever attached outside the table here; every key sits in a cell of the table itself.',
      'The point is a probe sequence other than stepping one bucket to the right — quadratic probing, double hashing, Robin Hood displacement. Only the one-step walk is played.',
      'The article is about deletion from a probed table and needs tombstones or backward shifting shown. Only insertions and the walk they take are on screen.',
    ],

    contrastWith: [
      {
        concept: 'chainingBucket',
        note: 'Two answers to the same collision: one keeps a displaced key attached to the bucket it belongs to, the other moves it to a bucket that belongs to somebody else.',
      },
      {
        concept: 'hashToBucket',
        note: 'One computes the bucket a key belongs to; this one is about what has to happen when that computed bucket is already taken.',
      },
      {
        concept: 'loadFactorRehash',
        note: 'The walk shown here lengthens as the table fills, and load factor is the number that decides when a table stops tolerating that and grows.',
      },
    ],
  },
};
