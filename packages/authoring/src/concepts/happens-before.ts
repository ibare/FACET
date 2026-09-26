/**
 * happensBefore 개념 선언.
 *
 * canonical facet 은 `facet:happensBefore` — 프로세스 셋(P1 · P2 · P3)이 저마다 수 하나를 0 에서 든다. 사건 여덟이
 * 한 걸음씩 일어나며 제 일 · 보내기는 수를 1 올리고, 받기는 `max(제 수, 실려 온 수) + 1` 로 뛴다(P3 는 2 에서 5 로).
 * 마지막 두 걸음이 짝을 묻는다 — `a1` · `c3` 은 1 < 5 에 잇는 길이 있고, `a3` · `b2` 는 3 < 4 인데 잇는 길이 없다.
 * 스스로 재생하고 멈춘다(걸음 열하나).
 *
 * ── 묶음 안에서의 자리
 *
 * `clockSync`(완제품)는 램포트 수가 받음을 보냄 앞에 두지 않는다는 **보장**을 물리 도장과 견준다. 이쪽은 그 수의
 * **한계** — 수가 작다고 먼저라고 말할 수 없고, 잇는 길이 있어야만 먼저다. 그래서 definition 은 chain of steps and
 * messages · concurrent · cannot conclude 쪽 낱말을 쥐고, drift · physical timestamp · resync 를 쓰지 않는다.
 *
 * 전제 (화면 각주 없음 — 설명 글 `happensBefore.md`):
 *  - 일어난 차례(a1 · c1 · a2 · …)는 보는 사람을 위한 차례다. 프로세스는 제 수와 실려 온 수만 안다.
 *  - 수의 단위는 시간이 아니라 사건 하나다. 동률(a1 · c1 = 1 등)은 깨지 않는다.
 *  - 벡터 시계는 다루지 않는다.
 *  - 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const happensBeforeConcept: FacetConceptSource = {
  id: 'happensBefore',
  label: 'Happens-Before Relation and the Limit of Lamport Clocks',
  canonicalFacet: 'facet:happensBefore',

  surface: {
    definition:
      'One event happens before another only if a chain of same-process steps and messages connects them; a smaller Lamport count without such a chain does not make an event earlier, the two being concurrent.',
    exemplarKeywords: [
      'happens-before relation',
      'Lamport timestamps',
      'logical clock',
      'causal order',
      'concurrent events',
      'partial order of events',
      'clock condition',
      'Lamport 1978 Time, Clocks, and the Ordering of Events',
      'max(local, received) + 1',
      'why Lamport clocks cannot detect concurrency',
    ],
  },

  briefing: {
    observable: [
      'Three vertical ladders, "Process P1", "Process P2", "Process P3", rise along a shared "count" scale from 0 to 5. Each starts at 0 ("Each process keeps its own count.").',
      'Events appear one per step in the order a1, c1, a2, c2, b1, a3, b2, c3, each at the height of its new count: "a1: a local step on P1. Count 0 → 1.", "a2: P1 sends m1 carrying 2. Count 1 → 2."',
      'A receive jumps past the carried count: "b1: P2 receives m1. max(0, 2) + 1 = 3." and later "c3: P3 receives m2. max(2, 4) + 1 = 5." — P3 leaps from 2 to 5. Message arrows always slope upward.',
      'Step 9 asks about `a1` and `c3` ("Ask a1 · c3: follow the arrows, either way."): "Counts 1 < 5 · Path: a1 → a2 → b1 → b2 → c3". The path is traced, so a1 came first.',
      'Step 10 asks about `a3` and `b2`: "Counts 3 < 4 · Path: none, either way". The smaller count does not make a3 earlier; the two are concurrent.',
      'Several events share a count — a1 and c1 at 1, a2 and c2 at 2, b1 and a3 at 3 — and the ties are left as they are. In this data every one of the 15 connected pairs has increasing counts, while 10 pairs have a smaller count on one side and no path either way.',
      'The order in which events are laid out is for the viewer only; each process knows just its own count and the counts carried by messages it receives. The count measures events, not time. Breaking ties by process number to get a total order, and vector clocks that would detect concurrency, are not shown. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays the eleven steps by itself — the start, eight events, two questions — and stops after the second question.',
        'A Replay button and a playback strip sit below it. Dragging back to step 8 holds P3\'s jump from 2 to 5 as `m2` arrives.',
        'Events, messages and counts are fixed, so an article can quote every caption and path exactly.',
      ],
    },

    useWhen: [
      'The article states the clock condition — if a happens before b then its Lamport number is smaller — and must show that the converse fails with a pair whose counts are ordered but which nothing connects.',
      'A reader needs a working definition of concurrent events in a distributed system: two events with no chain of steps and messages between them, whatever their counts say.',
    ],

    avoidWhen: [
      'The subject is physical clock drift, NTP or timestamp skew. There is no wall-clock time here.',
      'The article is about vector clocks, version vectors or detecting conflicts automatically. Concurrency is found by tracing paths, not by a clock that records it.',
      'The topic is building a total order or a distributed mutual-exclusion protocol on top of Lamport numbers.',
    ],

    contrastWith: [
      {
        concept: 'clockSync',
        note: 'That Lamport numbers never place a receive before its send is their guarantee. That a smaller number proves nothing without a connecting path is their limit; the two claims are about the same counter from opposite directions.',
      },
      {
        concept: 'clocksDrift',
        note: 'Drift is why physical time cannot be trusted to order events on different machines. Happens-before replaces time with causality, and in doing so accepts that some pairs have no order at all.',
      },
      {
        concept: 'eventuallyAgrees',
        note: 'A last-writer-wins store forces every pair of writes into an order by timestamp. Happens-before says that for concurrent writes no such order exists, so the choice of winner is a policy rather than a fact.',
      },
    ],
  },
};
