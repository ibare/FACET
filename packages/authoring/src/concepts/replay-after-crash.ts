/**
 * replayAfterCrash 개념 선언.
 *
 * canonical facet 은 `facet:replayAfterCrash` — 저널에 묶음 둘이 남은 채 전원이 끊겼다. 묶음 1(dir · inode-a · ibitmap)은
 * 끝 표식까지 적혔고 제자리엔 dir 만 옮겨졌다. 묶음 2(inode-b · data-b)는 끝 표식이 없다. 다시 켜면 훑어서 묶음 1 은
 * 다시 쓰고(이미 새것인 dir 도 다시), 묶음 2 는 버리고, 저널을 비운다. 일곱 걸음, 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `writeIntentFirst` 는 끊김 없는 쓰기 차례, 완제품 `journaling` 은 끊는 때를 옮기며 저널 있음 · 없음을 견준다. 이쪽은
 * **다시 켠 뒤의 결정** 하나 — 끝 표식이 있는 묶음은 처음부터 통째로 다시, 없는 묶음은 버린다. 그래서 definition 은
 * recovery · reboot · scans · commit record present or missing · rewrites even blocks already written · discards 쪽 낱말을
 * 쥐고, 쓰기 차례와 저널 없는 경우를 말하지 않는다.
 *
 * 전제: 블록 내용은 옛 · 새 둘, 이름은 설명을 위한 것. 데이터 블록(data-b)도 저널에 적는다. 실제 jbd2 는 묶음 번호와
 * 끝 표식 검사합으로 반쯤 적힌 끝 표식도 가려내고 여러 묶음을 한 번에 다시 쓴다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const replayAfterCrashConcept: FacetConceptSource = {
  id: 'replayAfterCrash',
  label: 'Journal Replay After a Crash',
  canonicalFacet: 'facet:replayAfterCrash',

  surface: {
    definition:
      'On reboot, journal recovery scans the log, rewrites every block of each transaction that has a commit record, even blocks already in place, and discards transactions whose commit record is missing.',
    exemplarKeywords: [
      'journal recovery',
      'journal replay',
      'redo log',
      'idempotent replay',
      'uncommitted transaction discarded',
      'mount after unclean shutdown',
      'recovering from power loss',
      'e2fsck journal replay',
      'all or nothing after a crash',
    ],
  },

  briefing: {
    observable: [
      'The "Journal" holds eight records: Begin 1, `dir`, `inode-a`, `ibitmap`, End 1, then Begin 2, `inode-b`, `data-b` — with no End 2. A "power lost" mark separates it from the "Home locations", where `dir` is new and `inode-a`, `ibitmap`, `inode-b`, `data-b` are old. The status reads "Power is back. Journal records left: 8".',
      'Two scan steps judge each transaction: "Transaction 1: end mark found — replay it" and "Transaction 2: no end mark — discard it". The discarded counter jumps to 2 at once.',
      'Three rewrite steps copy transaction 1 home in journal order. The first reads "Rewrite dir: new → new — written again anyway"; then "Rewrite inode-a: old → new" and "Rewrite ibitmap: old → new". Each rewritten block is tagged "rewritten".',
      'The last step shows "Journal emptied" with "Rewritten blocks: 3 · Discarded blocks: 2". All of transaction 1 is new, all of transaction 2 is old: one happened completely, the other not at all.',
      'Recovery does not resume from where the power failed; the journal does not record how far home writing got, so a committed transaction is copied again from its start. Block contents are only old or new, and the block names are for explanation. Data blocks are journaled here too; real jbd2 also checksums its end marks and replays many transactions together.',
    ],

    screen: {
      affordances: [
        'The screen plays seven steps by itself — the crashed state, two scans, three rewrites and the clearing — and stops.',
        'A Replay button and a playback strip sit below it. Dragging the strip to the first rewrite holds the moment an already-new block is written again.',
        'The journal contents and counts are fixed, so an article can quote them exactly.',
      ],
    },

    useWhen: [
      'The article explains what a journaling file system does at mount after a power cut: which transactions it redoes, which it drops, and why an incomplete one simply vanishes.',
      'A reader assumes recovery "continues where it stopped", and the article needs the counterexample of a block already written being written again because replay is safe to repeat.',
    ],

    avoidWhen: [
      'The article is about the order of writes during normal operation. The screen begins after the crash.',
      'The subject is undo logging or rolling back partial database transactions. Uncommitted work here is dropped from the journal, never undone on disk.',
      'The point is comparing a system with and without a journal. Only the journaled case is shown.',
    ],

    contrastWith: [
      {
        concept: 'writeIntentFirst',
        note: 'That rule decides what can be in the journal at a crash; recovery is what reads it back and turns the end mark into a keep-or-drop decision.',
      },
      {
        concept: 'journaling',
        note: 'Replay handles one crashed journal. The claim that every crash point ends all-old or all-new, and the comparison with no journal at all, sits a level above it.',
      },
    ],
  },
};
