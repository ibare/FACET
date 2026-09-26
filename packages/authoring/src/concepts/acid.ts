/**
 * acid 개념 선언.
 *
 * canonical facet 은 `facet:acid` — 줄 a · b · c · d(모두 100)에서 트랜잭션 넷이 차례로 돈을 옮긴다(사건 열둘, 틱 = LSN).
 * 손잡이 둘 — 커밋 방식(내린 뒤 OK / 모아 내림 / OK 먼저, 처음 OK 먼저) · 끊는 틱(4 · 6 · 9 · 11, 처음 9). 끊기면 메모리가
 * 사라지고, 다시 켜면 로그 파일에 커밋 기록이 있는 트랜잭션만 다시 한다. 끊는 틱 9 에서 잃은 OK 는 0 · 0 · 2.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * 조각 둘은 각각 한 장면이다 — 실패한 문장 뒤 되돌림 기록을 거꾸로 되감기(`allOrNothing`) · 커밋 기록이 디스크에 닿은
 * 뒤에야 OK(`durableAfterCommit`). 이쪽은 **OK 를 주는 때를 옮기면 끊김 하나가 OK 받은 트랜잭션을 몇이나 지우는가**를
 * 견준다. 그래서 definition 은 acknowledge · before / after the flush · group commit · erase 쪽 낱말을 쥐고, 조각들이
 * 독점한 undo log · reverse order · CHECK · redo rebuilds · memory only 를 쓰지 않는다.
 *
 * 전제 (설명 글 `acid.md`): 체크포인트 없음 — 데이터 파일은 끊기기 전까지 바뀌지 않는다. 5 틱 주기와 값은 예로 정한 것.
 * 모아 내림은 그룹 커밋, OK 먼저는 PostgreSQL `synchronous_commit = off` 에 가깝다. 코드 패널은 IR 하나를 여섯 언어로.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const acidConcept: FacetConceptSource = {
  id: 'acid',
  label: 'ACID (When a Commit Acknowledgement Survives a Crash)',
  canonicalFacet: 'facet:acid',

  surface: {
    definition:
      'Whether a database acknowledges a commit before or after flushing the log decides how many acknowledged transactions a crash can erase; group commit trades delay for safety, and no transaction survives half applied.',
    exemplarKeywords: [
      'ACID',
      'ACID properties',
      'atomicity and durability',
      'write-ahead logging',
      'WAL',
      'group commit',
      'synchronous_commit off',
      'innodb_flush_log_at_trx_commit',
      'fsync on commit',
      'acknowledged commit lost after crash',
      'crash recovery',
      'durability vs latency trade-off',
    ],
  },

  briefing: {
    observable: [
      'A Memory band holds the Log buffer and the Buffer pool; a Disk band holds the Log file and the Data file. A tick row runs 1 to 12. Rows a, b, c, d start at 100; T1 moves 10 from a to b, T2 20 from b to c, T3 30 from c to d, T4 40 from d to a — two writes and a commit each, one event per tick.',
      'Each write appends a record like `<T1, a, 100, 90>` to the log buffer and changes the buffer pool; a commit appends `<T1, commit>`. The data file is never touched before the crash. An OK tag ("T1 OK") marks when each transaction got its answer.',
      'Under "Flush, then OK" the log buffer is flushed at every commit and the OK follows. Under "Group flush" the OK slides forward to the next periodic flush at tick 5 or 10. Under "OK first" the OK sits right beside the commit record while flushing still happens only every 5 ticks.',
      'At the crash tick the memory band empties. Restart reads the log file in LSN order: "Restart · T1: commit record in the log file — redo", or "— skip" with that transaction\'s log entries struck through. In the default round (OK first, crash after 9) T2\'s two writes are in the log file without `<T2, commit>`, so both are skipped: b stays 110 and c stays 100.',
      'The round ends "OKs sent: 3 · lost OKs: 2 · records in the log file: 5", and the OK tags of T2 and T3 fall away into the empty memory band. At crash tick 9 the three modes read: flushes 3 / 1 / 1, OKs sent 3 / 1 / 3, lost OKs 0 / 0 / 2.',
      'Under "Flush, then OK" lost OKs stay 0 at every crash tick; under "OK first" they run 1, 1, 2, 0 across ticks 4, 6, 9, 11, dropping to 0 once a periodic flush has passed. In every combination no transaction ends with only one of its two writes in the data file.',
      'The model has no checkpoint, so every value in the data file after restart was redone from the log. The 5-tick flush period and all values are chosen for the example. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Commit mode" with Flush, then OK / Group flush / OK first (starting at OK first), and "Crash after tick" 4, 6, 9 or 11 (starting at 9). Each round plays to the restart verdict, then waits.',
        'The move that makes the idea land is holding the crash tick and switching the commit mode: the OK tags shift relative to the flushes, and the Lost OKs readout changes while no half transaction ever appears.',
        'Readouts under the controls: Log flushes, OKs sent and Lost OKs.',
        'The code panel, labelled "Commit and restart", starts empty with a "+ Add language" button; the chosen language shows `runCommits`, which tracks the logged and flushed LSNs and returns the number of lost OKs. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains what a database really promises when it answers a commit, and needs the case where an early answer is later contradicted by recovery set beside the settings where it cannot be.',
      'A reader weighs group commit or asynchronous commit against per-commit flushing and wants the three costs — flushes, answers delayed, answers broken — counted on the same workload.',
    ],

    avoidWhen: [
      'The article is about isolation between concurrent transactions. These transactions run strictly one after another; nothing overlaps.',
      'The subject is checkpoints, page flushing or ARIES-style undo of uncommitted pages on disk. The data file is never written before the crash here.',
      'The point is consistency constraints such as CHECK or foreign keys. No constraint is checked in this model.',
    ],

    contrastWith: [
      {
        concept: 'allOrNothing',
        note: 'Undoing a failed transaction from its undo log is atomicity for a single transaction that hits an error; the durability question is which already-answered transactions a power loss can take back.',
      },
      {
        concept: 'durableAfterCommit',
        note: 'The rule that the answer follows the flush of the commit record is the safe order in isolation; weighing it against group flushing and early answers shows what each alternative costs or breaks.',
      },
      {
        concept: 'journaling',
        note: 'A file-system journal protects a multi-block update from being torn; a database commit log also has to decide when to tell the client the work is safe, and that promise is what can be broken.',
      },
      {
        concept: 'isolation',
        note: 'Atomicity and durability concern one transaction against a crash; isolation concerns what concurrent transactions may see of each other while they run.',
      },
    ],
  },
};
