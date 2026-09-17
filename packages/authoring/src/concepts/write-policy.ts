/**
 * writePolicy 개념 선언.
 *
 * canonical facet 은 `facet:writePolicy` — 칸 넷 · 16 B 줄 · LRU 를 고정해 두고
 * 정책 손잡이만 write-through 와 write-back 으로 갈아 끼우는 완결형이다. 같은 열
 * 번의 고침에 아래층으로 내려간 쓰기가 열과 다섯으로 갈린다. 계기 둘이 나란히
 * 서서 앞엣것(고침)은 안 갈리고 뒤엣것(아래층으로)만 갈린다.
 *
 * ── 묶음 안에서 어떻게 갈랐나 (특히 writeBackVsThrough 와)
 *
 * 이 개념과 `writeBackVsThrough` 가 가장 붙는다 — 둘 다 같은 두 정책을 다루기
 * 때문이다. **하는 일로 갈랐다.**
 *
 *   이 개념             **고르는 일**. 규칙이 손잡이로 놓여 있고, 돌리면 내려간
 *                       횟수가 갈린다. 무엇을 아끼고 무엇을 치를지의 셈이다.
 *   writeBackVsThrough  **나란히 놓인 한 장면**. 같은 고침이 양쪽에 동시에 오고
 *                       한쪽은 곧장 내려보내고 한쪽은 표시만 단다.
 *
 * 그래서 이 definition 은 'write-through' · 'write-back' 이라는 이름을 한 번도
 * 쓰지 않고, 'side by side' · 'both' · 'at the same instant' 도 쓰지 않는다.
 * 대신 규칙 · 고르기 · 갈림 · 값(cost) 어휘만으로 선다. 두 이름 자체는 저쪽의
 * 정체이므로 저쪽에 넘겼고, 여기 keywords 는 "얼마나 아끼는가" 를 묻는 꼴로만
 * 그 말을 빌린다.
 *
 * 무엇을 버릴지 고르는 규칙은 `cacheReplacement` 의 몫이고, 줄이라는 단위가
 * 만드는 함정은 `falseSharing` 의 몫이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const writePolicyConcept: FacetConceptSource = {
  id: 'writePolicy',
  label: 'Write Policy (Deciding When the Edit Goes Down)',
  canonicalFacet: 'facet:writePolicy',

  surface: {
    definition:
      'The rule governing when a cache sends a modified line to the level beneath it, held as a setting: changing it alters how many transfers travel downward but never how many modifications were made.',
    exemplarKeywords: [
      'write policy of a cache',
      'choosing a write policy',
      'does deferring writes actually save anything',
      'write traffic to memory',
      'dirty line',
      'the dirty bit',
      'writes that never reach memory',
      'flushing the cache before shutdown',
      'memory holds a stale value for a while',
      'eviction forces the write',
      'how many writes actually reach DRAM',
      'bus traffic from stores',
      'write-allocate and no-write-allocate',
      'the cost of keeping the level below truthful',
    ],
  },

  briefing: {
    observable: [
      'Three bands stand one above another and are named at the left edge — the ten writes in their order, the four cache slots, and the level beneath — and a dashed guide with an arrowhead runs down the right side from the slots to that level, so the direction of the whole screen is drawn before anything moves.',
      'The premise is written into the top-left corner as 4 slots · 16 B lines · LRU, and the discipline currently running is named in the top-right corner, so both halves of the argument are readable from a still frame.',
      'Two counters sit together beneath the board, one for edits and one for what reached the level below; the first arrives at ten however the setting is left, and only the second answers to it, which is the whole claim expressed as a pair of numbers.',
      'A block that goes down is drawn as wide as the number of edits riding in it, and it lands as a tick carrying that same number, so a single transfer visibly carries more than one edit rather than being asserted to.',
      'While edits pile onto a line that is already modified, a small +N grows beside that slot and nothing at all moves downward — the accumulation is shown as an absence of motion.',
      'The fifth distinct line finds no free slot, and the least recently used line leaves carrying two edits at once, which is the only descent that happens mid-run under the deferring setting.',
      'The run does not end at the last edit: the lines still holding modifications are then sent down one after another, four of them, and the counter climbs from one to five in front of the reader.',
      'The closing line states the two totals together — ten edits, and five or ten writes that reached the level below.',
      'Changing the setting rebuilds the board and replays the identical sequence of ten from zero, both counters rewound, so the comparison is made by memory of the previous run rather than by two boards at once.',
      'The code panel highlights the line matching the running phase, and the count it performs includes the pass over the lines left modified at the end, so the five is derivable from the code rather than only from the animation.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider.',
        'A two-way control labelled Policy, set to write-through by default and write-back as the other segment, is the handle that carries the argument — a run finishes and waits, and the next press replays the same ten writes under the other setting.',
        'The sequence of ten writes, the four slots, the 16 B line and the least-recently-used victim rule are all fixed, so an article can name a particular write in the sequence and quote the totals it produces.',
        'The code panel starts empty with a "+ Add language" button offering Python, JavaScript, TypeScript, Java, C++ and C#; two can sit side by side.',
      ],
    },

    useWhen: [
      'The article claims that deferring writes reduces traffic and the reader has no sense of the size of the saving. Ten against five, produced from the same ten edits by one press, is the number the claim was missing.',
      'The prose is about to weigh what deferring costs — a stale level below, a loss on power failure, a long stall at the moment of displacement — and needs the benefit measured first so the weighing has two sides.',
      'The reader believes the saving is larger than it is, because the edits that pile up on lines still resident are easy to forget. The run that continues past the last edit, sending four more lines down, is the correction and it moves the total from one to five.',
      'A reader is deciding how a level of storage should propagate its changes and needs the discipline to appear as something set rather than something inherent to the hardware.',
      'The article needs a figure that survives quotation: the same sequence, the same capacity, and only the discipline moved, so the two totals can be attributed to that one difference.',
    ],

    avoidWhen: [
      'The subject is an HTTP cache, a CDN, a browser cache, or a reverse proxy. Those place copies of documents across machines; what is drawn here is one span of addresses inside a chip and the level directly beneath it.',
      'The article is about memoizing a function or storing a computed result under a key. Nothing here is keyed by a value, and nothing is recomputed.',
      'The subject is a bounded cache data structure with a discard discipline — an LRU or LFU container, capacity, get and put. That asks which entry to throw out; the discard rule is held fixed here so that what leaves with the discarded line can be the variable.',
      'The subject is durability in a database or filesystem — a write-ahead log, journalling, fsync, commit, or surviving a crash. Those are about ordering a record of an intention against the change itself; nothing here is logged, and the level beneath is simply overwritten.',
      'The article is about a program buffering its own output and flushing it, or about an operating system page cache reaching disk. The shape of the argument is similar; the mechanism, the level and the scale are not.',
      'The subject is which slot an address lands in, how an address splits into a tag and an index, or two hot addresses colliding while the cache is half empty. Placement is fully associative and uneventful here so that the discipline can be the only thing moving.',
      'The article is about how wide a line should be, or about a whole block arriving in answer to one request. The width is fixed at sixteen bytes and never moves.',
      'The subject is two cores holding copies of one line, coherence between caches, or invalidation. One cache and one stream of accesses run here.',
      'The article is about reads, hit rates, or how often a value is found. Every access shown here is a modification and nothing is read.',
      'The article uses "policy" for an access-control rule, a retention schedule, or a company policy document.',
    ],

    contrastWith: [
      {
        concept: 'writeBackVsThrough',
        note: 'One treats the discipline as a quantity to be set and reports what the setting costs; the other holds both disciplines at once under a single stream of edits and reports only that they differ. The saving is the claim here; the mechanism is the claim there.',
      },
      {
        concept: 'cacheReplacement',
        note: 'Both turn on the moment a resident line is displaced, but that one is about which line is selected for discard and this one is about what must travel downward once one has been. A different discard rule changes the choice; it does not change what a modified line owes.',
      },
      {
        concept: 'falseSharing',
        note: 'Both are about writes that cost more than they appear to, but this one counts transfers down to the level beneath and is answered by setting a discipline, while that one counts copies revoked sideways between caches and is answered by moving the values apart.',
      },
      {
        concept: 'lruCache',
        note: 'One word for two objects: there a cache is a container of keyed entries and the question is which to discard, here it is a copy of a span of addresses and the question is when a change to it reaches what it copies.',
      },
      {
        concept: 'cacheLine',
        note: 'Two settings on the same structure, each with its own cost: that one asks how wide the unit of transfer should be, this one asks how often a modified unit is transferred. Width is fixed here and frequency is fixed there.',
      },
    ],
  },
};
