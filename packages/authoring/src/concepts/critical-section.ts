/**
 * criticalSection 개념 선언.
 *
 * canonical facet 은 `facet:criticalSection` — 스레드 A · B 가 같은 여섯 줄을 돈다. 공유 값은 `total`(100) 하나이고
 * 3 번(읽기) · 5 번(쓰기) 줄이 닿는다. 울타리가 3 ~ 5 번 줄에 선다(4 번은 닿지 않지만 갇힌다). 번갈아 도는 열세 틱 동안
 * 구역 안은 하나를 넘지 않고, 끝값 164 = 100 + 32 + 32. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `mutex` 는 `lock` · `unlock` 으로 구간을 감싼 뒤 모든 몫에서 끝값이 맞는지를 본다. 이쪽은 **구간이 어디서
 * 어디까지인가** 하나 — 공유 값에 닿는 첫 줄부터 끝 줄까지, 사이의 제 것 줄도 포함. 그래서 definition 은 first ·
 * last access · lines in between · outside interleave 를 독점하고, 자물쇠 · 주인 · 줄 서기는 쓰지 않는다(그것은
 * `lockExcludes`).
 *
 * 전제 (설명 글 `criticalSection.md`): CPU 하나 · 한 틱 한 줄 · A 부터 번갈아. 입구에서 비었나를 보는 일을 구역 첫 줄에
 * 붙여 두었다(실제는 앞뒤에 잡고 놓는 줄). 막힌 시도도 한 틱. 코드는 가상 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const criticalSectionConcept: FacetConceptSource = {
  id: 'criticalSection',
  label: 'Critical Section (Where It Starts and Ends)',
  canonicalFacet: 'facet:criticalSection',

  surface: {
    definition:
      'A critical section is the stretch of code from a thread\'s first to its last access of shared data, including private lines between them, that only one thread may occupy at a time while lines outside it interleave freely.',
    exemplarKeywords: [
      'critical section',
      'critical region',
      'where to put the lock',
      'lock granularity',
      'keep critical sections short',
      'mutual exclusion requirement',
      'entry and exit of critical section',
      'shared variable access',
    ],
  },

  briefing: {
    observable: [
      'Both threads run the same six lines: `let price = 30`, `let fee = 2`, `let seen = total`, `let next = seen + price + fee`, `total = next`, `show next`. A Shared value box shows `total` at 100; the other names are each thread\'s own.',
      'The lines touching `total` are marked "shared" — line 3 (read) and line 5 (write). A fence labelled "Critical section" goes up around lines 3 to 5; line 4, which never touches `total`, is fenced in because the value it computes must be written back before anyone else reads. Lines 1, 2 and 6 stay outside.',
      'A tick counter runs from Tick 0, one line per tick, A and B alternating. At ticks 0 to 3 both threads interleave their outside lines 1 and 2, and the fence reads "Inside: nobody".',
      'At tick 4 A enters ("Inside: A"). At tick 5 B reaches line 3 and sleeps at the entrance; the blocked try costs a tick. At tick 7 A writes `total` = 132 and leaves, and B is let in ("Inside: B").',
      'At tick 9 A runs its outside line 6 while B is still inside — outside lines keep running while the section is occupied. At tick 11 B writes 164 and leaves.',
      'Thirteen ticks in all; the fence never holds more than one thread. The final 164 = 100 + 32 + 32 keeps both additions, and `show next` prints 132 for A and 164 for B.',
      'The entry check is attached to the section\'s first line rather than written as separate lock and unlock lines, and the alternating order is one fixed example. The code uses a small language-neutral notation. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen marks the shared lines, raises the fence, then plays the thirteen ticks by itself and stops after tick 12.',
        'A Replay button and a playback strip sit below it. Holding tick 9 shows A running outside while B occupies the section.',
      ],
    },

    useWhen: [
      'The article asks where exactly a lock should go and needs the rule shown on real lines: from the first touch of shared data to the last, including a private line caught in between.',
      'A reader wonders whether protecting shared data means serializing whole threads; the outside lines that keep interleaving while the section is occupied show that it does not.',
    ],

    avoidWhen: [
      'The article is about the lock itself — ownership, waiting queues, hand-off. The entry here is a plain check on the first line.',
      'The subject is choosing between fine- and coarse-grained locks across many data structures. There is one shared value.',
      'The point is showing a wrong result. Both additions survive; the run is the protected one.',
    ],

    contrastWith: [
      {
        concept: 'lockExcludes',
        note: 'The critical section says which lines must be kept to one thread at a time; the lock is the mechanism that enforces it, with an owner and a queue.',
      },
      {
        concept: 'lostUpdate',
        note: 'The lost update is what happens when the read and the write of shared data are not held together; the critical section is the span that must be held together to prevent it.',
      },
      {
        concept: 'mutex',
        note: 'Drawing the section\'s boundaries is a question about one program\'s lines; the mutex question is whether guarding those lines gives the right count under every schedule, and at what cost.',
      },
    ],
  },
};
