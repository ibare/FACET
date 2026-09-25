/**
 * producerConsumer 개념 선언.
 *
 * canonical facet 은 `facet:producerConsumer` — 넣는 쪽 P 는 틱 0 ~ 5 에 물건 여섯을 몰아 만들고(한 번 일
 * `acquire(empty)` · `put()` · `release(full)`), 꺼내는 쪽 C 는 `acquire(full)` · `take()` · `release(empty)` 뒤 `use()`
 * 두 틱. 세마포어 `empty`(처음 표 = 칸 수) · `full`. 손잡이는 버퍼 칸 1 · 2 · 3 · 4 · 6. 칸을 늘리면 넣는 쪽 잠든 틱
 * 8 → 5 → 2 → 0 · 넣기 끝 틱 13 → 10 → 7 → 5 로 당겨지지만 꺼내기 끝 틱은 모두 16. 칸 6 은 4 와 같고 두 칸이 한 번도
 * 차지 않는다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 각각 한 장면이다 — 차면 못 넣고 비면 못 꺼냄(`boundedBuffer`) · 표를 세어 들임(`countingPermits`) ·
 * 조건이 아니면 내려놓고 잠(`waitAndSignal`). 이쪽은 **칸 수를 돌리면 무엇이 빨라지고 무엇이 그대로인가**를 쥔다.
 * 그래서 definition 은 fast producer · slow consumer · adding slots · finish sooner · never · unused 를 쥐고,
 * 조각들이 독점한 fails · FIFO · permits · first sleeper · condition variable · recheck 를 쓰지 않는다.
 *
 * 전제 (설명 글 `producerConsumer.md`): 두 쪽이 한 틱에 각자 한 번 움직인다(CPU 둘, 또는 넣는 쪽이 장치) — 동기화
 * 조각들의 "CPU 하나" 와 다르다. 만드는 틱과 쓰는 두 틱은 예. 한 틱 안에서 꺼내는 쪽이 먼저. 넘겨주기 규약.
 * 코드는 가상 표기이고 코드 패널은 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const producerConsumerConcept: FacetConceptSource = {
  id: 'producerConsumer',
  label: 'Producer–Consumer with Semaphores (What More Buffer Slots Buy)',
  canonicalFacet: 'facet:producerConsumer',

  surface: {
    definition:
      'Two semaphores let a fast producer and a slow consumer share a bounded buffer; adding slots lets the producer finish its burst sooner but never makes the consumer finish sooner, and slots beyond the burst stay unused.',
    exemplarKeywords: [
      'producer-consumer problem',
      'bounded buffer with semaphores',
      'empty and full semaphores',
      'buffer size tuning',
      'how big should a queue be',
      'bursty producer',
      'slow consumer bottleneck',
      'backpressure',
      'pipeline throughput',
      'sem_wait sem_post',
    ],
  },

  briefing: {
    observable: [
      'Across the screen: the Producer with an "In hand" place, the Buffer, and the Consumer with an "In use" place. Two semaphores show their permit counts and queues — `empty` starting at the number of slots, `full` starting at 0. Each side\'s three lines are written out: `acquire(empty)`, `put()`, `release(full)` and `acquire(full)`, `take()`, `release(empty)`, then `use()`.',
      'Two timelines at the bottom, "Put at" and "Took at", mark the tick each item entered and left. Each step is one tick, captioned with what each side did — "Made item 4", "P: acquire(empty) blocked, asleep", "C: took item 2 · release(empty) hands the permit to P".',
      'At tick 0, in every setting, the consumer moves first, finds nothing, and sleeps in the `full` queue; the producer\'s `release(full)` then hands the permit straight to it.',
      'With the default two slots the producer sleeps five ticks holding an item, putting items 4, 5 and 6 at ticks 4, 7 and 10 as the consumer frees slots. The round ends "Done at tick 16 · Never-filled slots: 0".',
      'Across the handle: producer asleep ticks 8, 5, 2, 0, 0 and producer done at tick 13, 10, 7, 5, 5 for 1, 2, 3, 4, 6 slots — but consumer done at tick 16 every time. Peak fill tops out at 4, so with six slots "Never-filled slots: 2".',
      'When the handle changes, the items that waited in the producer\'s hand move into the added slots, while the "Took at" marks land on exactly the same ticks as the previous round\'s.',
      'Both sides act once per tick, as if on separate processors, with the consumer acting first within a tick. Production ticks and the two-tick use are example values. A release with someone waiting hands the permit over without changing the count. The code uses a small language-neutral notation. The screen does not footnote these choices.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: "Buffer slots" with positions 1, 2, 3, 4 and 6, starting at 2. Each round plays tick by tick, then waits for the handle.',
        'The move that makes the idea land is stepping the slots from 1 up to 4 and watching the producer\'s finish tick pull in while the "Took at" marks do not move, then going to 6 and seeing two slots never filled.',
        'Readouts under the controls: Producer asleep ticks, Producer done at tick, Consumer done at tick, and Peak fill.',
      ],
    },

    useWhen: [
      'The article discusses sizing a buffer or queue between stages and needs the point that a bigger buffer absorbs bursts but cannot raise the throughput of the slower side.',
      'The article presents the classic two-semaphore solution and wants `empty` and `full` shown counting and handing permits over as a real exchange runs.',
    ],

    avoidWhen: [
      'The article needs a mutex guarding the buffer itself, or several producers and consumers. There is one of each and no third semaphore.',
      'The subject is message queues across machines, persistence or delivery guarantees. This is two threads and a bounded buffer in memory.',
      'The point is monitors or condition variables. The waiting here is done by semaphores alone.',
    ],

    contrastWith: [
      {
        concept: 'boundedBuffer',
        note: 'A bounded buffer on its own has two limits where an insert or removal cannot happen; with semaphores the blocked side sleeps and is woken instead of failing, and the buffer size becomes something to tune.',
      },
      {
        concept: 'countingPermits',
        note: 'A counting semaphore admits a fixed number of holders; in producer-consumer two of them count free and filled slots, and their initial values are the buffer size and zero.',
      },
      {
        concept: 'waitAndSignal',
        note: 'Sleeping until the other side changes the condition can be built from a mutex and condition variables that recheck in a loop; with semaphores the count itself carries the condition.',
      },
    ],
  },
};
