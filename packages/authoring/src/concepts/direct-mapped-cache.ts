/**
 * directMappedCache 개념 선언.
 *
 * canonical facet 은 `facet:directMappedCache` — 여덟 줄짜리 캐시를 고정해 두고
 * 되풀이해 도는 배열의 크기만 4·6·8·9·12·16 으로 갈아 끼우는 완결형이다.
 * 8 까지 33% 에서 꿈쩍 않다가 9 에서 48%, 12 에서 78%, 16 에서 100% 로 무너진다.
 *
 * ── 묶음 안에서 어떻게 갈랐나 (특히 conflictMiss 와)
 *
 * 이 묶음 셋이 모두 "주소가 어느 자리에 앉는가" 를 다루므로 definition 의
 * **주어**를 셋 다 달리 세웠다.
 *
 *   이 개념       손잡이를 돌릴 때 미스율이 그리는 **곡선**. 들어맞는 동안 평평하고
 *                 넘는 순간 무너진다. 주어가 값의 변화지 한 장면이 아니다.
 *   conflictMiss  캐시의 4분의 3 이 빈 채로 밀려나는 **한 장면**.
 *   indexAndTag   주소 하나가 세 토막으로 갈려 각자 다른 일을 맡는다는 것.
 *
 * conflictMiss 와 가장 붙는다 — 절벽은 결국 충돌이 쌓인 결과다. 그래서
 * **어휘를 배타로 갈랐다.** 이쪽은 `fits` · `outgrows` · `miss rate` · `cliff` ·
 * `flat then collapses` 를 갖고, 저쪽의 `empty lines` · `only one line it may
 * occupy` · `space to spare` · `capacity` 를 definition 에서 한 번도 쓰지 않는다.
 * 반대쪽도 이쪽 낱말을 쓰지 않는다.
 *
 * temporalLocality 와도 갈라야 한다 — 저쪽이 `working set` 어휘를 이미 갖고 있어
 * 여기 keywords 에 그 말을 넣지 않는다. 저쪽은 "담을 자리보다 살아 있는 줄이
 * 많다" 이고 이쪽은 "자리를 주소가 정해 놓아 넘는 순간 절벽" 이다.
 *
 * ── 수치의 성격
 *
 * 백분율은 여덟 줄 캐시를 세 바퀴 돌린 **셈의 결과**이지 어느 기계의 실측이
 * 아니다. 화면만 보아서는 도출되지 않으므로 avoidWhen 이 못박는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const directMappedCacheConcept: FacetConceptSource = {
  id: 'directMappedCache',
  label: 'Direct-Mapped Cache (Fits, Then a Cliff)',
  domain: 'computer-architecture',
  canonicalFacet: 'facet:directMappedCache',

  surface: {
    definition:
      'How a direct-mapped cache answers an array swept over and over as the array grows: the miss rate stays flat while the array fits, then collapses within a few lines of outgrowing it.',
    exemplarKeywords: [
      'direct-mapped cache',
      'miss rate against array size',
      'performance falls off a cliff',
      'it was fast until the input grew a little',
      'the data no longer fits in cache',
      'sweeping an array repeatedly',
      'a buffer sized to stay in cache',
      'why a slightly bigger array is much slower',
      'compulsory misses against the rest',
      'a threshold where cache behaviour changes',
      'one fixed slot per address',
      'tuning a block size to fit the cache',
    ],
  },

  briefing: {
    observable: [
      'The array is drawn as a row of tiles above the cache and each tile has a wire running down to the slot it belongs to, so the arrangement is visible before any access is played.',
      'Once the array has more tiles than the cache has slots, two wires end on the same slot and both are repainted in the contested colour, so the cause of what follows can be seen in the still picture.',
      'Turning the size handle moves the tiles rather than redrawing them — they slide to their new spacing while the wires follow, so the same eight slots are seen taking on more claimants.',
      'A tile flies to its slot along an arc; on a miss the tile already sitting there first flies back up to its own place in the array and only then does the new one land, so displacement is a departure rather than an overwrite.',
      'On a hit nothing travels: the seated tile swells once in place.',
      'Each tile carries its line number and the seated ones also carry a tag, so two tiles competing for one slot are distinguishable while they alternate.',
      'A ladder of bars below the cache keeps one column per size on the handle, and a bar rises only for a size that has actually been run, so the shape accumulates as the reader turns the handle rather than arriving complete.',
      'The measured bars read 33, 33, 33, then 48, 78 and 100 percent — three equal columns and then a wall, with a marker sliding between columns to mark the size in view.',
      'Four counters run beside the controls: accesses, first touch, evicted, and miss rate as a percentage.',
      'The first-touch counter and the evicted counter move differently as the handle turns: the first grows only in step with the array, while the second is zero at the three smallest sizes and then climbs steeply.',
      'A caption above states the current arrangement in words — how many lines, how many slots, how many sweeps — and the sweep counter at the right says which pass of three is running.',
      'Each access is narrated as it happens: whether the line was already seated, arrived for the first time, or wanted a slot another line was sitting in.',
      'The closing caption of each run gives misses out of accesses with the percentage, then splits that total into first touch and evicted.',
      'The code panel highlights the line matching the running phase — deriving the slot, the tag, the probe, the outcome, and the rate.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider.',
        'A six-way array size control set to 4, 6, 8, 9, 12 and 16 lines is the handle that carries the argument — it starts at 8, a run finishes and waits, and the next press rebuilds the arrangement and replays under the new size.',
        'The cache of eight slots, the three sweeps and the six sizes are fixed, so an article can name a size and quote the exact percentage it produces.',
        'Bars already measured stay up when the handle moves, so the reader can put two sizes side by side without replaying the first.',
        'The code panel starts empty with a "+ Add language" button offering Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side.',
      ],
    },

    useWhen: [
      'The article says a program is fast while its data fits in cache and the reader hears a gradual trade-off. Three flat readings followed by 48, 78 and 100 percent is the correction, and it needs the readings gathered one handle press at a time.',
      'The prose needs a threshold the reader can locate rather than a trend they must take on faith: nothing changes from 4 lines to 8, and the entire change arrives between 8 and 9.',
      'The reader should see that the collapse is not simply running out of room — the counter for unavoidable first touches barely moves across the whole range while the other one does all the climbing.',
      'The article is about sizing something to the machine — a tile, a block, a batch — and needs the penalty for guessing slightly too large to look like a wall rather than a slope.',
      'The prose is about to argue for a more elaborate placement scheme and needs the reader to have felt the cost of the simple one first, so the added machinery reads as a purchase rather than a complication.',
    ],

    avoidWhen: [
      'The article wants the miss rate of a real processor. These percentages are exact counts for a modelled cache of eight lines swept three times, not a measurement; a real machine has thousands of lines, several levels and usually more than one place per address, so they carry an argument about shape and not a specification.',
      'The subject is a single moment of displacement with most of the cache unused. The claim here is about where the turn happens as a size grows, not about any one access.',
      'The subject is how an address is divided into fields, or what the stored tag is for. The placement rule is assumed here so that size can be the only thing moving.',
      'The article is about an HTTP cache, a CDN, or a browser cache. Those hold copies of documents across machines; what grows and shrinks here is an array of addresses inside one chip.',
      'The article is about memoizing a function or storing computed results under a key. Nothing here is keyed by a value.',
      'The subject is a bounded cache data structure that discards entries when full — LRU, LFU, capacity and eviction as a discipline. Nothing here chooses what to discard; the address has already chosen it.',
      'The article is about how wide a block should be. The line size never moves here.',
      'The subject is holding several blocks per slot, or a rule for choosing which of them to discard. Only the simple scheme is run here, and only its behaviour is measured.',
      'The article is about writes: dirty lines, write-back against write-through, or when a change reaches memory. Every access shown here is a read.',
      'The subject is what one trip to memory costs. What is counted here is how often the trip is taken, never its price.',
      'The article is about pages, page size, or the TLB. The shape of the argument carries over and the mechanism and scale do not.',
    ],

    contrastWith: [
      {
        concept: 'conflictMiss',
        note: 'One is a single displacement happening while most lines stand unused, offered as proof that the cause is placement and not room; this is the curve that the same cause traces as the data grows, and where along that growth it turns.',
      },
      {
        concept: 'indexAndTag',
        note: 'That one is the rule by which an address arrives at a line and is recognised there; this takes the rule as settled and measures what it costs once more data is in play than the cache holds.',
      },
      {
        concept: 'temporalLocality',
        note: 'Both end in a program losing its cheap accesses, but there the cause is that more data is live at once than can be resident, while here the cache is not even full when the losses begin — the addresses have been sent to the same place.',
      },
      {
        concept: 'cacheLine',
        note: 'Two handles over the same hardware: that one varies how wide a block is while the walk stays put, this one varies how much data is walked while the geometry stays put.',
      },
      {
        concept: 'lruCache',
        note: 'One word for two objects: there a cache is a container of keyed entries and the interesting question is which entry to discard, here nothing is chosen because the address already fixes the answer, and the interesting question is when that begins to hurt.',
      },
    ],
  },
};
