/**
 * boundedBuffer 개념 선언.
 *
 * canonical facet 은 `facet:boundedBuffer` — 세 칸 버퍼, 넣는 쪽 P 와 꺼내는 쪽 C. 차례 `P P P P C C C C P C` 가
 * 정해져 있다. P 가 1 · 2 · 3 을 넣어 차고, 넷째에 물건 4 가 튕겨 나와 손에 남는다. C 가 1 · 2 · 3 을 넣은 차례로 꺼내고,
 * 여덟째에 빈손으로 돌아온다. P 가 4 를 넣고 C 가 꺼낸다. 막힌 차례 둘. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `producerConsumer` 는 세마포어가 막힌 쪽을 재우고 깨우며 칸 수를 튜닝한다. 이쪽은 **두 경계** — 가득 차면
 * 넣기가, 비면 꺼내기가 실패한다, 그리고 먼저 넣은 것부터 나온다 — 하나를 쥔다. 막힌 쪽은 잠들지 않고 차례를 넘긴다.
 * 그래서 definition 은 fixed-capacity · full · empty · both fail · first-in-first-out 을 독점하고, 세마포어 · 잠듦 ·
 * 속도 차이는 쓰지 않는다.
 *
 * 전제 (설명 글 `boundedBuffer.md`): 차례는 두 경계가 한 번씩 드러나도록 데이터로 정했다. 막힌 쪽은 그 차례를 그냥
 * 넘긴다 — 실제로는 잠들었다가 깬다(조건 변수 · 세마포어의 일).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const boundedBufferConcept: FacetConceptSource = {
  id: 'boundedBuffer',
  label: 'Bounded Buffer (Full Blocks Put, Empty Blocks Take)',
  canonicalFacet: 'facet:boundedBuffer',

  surface: {
    definition:
      'A fixed-capacity first-in-first-out buffer between a producer and a consumer has two limits: inserting into a full buffer and removing from an empty one both fail, while items leave in the order they entered.',
    exemplarKeywords: [
      'bounded buffer',
      'buffer full',
      'buffer empty',
      'fixed-size queue',
      'ring buffer capacity',
      'buffer overflow and underflow',
      'producer and consumer',
      'blocking queue capacity',
      'FIFO buffer',
    ],
  },

  briefing: {
    observable: [
      'A "Turns" row spells out the fixed order `P P P P C C C C P C`. Between Producer P (holding the next item number) and Consumer C sits a buffer of three slots ("Buffer slots: 3"). Counters read "Bounced" and "Empty-handed"; a "Taken" row collects what C removes.',
      'P puts items 1, 2 and 3 ("Put item 1." …) and the three slots fill.',
      'On the fourth turn: "All slots full — item 4 bounces back." Item 4 stays in P\'s hand, to be tried again with the same number; "Bounced: 1".',
      'C takes items 1, 2 and 3 in the order they went in; each time the front item leaves, the rest shift forward one slot.',
      'On the eighth turn: "All slots empty — the hand comes back empty."; "Empty-handed: 1".',
      'P then puts item 4 and C takes it. The Taken row reads 1, 2, 3, 4; two turns were blocked, one put and one take.',
      'The order of turns is fixed in the data so that each limit shows up once, and a blocked side simply loses its turn; in a real system it would sleep and be woken by the other side. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the ten turns by itself and stops after item 4 is taken.',
        'A Replay button and a playback strip sit below it. Holding the fourth turn shows item 4 bouncing off the full buffer.',
      ],
    },

    useWhen: [
      'The article sets up the producer-consumer problem and first needs its two boundary cases — full on insert, empty on remove — seen plainly before any synchronization is introduced.',
      'A reader needs the idea of a buffer with fixed capacity and first-in-first-out order in one concrete run, with the failed attempts counted.',
    ],

    avoidWhen: [
      'The article is about how threads sleep and are woken at the limits. Blocked turns are simply skipped here.',
      'The subject is choosing a buffer size or the effect of speed differences. The capacity and turn order are fixed.',
      'The point is ring-buffer index arithmetic. Items shift forward rather than a head and tail wrapping around.',
    ],

    contrastWith: [
      {
        concept: 'producerConsumer',
        note: 'The bounded buffer only says where inserting and removing must stop; the producer-consumer solution decides what the blocked side does instead — sleep until the other side makes room or adds an item.',
      },
      {
        concept: 'waitAndSignal',
        note: 'Hitting a full or empty buffer is the condition; sleeping on it and being woken when it changes is the job of a wait-and-signal mechanism.',
      },
    ],
  },
};
