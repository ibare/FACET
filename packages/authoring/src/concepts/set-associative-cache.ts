/**
 * setAssociativeCache 개념 선언.
 *
 * canonical facet 은 `facet:setAssociativeCache` — 칸 여덟을 고정해 두고 연관도를
 * 1 · 2 · 4 · 8 로 갈아 끼우는 완결형이다. 미스는 15 → 11 → 5 로 떨어지다 4-way 에서
 * 서고 8-way 에서도 5 그대로이며, 그동안 한 번 찾을 때 뒤지는 칸이 연관도만큼 는다.
 * 얻는 것과 치르는 것이 계기 둘에 나란히 선다.
 *
 * ── 묶음 안에서 어떻게 갈랐나 (associativityRelief 와)
 *
 * 둘뿐인 묶음이고 둘 다 "한 자리에 여럿을 두면 덜 밀린다" 를 말하므로 definition 이
 * 가장 붙는다. **어휘를 아예 갈라 세웠다.**
 *
 *   associativityRelief  **칸막이를 옮긴 한 장면**. 늘린 것이 없는데 밀어냄이 그친다.
 *                        쓰는 낱말 — dividers · fixed number of slots · position ·
 *                        block · pushing each other out · resident together.
 *   이 개념              **얼마나 넓혀야 하고 무엇을 치르는가**. 쓰는 낱말 —
 *                        group of ways · widening · competing lines · lookup ·
 *                        search.
 *
 * 그래서 이 definition 은 'divider' · 'regroup' · 'resident' · 'push out' 을 한 번도
 * 쓰지 않는다. 저쪽은 'ways' · 'widening' · 'lookup' · 'search' 를 쓰지 않는다.
 *
 * ── 밀어내야 하는 것
 *
 * definition 에 'cache' 가 있는 한 웹 캐시 · CDN · 메모이제이션 · LRU 캐시 자료구조
 * 글이 잘못 걸린다. 'associative' 는 수학의 결합법칙과 연관 배열을, 'set' 은 집합
 * 자료구조를 부른다 — 전부 avoidWhen 에 못박는다.
 *
 * 밀어낼 것을 고르는 규칙(LRU)은 화면에서 쓰이되 이 개념이 설명하지 않는다. 연관도가
 * 올라가면 고를 일이 생긴다는 것까지가 여기 몫이고, 규칙 자체의 비교는 다른 개념이
 * 맡는다. 그 경계는 avoidWhen 으로만 긋는다.
 *
 * ── 수치의 성격
 *
 * 15 → 11 → 5 → 5 는 이 접근열(주소 다섯, 세 바퀴)에서 실제로 세어진 값이다. 4-way
 * 에서 서는 자리는 서로 다른 줄이 다섯뿐이라는 사정에서 나오므로, 실제 기계의
 * 연관도 선택을 이 수로 정당화하면 안 된다 — 화면만 보아서는 도출되지 않는 정보라
 * avoidWhen 의 몫이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const setAssociativeCacheConcept: FacetConceptSource = {
  id: 'setAssociativeCache',
  label: 'Set-Associative Cache (How Far Widening Pays)',
  domain: 'computer-architecture',
  canonicalFacet: 'facet:setAssociativeCache',

  surface: {
    definition:
      'A cache that assigns each line to a group of ways, where widening the group removes collisions only up to the number of competing lines and makes every lookup search all the ways of its group.',
    exemplarKeywords: [
      'set-associative cache',
      '2-way and 4-way caches',
      'why caches are 8-way and not more',
      'how much associativity is enough',
      'raising associativity without adding capacity',
      'tag comparison on every lookup',
      'an address split into index and tag',
      'fewer sets means longer tags',
      'diminishing returns from a wider cache organization',
      'more comparators, more latency and more power',
      'the hit rate stops improving',
      'cache organization and its trade-offs',
    ],
  },

  briefing: {
    observable: [
      'Eight slots sit in one row and never move: as the handle goes from 1-way to 8-way the coloured bands above them stretch and merge, but no slot changes position or width, so widening cannot be mistaken on screen for enlarging.',
      'Two meters run side by side and move in opposite directions across the ladder — Misses falls while Slots searched climbs to match the associativity exactly, which is the trade-off stated as two numbers rather than one.',
      'Each lookup sweeps the slots of its group one at a time and a bracket underneath grows to the width of that group, so the price of a wider grouping is spent in visible time before the verdict arrives.',
      'A line under the address chip re-reads the same address at every rung: 128 is line 8 with tag 1 at the narrowest grouping, and the same 128 becomes tag 8 at the widest, so the tag is seen to lengthen as the number of groups shrinks.',
      'At the narrowest setting every one of the fifteen accesses is a miss — the Misses meter finishes equal to the number of accesses — even though only two of the groups are ever visited.',
      'The closing caption reports each run against the one below it: fifteen misses, then eleven, then five, and then five again at the widest grouping, where the wording changes from a drop to no change at all.',
      'At four ways the misses all fall in the first of the three rounds and the remaining two rounds are unbroken hits, so the three round markers filling up show where the cost was paid and where it stopped being paid.',
      'A small marker appears beneath one slot of each full group once a group holds more than one line, pointing at the one that would be given up next; at the narrowest setting there is nothing for it to choose and it does not appear.',
      'A miss on a full group plays as two motions: the tag already sitting there slides downward and fades, and only then does the address chip fly down from the tape into the emptied slot.',
      'A HIT or MISS stamp is placed under the group that was searched rather than under the slot that answered, which keeps the verdict attached to the group as the unit.',
      'At the widest setting a single band spans all eight slots and every address is read into that one group, so the index disappears from the address and the tag carries the whole line number.',
      'The code panel highlights the line matching the running phase as the count proceeds — deriving the group count, splitting the address, searching the group, counting the miss, choosing the slot to give up, and filling it.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider.',
        'A four-way associativity control set to 1-way, 2-way, 4-way and 8-way is the handle that carries the argument; it starts at 1-way, and pressing another value abandons the run in progress and starts that one immediately from an emptied cache.',
        'The eight slots, the five addresses, the three rounds and the 16-byte lines are fixed, so an article can quote a specific miss count for a specific rung and rely on it.',
        'The code panel starts empty with a "+ Add language" button offering Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side.',
      ],
    },

    useWhen: [
      'The article reaches a poor hit rate and the only remedy on offer is more capacity. A handle that improves the result three times over while the slot count stays visibly at eight puts a second remedy on the table.',
      'The prose needs the improvement to have an end: the reader should see the figure stop moving while the handle keeps going, and understand that the stopping point is set by how many lines compete rather than by how generous the hardware feels.',
      'The article claims more associativity is not free and needs the charge itemised. Two meters moving in opposite directions, and a search that visibly takes longer at each rung, make the cost concrete before the sentence about comparators arrives.',
      'The reader is about to be shown how an address is split, and needs the split to be a consequence of the grouping rather than a fixed diagram — the same address arrives at a different group with a different tag at each rung.',
    ],

    avoidWhen: [
      'The article wants to justify a particular associativity for real hardware. The figures here are counted over one short sequence of five addresses repeated three times, and the point at which the improvement stops follows from that sequence having five distinct lines; a real workload moves that point, so these numbers support an argument about the shape of the curve and not a design choice.',
      'The article uses "associative" in its mathematical sense — the associative property, whether the grouping of operands changes a result. Nothing here is an operation over operands; the grouping is of hardware storage.',
      'The subject is an associative array, a dictionary, a hash map, or anything reached by a key. Every position here is reached by arithmetic on an address.',
      'The article is about the set data type — membership, union, intersection, deduplication. The word names a group of slots here.',
      'The subject is an HTTP cache, a CDN, a browser cache, or a proxy tier. Those distribute copies of documents across machines.',
      'The article is about memoizing a function or keeping computed results under a key.',
      'The subject is a bounded cache data structure that discards entries when full — implementing LRU, its bookkeeping, or the interview question about it.',
      'The article is weighing one discard rule against another — least recently used against least frequently used, random, or first in first out. A rule is in force here and never varied; what varies is how many candidates that rule is given.',
      'The point is how wide a line should be, how many bytes ride along with a request, or how data should be laid out to suit them. The line size is fixed at every rung here.',
      'The subject is returning to data soon enough that it is still present, or a working set that outgrows the room. The room is constant here and the accesses never change.',
      'The article is about writes, dirty lines, coherence between cores, or fetching a line before it is demanded. Every access here is a demanded read on one stream.',
      'The subject is how much a trip to memory costs, or the several tiers beneath the cache. Misses are counted here and never priced.',
      'The article is about naming the categories of cache miss or the taxonomy that separates them.',
    ],

    contrastWith: [
      {
        concept: 'associativityRelief',
        note: 'Both hold the storage constant and change only how it is partitioned, but that one asserts no more than that the relief exists, while this one measures how far the partitioning keeps paying and what each step adds to the work of finding something.',
      },
      {
        concept: 'cacheLine',
        note: 'Two ways to spend a fixed capacity, and they are chosen independently: that one settles how much ground each unit of storage covers, this one settles how many units an address may be placed in.',
      },
      {
        concept: 'temporalLocality',
        note: 'Two different pressures on the same storage: there the data that is live exceeds the room, here the room is sufficient and the placement rule is what stands in the way.',
      },
      {
        concept: 'lruCache',
        note: 'One word for two questions: there, which entry a full container should give up; here, how many candidates that choice is offered, which is settled before any rule for choosing applies.',
      },
      {
        concept: 'latencyLadder',
        note: 'This counts how many lookups end up going further out; that one says what going further out is worth, and neither number means much without the other.',
      },
    ],
  },
};
