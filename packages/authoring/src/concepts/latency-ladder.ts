/**
 * latencyLadder 개념 선언.
 *
 * canonical facet 은 `facet:latencyLadder` — 못 찾을 때마다 한 층씩 내려가는 조각.
 * 층은 넷(L1 4 · L2 12 · L3 40 · DRAM 200 사이클)인데 처음과 끝이 쉰 배다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 형제 넷이 전부 "얼마나 자주 내려가는가" 를 다루는 데 견주어 이 개념만 "한 번
 * 내려가면 얼마인가" 를 다룬다. definition 의 주어를 **값(비용 구조)** 으로 세우고,
 * 미스율 · 줄 크기 · 접근 순서 어휘를 일절 넣지 않았다. 그래야 "캐시 미스가 비싸다"
 * 는 글이 이쪽으로, "미스가 몇 번 나는가" 를 따지는 글이 형제 쪽으로 갈린다.
 *
 * ── 수치의 성격
 *
 * 사이클 수는 특정 기계의 실측이 아니라 **문헌 대표값**이고, 나노초는 한 사이클을
 * 0.3ns(3.3GHz 언저리)로 잡아 환산한 것이다. 그 전제는 `description.ts` 에 있다.
 * writer 가 이 수를 어느 CPU 의 사양처럼 인용하면 안 되므로 avoidWhen 첫 줄에
 * 못박아 둔다 — 화면만 보아서는 도출되지 않는 정보라 그 필드의 몫이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const latencyLadderConcept: FacetConceptSource = {
  id: 'latencyLadder',
  label: 'Latency Ladder (What Each Floor Down Costs)',
  canonicalFacet: 'facet:latencyLadder',

  surface: {
    definition:
      'The cost structure of the memory hierarchy: each level further from the core answers in several times the cycles of the level above it, and the multipliers grow toward the bottom rather than staying even.',
    exemplarKeywords: [
      'memory hierarchy',
      'L1 L2 L3 and main memory',
      'how expensive is a cache miss',
      'cycles to reach DRAM',
      'latency numbers every programmer should know',
      'orders of magnitude slower',
      'cycles versus nanoseconds',
      'the memory wall',
      'going all the way to main memory',
      'each level down costs multiples',
      'why a miss hurts so much',
    ],
  },

  briefing: {
    observable: [
      'All four landings are placed on one plain scale of cycles, so the top three crowd together near the ceiling while the last drop takes most of the height — the crowding is the measurement rather than a fault in the drawing.',
      'The marker falls at a constant speed throughout, which makes the time each descent takes stand for the distance covered; the final fall to main memory visibly takes far longer to watch than the three above it put together.',
      'Each landing, as it is reached, reveals its figures: the multiplier against the floor directly above, the cycle count, and a nanosecond equivalent.',
      'The multipliers are not equal — roughly three, then three and a third, then five — so the staircase is seen to steepen as it descends.',
      'A dashed trail is left along each fall, so the distances already covered stay on screen to be compared with the one being covered now.',
      'When the bottom is reached, a bracket runs down the left side from the first landing to the last and reports the span between them as a single figure of fifty times.',
      'The floors are named as L1, L2 and L3 caches and main memory, and captions narrate the search asking the nearest floor first and moving one floor down at each failure.',
      'A datum line for the core sits at the top, so even the first landing is a measured distance from it rather than a starting point at zero.',
    ],

    screen: {
      affordances: [
        'The screen runs the search from the nearest floor down to main memory and closes with the span on its own, then stops.',
        'Under it sit a Replay button and a playback strip. Once the span is shown, dragging the handle back to just before main memory is how a reader can return to the last fall and feel its length.',
        'The four floors and their cycle counts are fixed, so an article can quote a specific rung and its multiplier.',
      ],
    },

    useWhen: [
      'The article calls a cache miss expensive and the reader has no scale to hang that on. One undistorted axis, with the top three floors squeezed into a sliver, supplies the scale in the body of the picture rather than in a table.',
      'The prose needs the steps to be uneven: a reader who pictures a regular staircase reads "one more floor down" as a small concession, when the last step alone outweighs everything above it.',
      'The reader should come away with a ratio rather than a number — the claim that survives a change of clock speed is the fifty, not the nanoseconds.',
      'The article has established how often a program goes to memory and now needs the other factor, the price of going, before the frequency can mean anything.',
    ],

    avoidWhen: [
      'The article wants the latency of a particular processor. These are representative figures of the kind that circulate in the literature, not a measurement of any one machine, and the nanoseconds follow from taking a cycle as 0.3 ns; real values shift with generation, vendor and access pattern, so they support an argument about orders of magnitude and not a specification.',
      'The subject is how often a lookup ends on the upper floors rather than the lower ones — hit rate, miss rate, or the fraction of accesses that get away cheaply. A single access is walked all the way down here.',
      'The article is about storage below main memory — an SSD, a spinning disk, or a network round trip. The ladder stops at DRAM.',
      'The subject is how much data can be moved per second. What is measured here is the delay of one lookup, which is a different quantity and can move in the opposite direction.',
      'The article is about how much each level holds. The ladder measures time, not capacity.',
      'The subject is memory attached to another socket or node, or the differing costs of reaching it.',
      'The point is the latency a user perceives across a network, or the geography of a CDN. The ladder here spans millimetres.',
      'The article is about a processor hiding these delays — out-of-order execution, pipelining, or speculation. The descent here is drawn as time a single access simply waits.',
      'The subject is which block to fetch or discard on arriving at a floor.',
    ],

    contrastWith: [
      {
        concept: 'cacheLine',
        note: 'This prices a single trip to memory; that one is about how often the trip gets taken, and the two multiply together to give anything a reader can act on.',
      },
      {
        concept: 'temporalLocality',
        note: 'That one counts the descents that reuse manages to avoid; this one supplies the magnitude that makes avoiding them worth the effort.',
      },
      {
        concept: 'lineFill',
        note: 'Two halves of a single miss: that one is what gets carried back, this one is how far it had to be carried.',
      },
      {
        concept: 'cachingCdn',
        note: 'The same staircase at an utterly different scale — a request unanswered nearby goes to a further tier in both, but there the tiers are machines apart and counted in milliseconds, here they are millimetres apart and counted in cycles.',
      },
    ],
  },
};
