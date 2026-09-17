/**
 * cacheLine 개념 선언.
 *
 * canonical facet 은 `facet:cacheLine` — 총 용량 128 B 를 고정해 두고 라인 크기만
 * 4 · 8 · 16 · 32 로 갈아 끼우는 완결형이다. 같은 손잡이를 이어 읽기와 띄엄띄엄
 * 읽기가 정반대로 받는 것이 화면의 전부다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 조각 넷이 모두 같은 캐시를 다루므로 definition 의 **주어**를 다섯 다 달리 세웠다.
 *
 *   이 개념           **고를 수 있는 폭**. 넓히면 이어 읽기는 이득이고 띄엄띄엄
 *                     읽기는 보폭을 두 번 담기 전까지 꿈쩍도 안 한다는 맞바꿈.
 *   lineFill          캐시가 하는 **일**. 하나를 부르면 그 블록이 통째로 올라온다.
 *   temporalLocality  프로그램의 **버릇** 하나 — 같은 자리로 되돌아온다.
 *   spatialLocality   프로그램의 **버릇** 둘 — 옆자리로 나아간다.
 *   latencyLadder     한 번 내려갈 때의 **값**. 층마다 몇 배씩.
 *
 * 그래서 여기 keywords 는 폭을 고르는 어휘(줄 크기 · 패딩 · 배치 결정)를 갖고,
 * "딸려 온다" 는 전달 어휘는 lineFill 에, 순회 어휘는 지역성 둘에, 사이클과
 * 나노초는 latencyLadder 에 넘긴다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const cacheLineConcept: FacetConceptSource = {
  id: 'cacheLine',
  label: 'Cache Line (Choosing the Width)',
  canonicalFacet: 'facet:cacheLine',

  surface: {
    definition:
      "A cache's fixed transfer width treated as a quantity to choose: widening the line lowers misses for a sequential walk but does nothing for a strided one until a single line spans more than one stride.",
    exemplarKeywords: [
      'cache line size',
      '64-byte cache line',
      'block size of a cache',
      'does a wider cache line help',
      'stride and cache line',
      'array of structs versus struct of arrays',
      'padding a struct to a line',
      'memory bandwidth wasted on unused bytes',
      'fewer lines when each line is larger',
      'miss rate against line size',
      'data layout for cache friendliness',
      'reading one field out of every record',
    ],
  },

  briefing: {
    observable: [
      'Two rows run the same line size at once — one walking element by element, one taking every fourth element — so a single handle is answered twice and differently in the same instant.',
      'The line boundaries do not blink between sizes: the thirty-two slot rectangles slide together and merge, two into one and then four into one, while the tick marks for a single integer never move, so a widening line is visibly a line that covers more cells.',
      'On a miss the fill grows from one cell wide to the whole line wide, which is what fetching the neighbours looks like; on a hit nothing grows.',
      'The probe lands on the byte actually touched, and in the strided row it keeps landing on the same corner of each line, which is the unused remainder made visible.',
      'Each row keeps its own running score in the form misses / accesses with a percentage, left beside the row rather than gathered into a panel.',
      'The Lines counter falls as the line grows — thirty-two lines at 4 B down to four lines at 32 B — because the total capacity is held at 128 B, so width and count trade against each other on screen.',
      'Sequential halves at every step of the handle: 100, 50, 25, then 13 percent. Strided sits at 100 percent for the first three sizes and only drops to 50 at 32 B, so the improvement arrives as a step rather than a slope.',
      'A verdict line beneath the rows changes with the size: at 4 B nothing rides along and both patterns miss everything; in the middle the neighbours arrive and are never read; at 32 B the stride lands in one line twice.',
      'A caption across the top states the current split in words — how many bytes one line holds and how many lines the cache is therefore cut into.',
      'The code panel highlights the line matching the running phase as the count proceeds — deriving the line count, the address, the line number, the probe, the miss, and the rate.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider.',
        'A four-way line size control set to 4B, 8B, 16B and 32B is the handle that carries the argument — a round finishes and waits, and the next press rebuilds the boundaries and replays both patterns under the new width.',
        'The two access patterns, the thirty-two accesses and the 128 B capacity are fixed, so an article can quote a specific pair of percentages and rely on it.',
        'The code panel starts empty with a "+ Add language" button offering Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side.',
      ],
    },

    useWhen: [
      'The article says a larger cache line is better and the reader takes it for a property of the hardware. One handle moving while one row improves and the other refuses to is the correction, and it needs both rows on screen at once.',
      'The prose has to make capacity a budget rather than a number: the same 128 B becomes thirty-two narrow lines or four wide ones, and the reader should see that buying width spends count.',
      'The reader is about to decide how to lay data out — fields interleaved or separated, records walked whole or sampled — and needs the same hardware to produce two different answers depending on that choice alone.',
      'The article needs a threshold rather than a trend: the strided row is unmoved until one line finally covers more than a single stride, and then it halves at once.',
    ],

    avoidWhen: [
      'The subject is an HTTP cache, a CDN, or a browser cache. Those place copies of documents across machines; the unit here is a fixed span of addresses inside one chip.',
      'The article is about memoizing a function or storing computed results under a key. Nothing here is keyed by a value; a line is decided by an address and its width.',
      'The subject is a bounded cache data structure that discards entries when full — LRU, LFU, capacity and eviction. That asks which entry to throw out; this asks how wide each entry should be, and the discipline is not the variable here.',
      'The point is which slot an address lands in, or how an address is split into a tag and an index. Placement is assumed here so that width can be the only thing moving.',
      'The subject is associativity — several lines sharing a slot, or two hot addresses colliding in one slot while the cache is half empty.',
      'The article is about writes: dirty lines, write-back against write-through, or when a change reaches memory. Every access shown here is a read.',
      'The subject is two cores touching one line, or coherence between caches. A single stream of accesses runs here.',
      'The article is about fetching a line before it is asked for. Every line here arrives because it was demanded.',
      'The subject is a page of virtual memory, page size, or the TLB. The shape of the argument is similar and the mechanism and scale are not.',
    ],

    contrastWith: [
      {
        concept: 'lineFill',
        note: 'Both concern the fixed block a cache moves, but that one asserts only that the block exists and that asking for one element brings the rest, while this one takes the block\'s width as a quantity to be chosen and asks what the choice costs on either side.',
      },
      {
        concept: 'spatialLocality',
        note: 'The same pairing seen from opposite ends: this holds the walk fixed and varies the width, that holds the width fixed and varies how the program walks.',
      },
      {
        concept: 'temporalLocality',
        note: 'Two reasons a second access can be cheap — returning to an address already fetched, or arriving at one a neighbour paid for. This settles how far "neighbour" reaches; that one never uses neighbours at all.',
      },
      {
        concept: 'latencyLadder',
        note: 'This is about how often a trip to memory is taken; that one is about what a single trip is worth, which is why the frequency is worth arguing over.',
      },
      {
        concept: 'lruCache',
        note: 'One word for two objects: there a cache is a container of keyed entries and the question is which to discard, here it is a partition of the address space and the question is how wide each part should be.',
      },
    ],
  },
};
