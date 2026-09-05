/**
 * cachingCdn 개념 선언.
 *
 * canonical facet 은 `facet:cachingCdn` — 세계 지도 위 엣지 캐시 + 오리진 부하 게이지 +
 * 계층 왕복 애니메이션.
 *
 * reactive 다. 자동 시연 버튼이 따로 있어 관람과 조작을 둘 다 지원한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const cachingCdnConcept: FacetConceptSource = {
  id: 'cachingCdn',
  label: 'CDN (Edge Caching)',
  domain: 'system-design',
  canonicalFacet: 'facet:cachingCdn',

  surface: {
    definition:
      'A network of caches placed near clients that serves what it already holds and otherwise fetches from an upstream tier, keeping a copy on the way back.',
    exemplarKeywords: [
      'CDN',
      'content delivery network',
      'edge cache',
      'cache hit and miss',
      'origin server',
      'regional cache tier',
      'latency and geography',
      'cache invalidation and purge',
      'origin offload',
      'static asset delivery',
    ],
  },

  briefing: {
    observable: [
      'A hit is one short arc from client to edge and back. A miss is a long trip up the hierarchy, and the difference in arc length is the difference in latency made visual.',
      'On the way back from a miss, the edge is filled — so the same request a second time draws the short arc instead. Warming is shown as consequence, not as a separate concept.',
      'Some misses stop at the regional tier without reaching the origin, which is the reason a middle tier exists at all.',
      'An origin load gauge tracks the last thirty requests, so the offload effect appears as a falling number as edges warm up.',
      'Purging an edge turns it grey again, and the next request to it travels the full hierarchy — invalidation is a visible undo of the warming.',
      'The map starts entirely grey, so the cold-start state is where every run begins.',
      'Four counters run along: requests, hits, misses, origin fetches.',
    ],

    screen: {
      affordances: [
        'The reader can both watch and drive: an auto-demo button plays a sequence, and content and edge fields let them request anything by hand.',
        'The move that makes the idea land is requesting the same content twice at the same edge — miss then hit, long arc then short.',
        'The origin load gauge is the place to point when the article argues about why a CDN saves the origin rather than only the user.',
      ],
    },

    avoidWhen: [
      'The article is about an eviction policy — which entry a cache discards when full. This screen shows placement across a hierarchy and never fills an edge to capacity.',
      'The subject is DNS resolution or anycast routing. Those decide which edge a client reaches, and that choice is assumed here rather than shown.',
      'The point is cache coherence between writers. Everything here flows one way, from origin outward.',
    ],

    contrastWith: [
      {
        concept: 'lruCache',
        note: 'Same word, different scale: an LRU cache decides what one cache keeps, a CDN decides where in the world an answer lives.',
      },
      {
        concept: 'ipRouting',
        note: 'Both are hop-by-hop journeys, but a packet asks which way to go next while a CDN request asks who already has the answer.',
      },
    ],
  },
};
