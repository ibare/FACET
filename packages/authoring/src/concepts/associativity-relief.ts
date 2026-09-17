/**
 * associativityRelief 개념 선언.
 *
 * canonical facet 은 `facet:associativityRelief` — 칸 넷을 고정해 두고 칸막이만
 * 옮기는 조각. `0 64 0 64 0 64` 를 두 번 굴려, 1-way 에서 여섯 번 다 미스이던 것이
 * 2-way 에서 둘로 주는 것을 보이고 멈춘다. 손잡이는 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나 (setAssociativeCache 와)
 *
 * 둘뿐인 묶음이고 둘 다 "한 자리에 여럿을 두면 덜 밀린다" 를 말하므로 definition 이
 * 가장 붙는다. **어휘를 아예 갈라 세웠다.**
 *
 *   이 개념              **칸막이를 옮긴 한 장면**. 늘린 것이 없는데 밀어냄이 그친다.
 *                        쓰는 낱말 — dividers · fixed number of slots · position ·
 *                        block · pushing each other out · resident together.
 *   setAssociativeCache  **얼마나 넓혀야 하고 무엇을 치르는가**. 쓰는 낱말 —
 *                        group of ways · widening · competing lines · lookup ·
 *                        search.
 *
 * 그래서 이 definition 은 'ways' · 'widening' · 'lookup' · 'search' · 'group' 을
 * 한 번도 쓰지 않는다. 저쪽은 'divider' · 'regroup' · 'resident' 를 쓰지 않는다.
 * 한쪽이 쓰는 낱말을 다른 쪽이 아예 쓰지 않아야 두 점이 벌어진다.
 *
 * ── 밀어내야 하는 것
 *
 * definition 에 'cache' 가 있는 한 웹 캐시 · CDN · 메모이제이션 · LRU 캐시 자료구조
 * 글이 잘못 걸린다. 여기에 더해 'associativity' 는 수학의 결합법칙을, 'set' 은
 * 집합 자료구조와 연관 배열을 부른다 — 넷 다 avoidWhen 에 못박는다.
 *
 * 밀어낼 것을 고르는 규칙(LRU)은 화면에서 쓰이지만 이 개념이 설명하지 않는다.
 * 자리가 하나뿐인 1-way 에서는 고를 것조차 없다. 그 경계도 avoidWhen 이 긋는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const associativityReliefConcept: FacetConceptSource = {
  id: 'associativityRelief',
  label: 'Associativity Relief (Room to Sit Together)',
  canonicalFacet: 'facet:associativityRelief',

  surface: {
    definition:
      'Changing only the dividers among a fixed number of cache slots, so that one position holds more than one block and two addresses that kept pushing each other out stay resident together.',
    exemplarKeywords: [
      'why a cache misses while it is mostly empty',
      'two addresses fighting over the same place',
      'the same cache size but fewer misses',
      'thrashing between two arrays',
      'every read misses in a loop over two buffers',
      'addresses that land on top of each other',
      'one block per position against two',
      'nothing was added and it still got better',
      'a stride that maps everything to one place',
      'padding an array to stop the collisions',
      'why the misses vanish after regrouping',
    ],
  },

  briefing: {
    observable: [
      'The rail holding the four slots never changes width, and the slots themselves never change size — across both passes the only things that move are the dividers drawn between them, so "nothing was added" is stated by the geometry rather than by a caption.',
      'Going from the first arrangement to the second removes two dividers and leaves the middle one standing exactly where it was, which is why the second arrangement reads as a regrouping rather than as a larger picture.',
      'In the first pass only the leftmost slot is ever occupied: the three to its right sit empty and dashed from the first access to the last, while every access misses.',
      'Each access flies down from the tape of addresses at the top into a slot, and when the position is full the occupant drops out downward at the same moment — two opposite motions in one beat is what being pushed out looks like.',
      'One access in the second pass lands with nothing dropping out: it settles beside the block already sitting there, and that is the only frame in which the two arrangements visibly differ in kind rather than in count.',
      'The verdicts are left where they were measured: a row of stamps under each address, one row per arrangement, aligned in the same columns, so the run ends with M M M M M M standing directly above M M H H H H.',
      'The sequence alternates between just two addresses, 0 and 64, six times over, and the captions name the position each one goes to — the same position in both arrangements, so what differs is only how many that position holds.',
      'The slots are emptied when the arrangement changes, so the second pass starts as cold as the first and the improvement cannot be credited to anything left over.',
      'The closing caption puts the two counts against each other as a single line: same four slots, same accesses, misses six then two.',
    ],

    screen: {
      affordances: [
        'The screen plays the first arrangement, the change of dividers, the second arrangement and the closing count on its own, then stops.',
        'Two buttons: Replay, and a step control that rewinds to the beginning and advances one move per press, which is how a reader can hold still on the moment an occupant drops out and compare it with the moment one sits down beside another.',
        'The four slots, the two arrangements and the six alternating accesses are fixed, so an article can name either address and quote the two miss counts.',
      ],
    },

    useWhen: [
      'The article reports a poor hit rate and the reader assumes the remedy must be a bigger cache. Three slots standing empty while every access misses is the counter-example, and it needs both passes over the same accesses to land.',
      'The prose is about two pieces of data that happen to land on top of one another — two arrays walked in step, a stride that keeps hitting the same place — and needs the remedy to appear as a change of arrangement rather than as a change of code.',
      'The reader has to separate "is there free room" from "is this address allowed to use it": the first pass answers yes to one and no to the other, which is the distinction the article depends on.',
      'A reader who accepts the idea in the abstract still doubts the size of the effect. Six misses becoming two, with the slot count held in view the whole time, supplies the magnitude without a benchmark.',
    ],

    avoidWhen: [
      'The article uses "associativity" in its mathematical sense — the associative property, whether grouping the operands of an operation changes its result, (a + b) + c against a + (b + c). Nothing here is an operation over operands; the grouping is of hardware storage.',
      'The subject is an associative array, a dictionary, a map, or a keyed lookup structure. The positions here are reached by arithmetic on an address, not by a key.',
      'The article is about the set data type — membership, union, intersection, deduplication. The word names a group of slots here and nothing about it is a collection of distinct values.',
      'The subject is an HTTP cache, a CDN, a browser cache, or a proxy. Those place copies of documents across machines; this is an arrangement of storage inside one chip.',
      'The article is about memoizing a function or storing computed results under a key.',
      'The subject is a bounded cache data structure that discards entries when full — implementing LRU, its bookkeeping, or the interview question. That builds the container; this changes how the container is partitioned.',
      'The article is weighing one discard rule against another — least recently used, least frequently used, random, first in first out. A rule is in force here but never varied, and the arrangement that makes the point has only one candidate to discard anyway.',
      'The point is how far the arrangement can usefully be widened, or what a wider arrangement costs to search. One step is taken here and the screen stops; the price of taking more is not on it.',
      'The subject is how wide a block should be, or how many bytes arrive per transfer. The block size is fixed here and the same in both passes.',
      'The article is about coming back to data before it is displaced, or about a working set outgrowing the room available. The pressure here is placement: the room is available and unusable.',
      'The article is about writes, dirty data, coherence between cores, or fetching before a demand. Every access here is a demanded read on a single stream.',
      'The subject is naming the categories of cache miss, or the taxonomy that distinguishes them from one another.',
    ],

    contrastWith: [
      {
        concept: 'setAssociativeCache',
        note: 'Both hold the storage constant and change only how it is partitioned, but this one asserts no more than that the relief exists, while that one asks how far the partitioning can usefully go and what each step of it adds to the work of finding something.',
      },
      {
        concept: 'temporalLocality',
        note: 'Two unrelated reasons a second reference can arrive too late: there more data is live than there is room for, here there is room to spare and the address is simply not permitted to use it.',
      },
      {
        concept: 'cacheLine',
        note: 'Two ways to spend the same capacity — that one settles how much ground each unit of storage covers, this one settles how many units an address is allowed to choose between.',
      },
      {
        concept: 'lruCache',
        note: 'One word for two questions: there, which entry a full container should give up; here, whether anything has to be given up at all.',
      },
    ],
  },
};
