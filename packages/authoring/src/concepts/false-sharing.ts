/**
 * falseSharing 개념 선언.
 *
 * canonical facet 은 `facet:falseSharing` — 선반 둘(코어 A · 코어 B) 사이에 메모리
 * 띠를 두고 같은 일을 두 번 하는 조각이다. 먼저 a[0] 과 a[1] 을 맡기면 한 줄을
 * 위아래로 일곱 번 빼앗기고, 그다음 B 의 칸을 a[4] 로 옮기면 각자 제 줄을 쥐고
 * 아무것도 움직이지 않는다. 손잡이는 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념은 형제 둘(`writePolicy` · `writeBackVsThrough`)과 **사건 자체가 다르다.**
 * 형제 둘은 고친 값이 **아래층으로** 언제 내려가는가이고, 이쪽은 한 줄이 같은 층의
 * 캐시 둘 사이에서 **옆으로** 오가는 일이다. 고치는 법은 정책이 아니라 배치다.
 *
 * 그래서 definition 은 'write-through' · 'write-back' · 'policy' · 'defer' ·
 * 'the level beneath' 를 한 번도 쓰지 않고, 코어 둘 · 한 줄 · 무효화 · 겹치지 않는
 * 주소 어휘만으로 선다.
 *
 * avoidWhen 첫 줄들이 이 개념의 존재 이유에 가깝다 — 화면이 경합처럼 보이므로
 * 경쟁 조건 · 락 경합 · 원자적 연산 글이 반드시 잘못 걸린다. 여기서 함께 쓰는
 * 값은 처음부터 **하나도** 없고, 그것이 "거짓" 이라는 말의 근거다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const falseSharingConcept: FacetConceptSource = {
  id: 'falseSharing',
  label: 'False Sharing (One Line, Two Owners)',
  canonicalFacet: 'facet:falseSharing',

  surface: {
    definition:
      'Two cores writing to separate addresses that happen to share one cache line, so every write invalidates the other core\'s copy of the whole line and the two contend without sharing any value.',
    exemplarKeywords: [
      'false sharing',
      'two threads slow each other down on different variables',
      'per-thread counters in one array',
      'padding to a cache line boundary',
      'alignas 64 on a struct field',
      'cache line ping-pong',
      'the line bounces between cores',
      'invalidating another core\'s copy',
      'scaling gets worse with more threads',
      'parallel loop slower than serial',
      'separate variables on the same line',
      'spacing out shared state',
      'why adding padding made it faster',
    ],
  },

  briefing: {
    observable: [
      'Three bands stand from the start — a shelf named core A on top, the memory strip in the middle, a shelf named core B beneath — so the two holders are separate places and the values sit between them.',
      'Each memory cell carries its name, its byte address and its value at once, so which line a cell belongs to can be recomputed by dividing rather than taken on trust: address 4 lands in line 0 and address 16 in line 1.',
      'The cells are boxed into groups of four with each group labelled as a line of sixteen bytes, so the boundary is a drawn outline rather than a claim in the caption.',
      'A coloured connector drops from each shelf to the one cell that core is responsible for, and the two connectors never meet on the same cell at any point in the run, which is the screen\'s standing evidence that nothing is genuinely shared.',
      'What travels is a slab as wide as the whole four-cell group, never a single cell, so the unit of movement is visibly larger than the unit either core touches.',
      'When the other core takes the line, the slab moves across to the opposite shelf and a dashed outline is left behind on the shelf it came from — the loser is shown keeping a hollow where a copy used to be.',
      'An invalidated counter sits beneath the line and flinches upward in the danger colour each time the slab changes hands, so the cost accumulates in a fixed place rather than being announced at the end.',
      'With the two cells on one line the slab crosses the screen on every write after the first and the counter reaches seven for eight writes, and the tally states the shared value count as zero in the same sentence.',
      'The second arrangement changes one thing visibly: core B\'s connector slides sideways to a cell in the other group, the colours follow it, and the addresses beneath the cells account for the move.',
      'In that arrangement each shelf holds a slab of its own and neither slab moves for the rest of the run; the invalidated counters stay at zero while the values in both cells keep climbing at the same rate as before.',
      'The write count is stated as identical across the two arrangements, so the difference cannot be attributed to one of them doing less work.',
      'The closing line names the single variable that changed — whether the two values sit on the same line — and repeats that the count of values the cores genuinely share is zero.',
    ],

    screen: {
      affordances: [
        'The screen plays both arrangements and the closing comparison on its own and then stops.',
        'Two buttons: Replay, and a step control that rewinds to the start and advances one round per press, which is how a reader can hold still on the slab changing hands and read the counter as it rises.',
        'The two arrangements, the eight writes, the 16 B line and the 4 B element are fixed, so an article can name a specific pair of indices, quote their addresses, and rely on the seven and the zero.',
      ],
    },

    useWhen: [
      'The article says two threads slowed each other down and the reader reaches for a lock, a race, or shared state. Two connectors that never touch the same cell, beside a counter reaching seven, relocates the problem out of the program and into the geometry of memory.',
      'The prose is about to recommend padding, alignment, or spacing per-thread state apart, and the reader needs the remedy to follow from something they have seen rather than arrive as a rule to be trusted.',
      'A reader has measured a parallel version running slower than expected with no contended lock in the profile and needs a mechanism that produces contention out of code that contains none.',
      'The article needs the cause isolated: the same code, the same count of writes, and only the placement of two values moved, so the difference belongs to the placement alone.',
      'The prose has already established that a cache moves whole blocks and now needs the other edge of that fact — that the block being the unit makes unrelated values share a fate.',
    ],

    avoidWhen: [
      'The subject is a data race or a race condition — two threads updating the same variable, a lost update, an interleaving that produces a wrong answer. Every write here lands on a cell no one else touches and every result is correct; what suffers is only speed.',
      'The article is about locks, mutexes, contended critical sections, or a thread waiting for another to release something. No core ever waits for permission here, and nothing is held.',
      'The subject is an atomic instruction, a lock-free algorithm, a spin loop, or memory ordering and barriers. Those coordinate access to a value two parties genuinely share; the count of shared values here is zero.',
      'The article is about genuine sharing — a counter, a queue head, or a flag that several threads really do read and write. The remedy there is coordination; the remedy here is moving the values apart, and confusing the two leads to the wrong fix.',
      'The subject is when a modified line reaches the level beneath, or whether changes are forwarded immediately or held back. The traffic drawn here runs sideways between two caches, not downward.',
      'The article is about how wide a line should be. The width is fixed at sixteen bytes here; what moves is which values are placed inside one.',
      'The point is that a whole block arrives in answer to one request, or that neighbours ride along uninvited. Those describe a benefit of the block being the unit; this shows the same fact turning into a cost.',
      'The subject is an HTTP cache, a CDN, a memoized function, or an LRU container that discards entries. No line here is ever discarded for want of room.',
      'The article is about the cost of switching a thread onto another core, or about scheduling and affinity. Each core keeps its own work throughout.',
      'The subject is a page of virtual memory, page-level sharing, or copy-on-write. The shape of the argument recurs at that scale and the mechanism and size do not.',
      'The article uses "sharing" for sharing a file, a link, or a resource between users.',
    ],

    contrastWith: [
      {
        concept: 'writePolicy',
        note: 'Both are about writes costing more than they appear to, but that one counts transfers down to the level beneath and is answered by setting a discipline, while this one counts copies revoked sideways between caches and is answered by moving the values apart.',
      },
      {
        concept: 'writeBackVsThrough',
        note: 'Both concern a modified line and what it costs, but that one is about a line reaching the level beneath it, and this one is about a line being taken back and forth between two caches on the same level while nothing is genuinely shared.',
      },
      {
        concept: 'cacheLine',
        note: 'The same width seen as a hazard rather than a setting: that one weighs what a wider block buys a single stream of accesses, while this one holds the width fixed and shows that the block being the unit of ownership makes unrelated values contend.',
      },
      {
        concept: 'lineFill',
        note: 'One fact with two consequences: that a request for one element brings the whole block is a saving when one program reads the neighbours, and a penalty when a second core owns one of them.',
      },
      {
        concept: 'spatialLocality',
        note: 'Adjacency in addresses pays when one program walks it and costs when two cores split it; the same closeness that makes a sequential walk cheap is what makes two private variables collide.',
      },
    ],
  },
};
