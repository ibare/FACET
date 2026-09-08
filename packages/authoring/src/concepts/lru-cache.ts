/**
 * lruCache 개념 선언.
 *
 * canonical facet 은 `facet:lruCache` — 위쪽 hash 슬롯과 아래쪽 doubly linked list 가
 * 같은 노드를 공유하는 두 영역 구조 + 호출 트레이스.
 *
 * reactive 다. 자동 시연 후 입력을 기다린다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const lruCacheConcept: FacetConceptSource = {
  id: 'lruCache',
  label: 'LRU Cache',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:lruCache',

  surface: {
    definition:
      'A fixed-capacity key-value cache that evicts the least recently used entry when full, keeping a hash map for lookup and a linked list for recency.',
    exemplarKeywords: [
      'LRU cache',
      'least recently used',
      'cache eviction policy',
      'capacity bound cache',
      'hash map plus doubly linked list',
      'MRU end',
      'get and put in constant time',
      'memory cache',
      'LeetCode 146',
      'cache hit and miss',
    ],
  },

  briefing: {
    observable: [
      'Two areas share one set of nodes — hash slots on top for lookup, a doubly linked list below for order of use — and every call updates both at the same instant.',
      'A get is not a read: the node it touches is dragged to the MRU end, so the list rotates on an operation that looks like it should leave things alone.',
      'A miss leaves the list untouched and marks the absent key, which is the visible difference between a hit and a miss.',
      'When the cache is full, a new key makes the node at the LRU end vanish from both areas together — the eviction happens twice at once, and that simultaneity is the reason both structures are needed.',
      'The two ends are labelled: the LRU end is what has gone longest unseen, the MRU end is what was just touched.',
      'A call trace accumulates below, so the sequence that led to the current state stays readable instead of only the present.',
      'Five counters run along: gets, puts, hits, misses, evictions.',
    ],

    screen: {
      affordances: [
        'The reader drives this facet. It demonstrates a short sequence on mount, then stops and waits.',
        'The controls are key and value fields plus Get, Put and Reset. Only short alphanumeric keys are accepted.',
        'The move that makes the idea land is getting an old key: point the reader at the node climbing to the MRU end and ask what would have been evicted otherwise.',
      ],
    },

    useWhen: [
      'The article is about why a cache needs to know recency at all. Driving lookups and watching the untouched entry drift toward eviction is the argument.',
      'The reader should see why one structure is not enough — the map answers "is it here" and the list answers "who goes first", and both are needed at once.',
    ],


    avoidWhen: [
      'The article is about a different eviction policy (LFU, FIFO, random). The recency order shown here is exactly what those replace.',
      'The subject is a CDN or distributed cache. Those are about placement across machines; this is one cache\'s internal bookkeeping.',
      'The point is cache coherence or write-through versus write-back. Nothing on this screen represents a backing store.',
    ],

    contrastWith: [
      {
        concept: 'linkedListSingly',
        note: 'The list here is doubly linked precisely so a node can be unhooked from the middle in constant time — the single finger of a singly linked list would force a walk.',
      },
      {
        concept: 'hashTableChaining',
        note: 'The hash map is the lookup half of this structure; on its own it can find a key but has nothing to say about which key to discard.',
      },
      {
        concept: 'cachingCdn',
        note: 'Same word, different scale: this is one cache deciding what to keep, a CDN is many caches deciding where an answer lives.',
      },
    ],
  },
};
