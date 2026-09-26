/**
 * serveFromNear 개념 선언.
 *
 * canonical facet 은 `facet:serveFromNear` — 엣지 셋(`icn` 서울 · `fra` 프랑크푸르트 · `gru` 상파울루)과 오리진
 * `iad`(버지니아). 서울 · 도쿄 · 베를린 · 리마의 사용자가 차례로 요청하고, 각 요청은 왕복 ms 가 가장 작은 엣지에서
 * 돌아선다. 엣지 합 122 ms · 오리진이었다면 565 ms · 오리진 요청 0. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `cachingCdn` 은 엣지 · 지역 · 오리진 계층을 요청하고 데우고 비우는 전체다. 형제 `originPull` 은 비어 있는
 * 엣지 하나에 겹친 요청이 오리진을 몇 번 부르는가(시간). 이쪽은 **엣지가 이미 들고 있을 때 어디서 내어 주는가 —
 * 거리가 곧 시간이다** 한 장면이다. definition 은 round trip · milliseconds · geographically distant ·
 * lowest round trip 을 쥐고, miss · fetch · warm · tier 를 쓰지 않는다.
 *
 * 전제 (설명 글 `serveFromNear.md`):
 *  - ms 는 예로 정한 어림값이다. 콘텐츠 크기 · 전송 시간은 셈하지 않는다 — 요청 시간 = 고른 엣지까지의 왕복 하나.
 *  - 실제 CDN 은 DNS · 애니캐스트로 사용자를 보낸다 — 여기서는 "왕복이 가장 짧은 엣지" 로 대신한다.
 *  - 엣지는 처음부터 콘텐츠를 들고 있다(오리진에서 끌어오는 일은 없다). 화면에 코드가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const serveFromNearConcept: FacetConceptSource = {
  id: 'serveFromNear',
  label: 'Serving From the Closest Edge (CDN Round Trips)',
  canonicalFacet: 'facet:serveFromNear',

  surface: {
    definition:
      'A CDN answers each user from the edge location with the lowest round-trip time, so users geographically distant from the origin server get content in far fewer milliseconds and the origin receives no requests.',
    exemplarKeywords: [
      'CDN latency',
      'edge location',
      'point of presence',
      'PoP',
      'round-trip time',
      'RTT',
      'why a CDN is faster',
      'geographic distance and latency',
      'serve users from the nearest server',
      'Cloudflare',
      'CloudFront',
      'Akamai',
    ],
  },

  briefing: {
    observable: [
      'Three edges — `icn` Seoul, `fra` Frankfurt, `gru` São Paulo — and one origin, `iad` Virginia, each with a count of requests served, all 0 at the start. All three edges already hold the content.',
      'Four users, Seoul, Tokyo, Berlin and Lima, each get a row whose horizontal length is the round trip in ms to every site. A dashed line is the long road to the origin, labelled with its ms (190, 160, 95, 120).',
      'On its step each user\'s request goes only to the closest edge and turns back; the walked path stays as a thick line and the caption compares the two: "Seoul → icn: 5 ms · Via origin: 190 ms · Saved: 185 ms".',
      'Tokyo has no edge of its own but still goes to `icn` in 35 ms, against 160 ms to the origin. Berlin takes `fra` in 12 ms (95), Lima takes `gru` in 70 ms (120).',
      'Running totals read "Edge total" and "Via origin": they end at 122 ms against 565 ms. The origin\'s count stays at 0 for the whole run; the edges end at `icn` 2, `fra` 1, `gru` 1.',
      'The ms figures are example estimates and a request\'s time is one round trip to the chosen edge, ignoring content size and transfer time. Real CDNs steer users with DNS or anycast; here the lowest round trip stands in for that. The screen does not footnote these and has no code.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one user request per step, five steps including the start, and stops.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to step 2 holds Tokyo\'s request going to the Seoul edge while its dashed road to Virginia stays unwalked.',
        'The latency table and edge set are fixed, so each saving can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains why a CDN makes a site fast for users on another continent, and needs the distance to the origin set against the distance to a nearby edge, request by request.',
      'A reader thinks a CDN needs an edge in every user\'s city; the Tokyo request served from Seoul shows that the closest edge only has to be closer than the origin.',
    ],

    avoidWhen: [
      'The article is about what happens when an edge does not have the content yet, cache misses, or fetching from the origin. These edges always hold it.',
      'The subject is DNS resolution, anycast routing or load balancing among edges. The edge choice is reduced to the lowest round trip and not explained.',
      'The point is bandwidth, file size or transfer throughput. Only round-trip time is counted.',
    ],

    contrastWith: [
      {
        concept: 'cachingCdn',
        note: 'A CDN as a whole combines placement with filling, tiers and purging; the claim here is only that a request answered close by is answered sooner, and the origin sees none of it.',
      },
      {
        concept: 'originPull',
        note: 'Serving close by assumes the edge already holds the content; how an empty edge gets it, and how often it bothers the origin to do so, is the complementary question.',
      },
      {
        concept: 'cacheHitMiss',
        note: 'Both cut time by answering before the slow source is reached; a hit saves a trip to a database within one site, an edge saves a trip across continents.',
      },
    ],
  },
};
