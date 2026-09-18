/**
 * fetchAhead 개념 선언.
 *
 * canonical facet 은 `facet:fetchAhead` — 원소 열여섯(줄 넷, 줄마다 넷)을 차례로 읽는 두
 * 줄기를 같은 시계로 돌린다. 줄 하나가 오는 데 4 사이클. 프리페치가 없는 줄기는 32 사이클
 * 중 16 을 기다리고, 다음 줄 프리페치 줄기는 20 사이클 중 4 — 첫 줄 몫만 — 기다린다.
 *
 * ── 묶음 안에서 어떻게 갈랐나 (prefetching 과)
 *
 * 주어 층위를 가른다. 이 개념의 주어는 **시간 위의 겹침** 하나다 — 가져오는 시간이 줄지
 * 않고 읽는 시간 밑으로 들어간다. 앞섬의 크기는 한 줄로 고정이라 고를 값이 아니고, 밀려남도
 * 버림도 일어나지 않는다. 그러니 거리 · 너무 이름 · 밀려남 · 버림은 prefetching 이 독점하고,
 * 여기는 following / current / concurrently / sequential scan / stall 을 갖는다.
 *
 * 꼬리를 엇갈렸다: 이쪽 definition 은 "남는 기다림은 첫 줄뿐" 으로, 저쪽은 "쓰이지 못하고
 * 밀려난다" 로 끝난다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const fetchAheadConcept: FacetConceptSource = {
  id: 'fetchAhead',
  label: 'Fetching the Next Line Ahead',
  canonicalFacet: 'facet:fetchAhead',

  surface: {
    definition:
      'Requesting the following cache line as reading of the current one begins, so its trip from memory runs concurrently with those reads and a sequential scan stalls only on the first line.',
    exemplarKeywords: [
      'next-line prefetch',
      'sequential prefetch',
      'one block lookahead',
      'hiding memory latency',
      'overlapping the fetch with the work',
      'the data is already there when you get to it',
      'no stall at the line boundary',
      'streaming through an array',
      'latency hidden behind computation',
      'the fetch still takes as long, it just is not waited on',
      'only the first access pays',
    ],
  },

  briefing: {
    observable: [
      'Two lanes run on one shared clock, titled No prefetch and Next-line prefetch; each has four memory lines of four elements above, four empty cache places below, a read cursor, and a strip of cycles along the bottom.',
      'A requested line sends a copy down from memory into its cache place, and the trip visibly takes four cycles; the original stays in memory.',
      'In the lane without prefetch the cursor halts at every line boundary, its status reads "Waiting for line …", and the cycle strip gains a run of waiting cells before each line.',
      'In the next-line lane, the cycle that reads the first element of a line is also the cycle a copy of the line after it leaves memory, so that copy is already in place when the cursor reaches the boundary and the cursor never pauses there.',
      'Both lanes wait for the very first line, because nothing was read before it that could have triggered the request.',
      'Each lane closes with a status line of its own: 32 cycles, 16 of them waiting, against 20 cycles, 4 of them waiting — one lane is still reading after the other has stopped.',
    ],

    screen: {
      affordances: [
        'The screen plays both lanes to the end on its own and stops with the two totals showing.',
        'Under it sit a Replay button and a playback strip. Dragging the strip back to a line boundary is how a reader can hold the moment where one cursor stands still and the other keeps reading.',
        'Element count, line width and trip time are fixed, so an article can quote the two totals and the single wait that remains.',
      ],
    },

    useWhen: [
      'The reader believes a fetch issued early must somehow travel faster. The trip takes the same four cycles in both lanes; the only difference is that in one it passes while elements are being read, which is what makes the saving read as overlap rather than speed.',
      'The article is about to explain why streaming through an array is cheap even though every new line comes from memory, and needs the boundary where one cursor stops and the other does not.',
      'The reader expects a scan with a prefetcher to have no waiting at all. The first line, waited for in both lanes, is the residue to point at.',
    ],

    avoidWhen: [
      'The subject is choosing how many lines ahead to request, or a prefetch that arrives too early or too late. The lead here is fixed at one line and always turns out right.',
      'The article is about prefetched data evicting useful data or wasting bandwidth. No line is ever pushed out here, and nothing requested goes unread.',
      'The access pattern is strided, random, or follows pointers. Every read here is the next element, so the line after the current one is always the one needed.',
      'The subject is why one miss brings several elements. The block arriving whole is assumed from the start.',
      'The point is instruction fetch or a pipeline front end fetching instructions ahead.',
      'The article means a web page, a browser, or a DNS lookup being fetched early.',
    ],

    contrastWith: [
      {
        concept: 'prefetching',
        note: 'This settles that a request issued one line early takes the trip out of the waiting; that one treats the lead as a quantity to be chosen, where asking too early is as costly as asking too late.',
      },
      {
        concept: 'lineFill',
        note: 'That is the block a single demand brings back; this is the same block asked for before any demand, and the saving comes from when it was asked, not from what came back.',
      },
      {
        concept: 'latencyLadder',
        note: 'That says how long a trip to memory is; this leaves the trip exactly as long and makes it pass while other reads are happening.',
      },
      {
        concept: 'spatialLocality',
        note: 'That one saves trips by using the rest of a block already fetched; this one takes the same in-order walk and starts the next trip before the current block runs out.',
      },
      {
        concept: 'arrayTraversalOrder',
        note: 'That one is about how many line boundaries a walk crosses; this one is about whether the walk has to stop at each boundary it does cross.',
      },
    ],
  },
};
