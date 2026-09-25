/**
 * lockExcludes 개념 선언.
 *
 * canonical facet 은 `facet:lockExcludes` — 스레드 A · B · C 가 같은 세 줄 `lock(m)` · `work()` · `unlock(m)` 을 돈다.
 * A 가 틱 0 에 잡고, B · C 는 틱 1 · 2 에 막혀 줄에 잠든다. A 가 틱 4 에 놓자 자물쇠는 비지 않고 줄 맨 앞 B 에게 곧바로
 * 넘어가고, 틱 6 에 B → C, 틱 8 에 C 가 놓을 때 줄이 비어 풀린다. 아홉 틱. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `mutex` 는 자물쇠를 켜고 끄며 공유 값의 끝값과 대가(틱 · 막힌 시도)를 몫마다 잰다. 이쪽은 **자물쇠 하나의
 * 동작** — 주인 자리 하나 · 줄에서 잠듦 · 놓으면 줄 맨 앞에게 넘김 — 을 쥔다. 그래서 definition 은 owner · queue ·
 * sleeps · hands ownership 을 독점하고, 공유 값 · 끝값 · 몫은 쓰지 않는다.
 *
 * 전제 (설명 글 `lockExcludes.md`): CPU 하나 · 한 틱 한 줄 · 막힌 시도도 한 틱 · A B C 차례의 돌림. 놓을 때 곧바로
 * 넘기는 방식은 운영체제마다 다르다(깨우기만 하고 다시 다투게 하는 구현도 흔하다). 코드는 가상 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const lockExcludesConcept: FacetConceptSource = {
  id: 'lockExcludes',
  label: 'A Lock Has One Owner and a Queue',
  canonicalFacet: 'facet:lockExcludes',

  surface: {
    definition:
      'A lock has a single owner: a thread calling lock while another holds it sleeps in the lock\'s queue and runs nothing, and unlock passes ownership straight to the head of that queue rather than leaving the lock free.',
    exemplarKeywords: [
      'lock owner',
      'mutex wait queue',
      'blocking lock',
      'lock acquire and release',
      'threads sleep on a lock',
      'lock handoff',
      'FIFO lock',
      'sleeping lock versus spinlock',
      'contended lock',
    ],
  },

  briefing: {
    observable: [
      'A lock `m` with an Owner seat and a Queue sits in the middle; around it are Ready and Done areas. Threads A, B and C each show the same three lines: `lock(m)`, `work()`, `unlock(m)`. The start reads "Owner of m: none."',
      '"Tick 0 · A runs lock(m). It was free. Owner: A." Then "Tick 1 · B runs lock(m). Owner is A, so B sleeps at the back of the queue." and the same for C at tick 2.',
      'Sleeping threads are skipped, so tick 3 goes back to A: "A runs work() in the owner seat. The queue stays asleep."',
      '"Tick 4 · A runs unlock(m). Handed straight to B, who wakes and goes on at work()." The lock never becomes free in between, and B does not run `lock(m)` again. The same hand-off happens from B to C at tick 6.',
      '"Tick 8 · C runs unlock(m). Nobody is waiting. Owner: none." Nine ticks in all: two failed lock attempts, two hand-offs, never more than one owner, and no queued thread runs a line.',
      'One CPU runs one line (or one blocked attempt) per tick, turning through A, B, C. Handing the lock straight to the first waiter is one policy; many systems only wake the waiter and let it compete again. The code uses a small language-neutral notation. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the nine ticks by itself and stops after C releases the lock.',
        'A Replay button and a playback strip sit below it. Holding tick 4 shows the owner seat passing directly from A to B without an empty moment.',
      ],
    },

    useWhen: [
      'The article explains what happens to a thread that tries to take a lock already held — it sleeps in a queue rather than spinning or failing — and how it later gets in.',
      'A reader pictures a released lock as up for grabs; the direct hand-off to the first waiter, with no free moment, is the behaviour to show.',
    ],

    avoidWhen: [
      'The article is about spinlocks or busy-waiting. Blocked threads sleep and run nothing.',
      'The subject is why shared data needs a lock at all or what goes wrong without one. There is no shared value; `work()` stands in for the protected work.',
      'The point is several locks or deadlock. There is only one lock.',
    ],

    contrastWith: [
      {
        concept: 'mutex',
        note: 'One lock\'s owner-and-queue behaviour is the mechanism; using it to make a shared counter correct under every schedule, and counting its cost, is the application.',
      },
      {
        concept: 'criticalSection',
        note: 'The lock enforces exclusion; the critical section is the choice of which lines need that exclusion.',
      },
      {
        concept: 'countingPermits',
        note: 'A lock admits one thread and knows which thread owns it; a counting semaphore admits a set number and tracks only how many permits are left, not who holds them.',
      },
    ],
  },
};
