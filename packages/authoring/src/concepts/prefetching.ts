/**
 * prefetching 개념 선언.
 *
 * canonical facet 은 `facet:prefetching` — 원소 서른둘(줄 여덟)을 앞에서부터 쓰는데 줄
 * 하나가 메모리에서 오는 데 8 박자, 캐시는 네 줄이다. 손잡이 "앞선 거리" 를 0 에서 4 까지
 * 옮기며 판을 다시 돌리고, 거리별 박자 기둥이 U 자를 그린다 (96 · 68 · 48 · 88 · 96).
 *
 * ── 묶음 안에서 어떻게 갈랐나 (fetchAhead 와)
 *
 * 둘 다 "쓸 줄을 미리 부른다" 를 다룬다. 갈라 세운 것은 **주장**이다.
 *
 *   이 개념     앞섬의 크기가 **고를 값**이다. 모자라면 늦게 오고, 넘치면 쓰기 전에 밀려난다.
 *               양쪽 실패가 다 있어서 맞는 거리가 하나 있다는 것이 주장이다.
 *   fetchAhead  바로 다음 줄 하나를 부르는 **한 장면**. 가져오는 시간이 읽는 시간과 겹쳐
 *               흘러 경계에서 서지 않는다는 것, 남는 기다림은 첫 줄뿐이라는 것.
 *
 * 어휘 배타 — 이쪽 definition 은 lead · tuning · late · displaced · unused 를 갖고,
 * 저쪽의 following · current · concurrently · sequential · scan · stall 을 쓰지 않는다.
 * 꼬리도 엇갈린다: 이쪽은 무엇이 틀어지는가(밀려남)로, 저쪽은 무엇이 남는가(첫 줄)로 끝난다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const prefetchingConcept: FacetConceptSource = {
  id: 'prefetching',
  label: 'Prefetching (Choosing How Far Ahead)',
  canonicalFacet: 'facet:prefetching',

  surface: {
    definition:
      'Requesting memory lines before the program reaches them, where the size of the lead is a tuning choice: too short and a line arrives late, too long and it is displaced unused.',
    exemplarKeywords: [
      'prefetch distance',
      'how far ahead to prefetch',
      'software prefetch',
      '__builtin_prefetch',
      'prefetch instruction',
      'hardware prefetcher',
      'prefetch too early',
      'prefetch too late',
      'useless prefetch',
      'cache pollution',
      'prefetched line evicted before use',
      'timeliness of prefetching',
      'prefetch accuracy and coverage',
      'memory latency versus lookahead',
    ],
  },

  briefing: {
    observable: [
      'The array sits along the top as eight lines of four elements, a cursor walks it one element per cycle, and four cache places wait below with a road between them marked with the eight-cycle trip.',
      'Every line that leaves memory is a block travelling down that road; a line called ahead is drawn in a different colour from one fetched on a miss, and it sets off earlier the larger the distance is.',
      'A line still on its way already takes up a cache place — the place shows as a dashed outline until the block lands — and once all four are taken one of them is marked as next out.',
      'A line called ahead and pushed out before the cursor ever reached it drops into a tray on the right labelled as pushed out unused, and the counter of wasted prefetches rises with it.',
      'A time bar under the cache grows as the run goes, in working cycles and waiting cycles of a different colour, so the waiting is measured as length rather than read off a number.',
      'The caption tells three kinds of wait apart: a plain miss, a line called ahead that is still on its way (not a miss, yet the cursor waits), and a line called ahead that was pushed out and has to be fetched again.',
      'Across distances 0 to 4 the totals come out as 96, 68, 48, 88 and 96 cycles. Distance 1 has a single miss but still waits 36 cycles; distance 2 waits only 16; from distance 3 on four prefetches are wasted every run.',
      'When the distance changes the previous time bar sinks below as a faded reference labelled with its distance, and a column chart of cycles by distance fills in one column per run until the U shape is visible.',
    ],

    screen: {
      affordances: [
        'A playback bar with play, step, pause, reset and speed, and next to it a "Distance ahead" slider with five stops, 0 to 4, starting at 0.',
        'Moving the slider empties the cache and runs the whole walk again at the new distance; the previous run stays on screen as a reference bar and a column in the chart.',
        'Four counters run alongside: cycles, stall cycles, misses and wasted prefetches, each starting again from zero for every run.',
        'The code panel titled "Counting cycles with prefetch" starts empty with a "+ Add language" button offering Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side. It writes the counting rule out as two functions, one returning the total cycles and one the number of wasted prefetches, and their answers match the counters.',
        'The array length, line width, trip time and cache size are fixed, so an article can quote the cycle counts for each distance directly.',
      ],
    },

    useWhen: [
      'The article says "just prefetch" as if any amount of lookahead helps. Watching the total fall from 96 to 48 and then climb back to 96 is what turns the idea into a quantity with a best value.',
      'The reader treats a line that was requested early but has not landed yet as solved. The case where there is no miss and the cursor still waits is the thing that has to be seen.',
      'The prose explains cache pollution, or why an aggressive prefetcher can make a program slower: prefetched lines are shown leaving the cache unread and the waste is counted.',
      'The article is working out a lead from latency divided by the time spent per line and wants the reader to check the formula against a run where the right answer is visibly two.',
    ],

    avoidWhen: [
      'The point is only that requesting a line early lets its trip run alongside useful work. Here the claim is about the size of the lead, and the simple overlap is taken for granted.',
      'The subject is why a single miss brings back several elements. Line width never varies here and the whole block arriving is assumed.',
      'The article compares replacement rules. The cache here always gives up its least recently stamped line and that rule is never changed.',
      'The walk is irregular — pointer chasing, a hash table, a tree. Every access here is the next element of one array, so what is called ahead is always what will be needed.',
      'The subject is instruction fetch, branch prediction, or a pipeline running ahead of itself.',
      'The article means preloading web resources, DNS prefetch, or a browser fetching a page before the user clicks.',
      'The subject is a disk or database read-ahead buffer. The trade-off has the same shape but the units, costs and machinery are different.',
    ],

    contrastWith: [
      {
        concept: 'fetchAhead',
        note: 'That one establishes that requesting the following line early lets the trip run alongside reading the current one; this one treats how early as the real question, since both too little and too much lead cost cycles.',
      },
      {
        concept: 'lineFill',
        note: 'That is what the cache brings back when something is demanded; this is about asking before any demand arrives, and the block that comes back is the same either way.',
      },
      {
        concept: 'cacheReplacement',
        note: 'Both end in a line leaving the cache, but they blame different parties: that one says the choice of which line to give up decides how often data is found, while this one says the harm comes from lines requested before they are needed, whatever rule does the giving up.',
      },
      {
        concept: 'latencyLadder',
        note: 'That supplies the length of the trip; this one asks how far ahead a request must go out to cover that length without outrunning the room the cache has.',
      },
      {
        concept: 'spatialLocality',
        note: 'Walking in address order is what makes the next lines predictable at all; this one takes that predictability as given and asks how far to act on it.',
      },
      {
        concept: 'arrayTraversalOrder',
        note: 'That one reduces how many trips to memory a walk makes by changing its order; this one leaves the number of trips alone and moves them earlier so they are not waited on.',
      },
      {
        concept: 'outOfOrderExecution',
        note: 'Both keep the processor busy during a long memory trip, but that one finds other independent instructions to run while waiting, and this one starts the trip before the instruction that needs it is reached.',
      },
    ],
  },
};
