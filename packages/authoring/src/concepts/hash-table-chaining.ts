/**
 * hashTableChaining 개념 선언.
 *
 * canonical facet 은 `facet:hashTableChaining` — 슬롯 배열 + 함수 박스 + 적재율 게이지 +
 * 분포 표시 + 보조 비교 패널(분리 체이닝 vs 선형 탐사).
 *
 * reactive 다. mount 직후 7개 키를 넣는 자동 시연(충돌 1회 포함) 후 입력을 기다린다.
 *
 * 변별어를 붙인 이유: 개방주소법 해시 테이블이 "hash table" 을 자칭한다 (C4 명명 규칙 2).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const hashTableChainingConcept: FacetConceptSource = {
  id: 'hashTableChaining',
  label: 'Hash Table (Separate Chaining)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:hashTableChaining',

  surface: {
    definition:
      'A key-value store where a hash function computes each key\'s slot directly, and keys landing on the same slot are held together in a chain.',
    exemplarKeywords: [
      'hash table',
      'hash map',
      'dictionary',
      'hash function',
      'collision',
      'separate chaining',
      'load factor',
      'rehashing',
      'constant time lookup on average',
      'bucket',
    ],
  },

  briefing: {
    observable: [
      'A function box takes each key and points at exactly one slot — the jump is a single motion, not a search, and that is the whole reason lookup is cheap.',
      'When two keys land on the same slot, a chain grows downward from it. A collision is shown as ordinary operation rather than as failure.',
      'A lookup is one jump plus a walk along that slot\'s chain, and the walk length is reported — this separates the constant part of the cost from the part that depends on collisions.',
      'A load factor gauge tracks how crowded the table is, and warns before it becomes a problem rather than after.',
      'A distribution readout counts how many slots are empty and how many hold chains of length 1, 2, or 3 and more — the shape of the spread, not just its average.',
      'When the table gets too crowded it grows and every key is thrown again, and the rehash is animated as a migration with the old table kept beside the new one for comparison.',
      'A side panel contrasts separate chaining with linear probing — one hangs a chain downward, the other squeezes sideways into the next free slot.',
      'Six counters run along: inserts, collisions, searches, removes, chain steps walked, rehashes.',
    ],

    screen: {
      affordances: [
        'The reader drives this facet. It demonstrates seven insertions on mount, one of which collides, then stops and waits.',
        'The controls are one key field plus Insert, Search, Remove and Reset. Only integer keys are accepted.',
        'The way to make collisions land is to keep inserting — the load factor gauge climbing toward the warning is the invitation to talk about rehashing.',
      ],
    },

    avoidWhen: [
      'The article is about open addressing (linear probing, quadratic probing, double hashing). Those are named in the side panel for contrast but never animated here.',
      'The subject is a cryptographic hash. The function box here exists to spread keys across slots, and nothing on screen speaks to collision resistance.',
      'The point is ordered iteration or range queries. This structure has no order to show.',
    ],

    contrastWith: [
      {
        concept: 'bst',
        note: 'A computed address versus ordered comparison. A hash table jumps straight to the slot; a BST halves its way there but keeps an ordering the hash table cannot offer.',
      },
      {
        concept: 'array',
        note: 'The slots are an array underneath — a hash table is the idea of computing the index instead of being given it.',
      },
    ],
  },
};
