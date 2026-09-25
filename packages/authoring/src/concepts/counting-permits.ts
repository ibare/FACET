/**
 * countingPermits 개념 선언.
 *
 * canonical facet 은 `facet:countingPermits` — 표 둘인 세마포어 `s` 와 스레드 넷(A 는 `work()` 둘, B · C · D 는 하나).
 * 틱 0 · 1 에 A · B 가 표를 가져가 0, 틱 2 · 3 에 C · D 가 줄에 잠든다. 틱 7 에 먼저 나오는 것은 B(먼저 들어간 A 가
 * 아니다)이고 표는 수를 거치지 않고 C 에게, 틱 9 에 A 의 표가 D 에게. 틱 10 · 12 에 줄이 비어 표가 1 · 2 로 는다.
 * 열세 틱. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `producerConsumer` 는 세마포어 둘(`empty` · `full`)의 표 수와 줄로 버퍼 칸 수를 튜닝한다. 이쪽은 **세마포어
 * 하나의 동작** — 정한 수만큼 들이고, 떨어지면 잠들고, 돌려준 표는 줄 맨 앞에게 곧바로, 누가 쥐었는지는 세지 않는다 —
 * 을 쥔다. 그래서 definition 은 counting semaphore · permits · set number · no record of which thread 를 독점한다.
 *
 * 전제 (설명 글 `countingPermits.md`): CPU 하나 · 한 틱 한 줄 · A B C D 차례 돌림 · 막힌 시도도 한 틱 · 넘겨주기 규약.
 * 코드는 가상 표기(`acquire` · `release` — `P()` / `V()` 가 아니다).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const countingPermitsConcept: FacetConceptSource = {
  id: 'countingPermits',
  label: 'Counting Semaphore (Permits, Not Owners)',
  canonicalFacet: 'facet:countingPermits',

  surface: {
    definition:
      'A counting semaphore admits up to a set number of threads by handing out permits; with none left, callers sleep in line, and a returned permit goes straight to the first sleeper, with no record of which thread holds one.',
    exemplarKeywords: [
      'counting semaphore',
      'semaphore permits',
      'acquire and release',
      'P and V operations',
      'limit concurrent access',
      'connection pool limit',
      'java.util.concurrent.Semaphore',
      'sem_wait',
      'semaphore versus mutex',
    ],
  },

  briefing: {
    observable: [
      'Four threads each run `acquire(s)`, their work, `release(s)` — A has two `work()` lines, B, C and D one each. Areas read Not started, Inside, Finished and "Line (asleep)"; a counter shows "Permits in s", starting at 2.',
      'Tick 0 "Thread A takes a permit and goes in. Left: 1", tick 1 the same for B, "Left: 0". Ticks 2 and 3: "No permit left. Thread C lines up and sleeps." and then D.',
      'Tick 7: "Thread B releases. The permit goes straight to C. Left: 0" — B, which went in second, comes out first because its work is shorter, and the count never passes through 1. C goes on from its next line without calling `acquire` again.',
      'Tick 9: A\'s permit goes straight to D. Tick 10: "Thread C releases. No one waits, so the permit goes back. Left: 1"; tick 12, D releases and the count returns to 2.',
      'Thirteen ticks. At most two threads are inside at any moment, permits left plus threads inside always make 2, and C slept five ticks, D six.',
      'One CPU runs one line (or one blocked attempt) per tick, turning through A, B, C, D and skipping sleepers. The code uses a small language-neutral notation. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the thirteen ticks by itself and stops when the permit count is back at 2.',
        'A Replay button and a playback strip sit below it. Holding tick 7 shows a permit leaving B and arriving at C while the counter stays at 0.',
      ],
    },

    useWhen: [
      'The article introduces semaphores as a way to let a fixed number of threads in at once — a pool of connections or workers — and needs the count, the queue and the release shown together.',
      'A reader asks how a semaphore differs from a mutex; B releasing a permit that C then uses, with no owner in the picture, makes the difference concrete.',
    ],

    avoidWhen: [
      'The article is about binary semaphores used for signalling between two threads. The permits here limit how many are inside.',
      'The subject is the producer-consumer arrangement with two semaphores. There is one semaphore and no buffer.',
      'The point is fairness or starvation among waiters. The queue is served strictly in arrival order and everyone finishes.',
    ],

    contrastWith: [
      {
        concept: 'lockExcludes',
        note: 'A lock admits one thread and has an owner who must release it; a semaphore admits a set number and only counts permits, so any thread\'s release frees a place.',
      },
      {
        concept: 'producerConsumer',
        note: 'One semaphore limits entry to a set number; two semaphores counting free and filled slots coordinate a producer and a consumer through a buffer.',
      },
    ],
  },
};
