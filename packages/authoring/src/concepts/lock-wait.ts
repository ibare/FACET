/**
 * lockWait 개념 선언.
 *
 * canonical facet 은 `facet:lockWait` — 남은 자리 10 인 줄 `ticket` 을 T1 · T2 · T3 이 X 잠금으로 줄인다. T1 이 잡고 8 을 쓴 뒤에도
 * 놓지 않고, T2 · T3 은 온 차례로 대기열에 선다. T1 커밋 걸음에 T2 가 넘겨받아 5 를, T2 커밋에 T3 이 넘겨받아 4 를 쓴다.
 * 기다린 걸음 T2 2 · T3 3. 아홉 걸음, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 형제 `sharedVsExclusive` 는 허락 / 막힘의 한 칸이고, `growThenShrink` 는 한 트랜잭션이 잠금을 쥐는 윤곽이다. 이쪽은 **막힌
 * 요청이 언제 풀리는가 — 앞 트랜잭션의 쓰기가 아니라 커밋에서** 를 쥔다. 그래서 definition 은 waits in line · until the holder
 * commits · not when its write finishes · takes over 를 독점하고, compatible · lock point 를 쓰지 않는다.
 *
 * 전제 (설명 글 `lockWait.md`): 엄격한 2단계 잠금 · FIFO 대기열 · 놓기와 넘겨받기가 같은 걸음 · 줄 잠금만. 실제 엔진은 기다림에
 * 시간 제한을 두거나 교착을 찾아 되돌리기도 한다. 값은 예.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const lockWaitConcept: FacetConceptSource = {
  id: 'lockWait',
  label: 'Lock Wait (Blocked Until the Holder Commits)',
  canonicalFacet: 'facet:lockWait',

  surface: {
    definition:
      'A transaction asking for a row lock that another holds waits in line until the holder commits, not merely until its write finishes; the lock then passes to the first waiter, so each wait stretches over the earlier transactions.',
    exemplarKeywords: [
      'lock wait',
      'blocking in databases',
      'row lock contention',
      'lock queue',
      'waiting for a row lock',
      'long transactions block others',
      'lock_timeout',
      'innodb_lock_wait_timeout',
      'hot row',
      'serialized updates on one row',
    ],
  },

  briefing: {
    observable: [
      'Row `ticket` holds 10 and carries an "X lock" slot; beside it is a "Waiting line", and T1, T2, T3 start in "Not yet requested". The start reads "Row ticket: nobody holds the lock."',
      '"X1(ticket): granted. Lock holder: T1." then "W1(ticket=8): read 10, wrote 8." — the row is marked "Written, not committed", and T1 keeps the lock after its write.',
      '"X2(ticket): held by T1, so the request stops in line." and the same for X3. Each step spent in line adds a dot under that transaction.',
      '"C1: the commit releases the lock. Taken over by: T2. Steps waited: 2." The hand-over happens in the same step; T3 moves up one place. T2 reads the 8 T1 committed and writes 5.',
      '"C2: the commit releases the lock. Taken over by: T3. Steps waited: 3." T3 reads 5 and writes 4. "C3: the commit releases the lock. The line is empty." Final value 4; waits read T1 0, T2 2, T3 3.',
      'Locking is strict two-phase — locks are released at commit, not at the end of the statement. The line is first-come, first-served, and only row locks exist. Real engines also time out waits or break deadlocks by rolling one side back. Values are chosen for the example. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays the nine steps by itself and stops once the line is empty.',
        'A Replay button and a playback strip sit below it. Holding the step after T1\'s write shows the row already at 8 while T1 still holds the lock and two requests stand in line.',
      ],
    },

    useWhen: [
      'The article explains why a long-running transaction slows everyone touching the same row, and needs the point that the lock is kept after the write until commit.',
      'A reader investigating lock-wait timeouts wants to see how waits accumulate down a queue on a single hot row.',
    ],

    avoidWhen: [
      'The article is about deadlocks between transactions waiting on each other. The waits here form one straight line and always resolve.',
      'The subject is which lock modes are compatible. Every request here is exclusive.',
      'The point is optimistic concurrency or MVCC, where writers do not queue in this way.',
    ],

    contrastWith: [
      {
        concept: 'sharedVsExclusive',
        note: 'Compatibility decides that a request must wait; the lock wait is about how long, and that the end of the wait is tied to the holder\'s commit.',
      },
      {
        concept: 'lockExcludes',
        note: 'An operating-system lock is usually released when the protected code ends; a transaction keeps its row lock until commit, so the waiting extends over everything else the transaction does.',
      },
      {
        concept: 'deadlock',
        note: 'A single queue behind one holder always drains; deadlock needs waits that point back around in a cycle.',
      },
      {
        concept: 'growThenShrink',
        note: 'Two-phase locking forbids taking a lock after releasing one; holding every lock until commit is the strict form that makes waits end exactly at commits.',
      },
    ],
  },
};
