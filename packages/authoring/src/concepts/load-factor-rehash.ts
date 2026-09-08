/**
 * loadFactorRehash 개념 선언.
 *
 * canonical facet 은 `facet:loadFactorRehash` — "판을 넓히면 담긴 것들의 자리는
 * 어떻게 되는가" 한 질문에만 답하고 멈추는 짧은 화면이다. 적재율 막대가 임계에
 * 닿고, 판이 두 배로 펼쳐지고, 여섯 키가 새 버킷 수로 다시 셈해진다.
 *
 * 아홉 걸음을 스스로 재생하고 멈춘다. 독자가 키를 넣거나 임계를 조절하는 자리는
 * 없고, 다시 보기와 한 걸음씩 짚기만 기다린다.
 *
 * 변별어를 붙인 이유: 적재율만 말하면 "얼마나 찼는가" 라는 수 하나로 읽히고,
 * 재해싱만 말하면 해시 체인 쪽 어휘와 섞인다. 이 개념이 말하는 것은 그 수가
 * 임계에 닿아 자리가 전부 다시 셈해지는 한 사건이므로 둘을 붙여 id 로 삼았다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const loadFactorRehashConcept: FacetConceptSource = {
  id: 'loadFactorRehash',
  label: 'Load Factor and Rehashing',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:loadFactorRehash',

  surface: {
    definition:
      'Load factor is the ratio of stored keys to buckets; when it crosses a threshold the table is enlarged and every stored key has its bucket index computed again.',
    exemplarKeywords: [
      'load factor',
      'rehashing',
      'resize the hash table',
      'threshold 0.75',
      'double the bucket count',
      'amortized cost of insertion',
      'initial capacity',
      'why insertion is O(1) on average',
      'table too full',
    ],
  },

  briefing: {
    observable: [
      'A bar across the top reads the fill as a fraction and a decimal, with a tick fixed at the threshold, and it starts partway short of that tick with five keys in eight buckets.',
      'A sixth key drops from above into its bucket, the reading moves to six of eight, and the bar reaches the tick and changes colour there.',
      'A second row of eight cells unfolds downward beneath the first, numbered eight through fifteen, and the same six keys now read as a much smaller fraction of the enlarged table.',
      'Each key is then lifted and set down again with a line of arithmetic showing it divided by the new bucket count — every key stays in its column and only its row can change, because the board is folded so that the column is the old remainder and the row is the one bit the larger divisor adds.',
      'Three keys come down in a different bucket and three come down where they already were, and the closing line reports that split as a coincidence of the recomputation rather than as anything the table chose.',
    ],

    screen: {
      affordances: [
        'Nine moments play through unattended — one insertion, the growth, six recomputations — and the screen stops on the tally.',
        'Two buttons: Replay, and Step. Step returns the table to five keys in eight buckets and moves one moment per press, which is how each division can be read off before the next key is lifted.',
        'The keys, their hash values, the threshold and both bucket counts are fixed, and every bucket shown is the result of dividing rather than a value written in, so the arithmetic on screen can be repeated by hand.',
      ],
    },

    useWhen: [
      'The prose says the table grows when it fills up, and the reader hears that as the entries being moved into a longer array. Every key being divided again by the new bucket count, some landing elsewhere and some staying by coincidence, is what corrects it.',
      'The reader needs to see what actually triggers a growth — a ratio crossing a fixed mark, not the table running out of room — before the article can argue about sizing a map up front or choosing a threshold.',
    ],

    avoidWhen: [
      'The subject is a cryptographic hash, where rehashing means running a digest again over a value. Nothing here produces a digest; the only computation shown is a division by the bucket count.',
      'The article is about collision handling — chains, probing, what happens when two keys want one bucket. The six keys here are chosen so that no two ever share a bucket.',
      'The point is a growable array or list running out of capacity. Elements keep their positions in that case, which is the one thing this screen exists to rule out.',
      'The article is about tuning a particular map implementation — treeified buckets, concurrency, custom hash mixing. Only the ratio, the threshold and the recomputation are shown.',
    ],

    contrastWith: [
      {
        concept: 'growAndCopy',
        note: 'Both grow by allocating something larger, but an array copies its elements to the same relative positions, while here a position cannot be carried over because it was derived from the count that just changed.',
      },
      {
        concept: 'hashToBucket',
        note: 'The same division that assigns a bucket, seen from the other side: what happens to keys already placed when the divisor changes underneath them.',
      },
      {
        concept: 'hashTableChaining',
        note: 'One is the whole structure with its collisions and lookups; this isolates the single event where the structure stops and rebuilds its own index.',
      },
    ],
  },
};
