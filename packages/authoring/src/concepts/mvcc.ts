/**
 * mvcc 개념 선언.
 *
 * canonical facet 은 `facet:mvcc` — 줄 `price` 30 에 T1 ~ T4 가 틱 3 · 5 · 7 · 9 에 31 ~ 34 를 커밋해 판이 쌓인다. 읽는 이 TR 은
 * 시작 틱(손잡이 2 ~ 10, 처음 4)에 첫 읽기, 틱 11 에 둘째 읽기, 끝까지 열려 있다. 틱 12 에 청소. 손잡이 둘 — 스냅샷(트랜잭션마다 /
 * 문장마다, 처음 트랜잭션마다) · 시작 틱. 트랜잭션마다면 청소 뒤 판 수 5 · 4 · 3 · 2 · 1, 문장마다면 늘 1 이고 둘째 읽기는 늘 34.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * 조각 둘은 한 장면씩 — 쓰기가 옛 판 곁에 새 판을 얹고 커밋이 두 틱을 찍음(`keepOldVersion`) · 두 트랜잭션이 제 스냅샷이 떨어지는 판을
 * 집음(`readSeesSnapshot`). 이쪽은 **스냅샷을 얼마나 오래 쥐는가가 청소가 거둘 수 있는 판을 정한다**를 쥔다. 그래서 definition 은
 * how long · per transaction or per statement · vacuum · reclaim · pins 를 쥐고, 조각들이 독점한 appends · stamps · interval covers ·
 * two readers 를 쓰지 않는다.
 *
 * 전제 (설명 글 `mvcc.md`): 청소 규칙을 "열린 트랜잭션이 쥔 가장 이른 스냅샷" 하나로 줄였다(PostgreSQL VACUUM 의 xmin 지평선이
 * 그 뜻). 틱은 차례를 세는 수. 쓰기는 저절로 커밋되는 UPDATE. 코드 패널은 IR 하나를 여섯 언어로.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const mvccConcept: FacetConceptSource = {
  id: 'mvcc',
  label: 'MVCC (Snapshot Lifetime and Vacuum)',
  canonicalFacet: 'facet:mvcc',

  surface: {
    definition:
      'In MVCC, how long a reader keeps its snapshot — the whole transaction or one statement — decides which old versions vacuum may reclaim; an early, long-open transaction pins every version from the one it sees onward.',
    exemplarKeywords: [
      'MVCC',
      'multiversion concurrency control',
      'VACUUM',
      'dead tuples',
      'table bloat',
      'long-running transaction blocks vacuum',
      'xmin horizon',
      'undo log purge',
      'snapshot per transaction vs per statement',
      'PostgreSQL REPEATABLE READ vs READ COMMITTED',
      'garbage collection of row versions',
    ],
  },

  briefing: {
    observable: [
      'Row `price` starts as one version, 30 over `[1, ∞)`, marked "current version". The start reads "price=30 has one version. Snapshot: Per transaction · TR starts at tick 4". Reader TR has two slots, First read and Second read.',
      'Writers commit at ticks 3, 5, 7, 9: "Tick 3 · T1 commits price=31 — versions: 2". Each commit closes the previous current version at that tick and appends a new one, so the chain grows to 30 `[1, 3)` · 31 `[3, 5)` · 32 `[5, 7)` · 33 `[7, 9)` · 34 `[9, ∞)`.',
      'TR\'s first read at its start tick drops a "Snapshot 4" line onto the chain: "Tick 4 · read with snapshot 4 → 31 (version from tick 3); snapshot kept". At tick 11 the second read uses the same snapshot and again gets 31.',
      '"Tick 12 · vacuum keeps what snapshot 4 can see — kept: 4, freed: 1": the version before the snapshot line falls away and the rest close up, the line following its version.',
      'Per transaction, starting at ticks 2, 4, 6, 8, 10 gives reads 30, 31, 32, 33, 34 and leaves 5, 4, 3, 2, 1 versions after vacuum — the earlier the reader started, the more it keeps alive.',
      'Per statement, the first read reports "snapshot let go" and its line turns dashed; the second read takes a fresh snapshot at tick 11 and gets 34, and vacuum, with no snapshot held, keeps only the current version.',
      'The vacuum rule is reduced to "the earliest snapshot held by an open transaction"; PostgreSQL\'s VACUUM works from an xmin horizon counted in transaction ids, which a long-open transaction holds back in the same way. Ticks count events, not clock time. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Snapshot", Per transaction or Per statement (starting Per transaction), and "Reader start tick" 2, 4, 6, 8 or 10 (starting at 4). Each round plays eight steps, then waits.',
        'The move that makes the idea land is sliding the reader start tick earlier and later under Per transaction — the snapshot line moves along the chain and the number of versions vacuum can free changes with it — then switching to Per statement and seeing everything but the current version go.',
        'Readouts under the controls: First read, Second read, Versions and Freed versions.',
        'The code panel, labelled "Version chain code", starts empty with a "+ Add language" button; the chosen language shows `readVersion`, `commitVersion` and `vacuum`. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why a long-running or idle-in-transaction session makes tables bloat, and needs the link from one old snapshot to the versions vacuum cannot remove.',
      'A reader compares transaction-level and statement-level snapshots and wants both costs on one screen: stable reads that hold storage, or fresh reads that free it.',
    ],

    avoidWhen: [
      'The article is about write conflicts between concurrent writers under MVCC, such as first-committer-wins. Only one reader and non-overlapping writers appear.',
      'The subject is lock-based isolation. No transaction ever waits here.',
      'The point is the physical layout of versions, such as heap tuples versus undo segments. Versions are drawn as one abstract chain.',
    ],

    contrastWith: [
      {
        concept: 'keepOldVersion',
        note: 'Appending versions instead of overwriting is what creates the chain; how long the chain must be kept depends on the oldest snapshot still in use.',
      },
      {
        concept: 'readSeesSnapshot',
        note: 'The visibility rule picks one version per snapshot; the lifetime of that snapshot is what determines how many older versions must survive.',
      },
      {
        concept: 'isolation',
        note: 'Lock-based isolation makes readers and writers wait for each other; multiversioning removes that wait and pays for it in retained versions and cleanup.',
      },
      {
        concept: 'nonRepeatableRead',
        note: 'A fresh snapshot per statement lets two reads in one transaction differ, the same anomaly READ COMMITTED allows under locking; one snapshot per transaction keeps them equal.',
      },
    ],
  },
};
