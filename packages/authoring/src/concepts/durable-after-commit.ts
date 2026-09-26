/**
 * durableAfterCommit 개념 선언.
 *
 * canonical facet 은 `facet:durableAfterCommit` — 위 띠 메모리(버퍼 풀 · 로그 버퍼), 아래 띠 디스크(데이터 파일 x 100 · y 50 ·
 * 로그 파일). W1(x=70) → C1 이 커밋 기록 LSN 2 를 붙임 → 로그 버퍼 전부가 로그 파일로 → 그제야 OK → W2(y=20) → 끊김 → 다시 하기로
 * x = 70 · y = 50. 일곱 걸음, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `acid` 는 OK 의 자리를 옮겨 가며 잃은 OK 를 센다. 이쪽은 **옳은 차례 하나** — 기록 · 내림 · OK — 와, 고친 값은
 * 메모리에만 있어도 로그에서 다시 세워진다는 것을 쥔다. 그래서 definition 은 commit record · reaches the log file · still
 * only in memory · redo rebuilds 를 독점하고, 형제가 쥔 acknowledge · group · erase · undo 를 쓰지 않는다.
 *
 * 전제 (설명 글 `durableAfterCommit.md`): 체크포인트 · 페이지 내보내기 없음. 그룹 커밋 · fsync · 디스크 캐시는 다루지 않는다.
 * 실제 엔진은 페이지를 내보내므로 undo 도 둔다(ARIES). 값은 예로 정한 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const durableAfterCommitConcept: FacetConceptSource = {
  id: 'durableAfterCommit',
  label: 'OK Comes Only After the Commit Record Reaches Disk',
  canonicalFacet: 'facet:durableAfterCommit',

  surface: {
    definition:
      'A commit returns OK only after its commit record reaches the log file on disk; the changed values may still live only in memory, because after power loss redo rebuilds them from that log.',
    exemplarKeywords: [
      'durability',
      'commit record',
      'log flush before commit returns',
      'redo log',
      'redo recovery',
      'dirty pages in the buffer pool',
      'LSN',
      'write-ahead log rule',
      'why data files lag behind the log',
      'survive power failure',
    ],
  },

  briefing: {
    observable: [
      'The top band is Memory, with the Buffer pool and the Log buffer; the bottom band is Disk, with the Data file (x 100, y 50) and the Log file. The start caption reads "Nothing has run yet. The data file on disk holds the starting values."',
      '"W1(x=70): record LSN 1 goes to the log buffer, the new value to the buffer pool." The data file still reads x 100.',
      'The commit takes three steps: "C1: commit record LSN 2 goes to the log buffer.", then "The whole log buffer lands in the log file on disk. LSN: 1, 2", then "Only now does OK go back. To: T1". The data file is untouched throughout.',
      '"W2(y=20)" adds LSN 3 in memory. Then "Crash. Memory is wiped: buffer pool and log buffer." with "Lost LSN: 3. Kept on disk, LSN: 1, 2" — at that moment the data file still holds x 100.',
      '"Restart: redo from the log file into the data file. LSN: 1 · Got OK: T1. Never got OK: T2". The data file ends x 70, y 50: the value T1 was promised survives, and T2 leaves nothing because its record never reached disk.',
      'The model has no checkpoint and never writes pages from the buffer pool to the data file, so redo reads the log from the beginning. Group commit, fsync and disk caches are out of scope. Values are chosen for the example. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays the seven steps by itself and stops after the redo.',
        'A Replay button and a playback strip sit below it. Holding the step just before the OK shows the commit record already on disk while x in the data file is still 100.',
      ],
    },

    useWhen: [
      'The article states the write-ahead rule — log first, answer second — and has to convince a reader that the data pages themselves need not be on disk when the commit returns.',
      'A reader wonders how a database can be fast if every commit must be durable; the point that only the small log record is forced, not the modified values, answers it.',
    ],

    avoidWhen: [
      'The article compares commit policies such as group commit or asynchronous commit. Only the safe order is shown.',
      'The subject is undoing a failed or aborted transaction. The uncommitted T2 simply never reached disk; nothing is undone.',
      'The point is replication to other machines. Durability here is one machine\'s disk.',
    ],

    contrastWith: [
      {
        concept: 'acid',
        note: 'Forcing the commit record before answering is one ordering; comparing it with answering first or batching flushes turns the rule into a trade-off with a measurable failure.',
      },
      {
        concept: 'allOrNothing',
        note: 'Redo brings back the effects of a transaction that committed; undo removes the effects of one that failed, so the two serve opposite outcomes.',
      },
      {
        concept: 'writeIntentFirst',
        note: 'Both put a sealed record in a log before the real location changes; a file-system journal guards block consistency, while a database commit log also governs when the client is told the work is safe.',
      },
      {
        concept: 'replayAfterCrash',
        note: 'Both replay only what the log marks as committed; the database version separates the moment of the answer from the moment the values reach their home.',
      },
    ],
  },
};
