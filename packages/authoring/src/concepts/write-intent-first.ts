/**
 * writeIntentFirst 개념 선언.
 *
 * canonical facet 은 `facet:writeIntentFirst` — 데이터 블록 하나를 덧붙이는 변경이 바꾸는 블록 셋(Bitmap · Inode · Data)이
 * 먼저 저널에 Begin · 셋 · End 로 쌓이고, 끝 표식 뒤에야 제자리로 하나씩 옮겨진다. 쓰기 여덟(저널 5 · 제자리 3), 마지막에
 * 저널을 비운다. 스스로 재생하고 멈춘다. 끊김은 없다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `journaling` 은 끊는 때를 옮기며 저널 있음 · 없음을 견준다. `replayAfterCrash` 는 끊긴 뒤의 복구다. 이쪽은 끊김이
 * 없는 한 번의 **쓰기 차례** 하나 — 저널이 먼저, 끝 표식(commit)이 경계, 제자리가 나중. 그래서 definition 은 order ·
 * commit record · only then · home locations · checkpoint 쪽 낱말을 쥐고, crash · torn · recovery 를 쓰지 않는다.
 *
 * 전제: 데이터 블록까지 저널에 적는다(`data=journal`). 블록은 옛 · 새 두 상태. 쓰기 하나가 걸음 하나이고 저널 비우기도
 * 걸음 하나로 친다. 실제 시스템은 여러 변경을 한 묶음에 모으고 시작 표식과 블록을 한꺼번에 내보내기도 한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const writeIntentFirstConcept: FacetConceptSource = {
  id: 'writeIntentFirst',
  label: 'Journal First, Home Locations After the Commit',
  canonicalFacet: 'facet:writeIntentFirst',

  surface: {
    definition:
      'A journaling file system first writes a transaction\'s new blocks into the journal and seals them with a commit record; only then are the same blocks copied to their home locations.',
    exemplarKeywords: [
      'write-ahead logging',
      'commit record',
      'journal commit',
      'checkpointing',
      'jbd2',
      'transaction begin and end',
      'order of writes in a journal',
      'why journaling writes data twice',
      'log then apply',
    ],
  },

  briefing: {
    observable: [
      'The change is stated at the top: "Change: append one data block. Blocks it changes: 3". Two areas stand side by side: a "Journal" and "Home locations" holding Bitmap, Inode and Data, all marked old.',
      'The first five writes all go to the journal: "To the journal: begin mark — transaction 1", then "new content — Bitmap", "— Inode", "— Data", and "To the journal: end mark — transaction 1. Home writes may start now." Each entry carries its write number 1 to 5 while every home block stays old.',
      'Only after the end mark do writes 6, 7 and 8 copy the new contents home one by one: "From the journal to its home: Bitmap", then Inode, then Data, each home block turning new.',
      'The last step clears the journal: "Home blocks now new: 3. Cleared from the journal: transaction 1". Counters end at "Journal writes: 5 · Home writes: 3", next to "Writes without a journal: 3".',
      'Data blocks are journaled too, as in ext3/ext4 `data=journal`; the common default `data=ordered` writes data in place first and journals only metadata, which changes the count. Block contents are only old or new, one write is one step, and the clearing step is a mark rather than a write. Real systems batch several changes into one transaction.',
    ],

    screen: {
      affordances: [
        'The screen plays the nine steps by itself — five journal writes, three home writes and the clearing — and stops.',
        'A Replay button and a playback strip sit below it. Dragging the strip to the end-mark step holds the moment the journal is complete while every home block is still old.',
        'Write numbers and counts are fixed, so an article can quote them exactly.',
      ],
    },

    useWhen: [
      'The article needs the exact order of writes in journaling: everything into the journal, the commit record, and only then the home locations.',
      'A reader asks why a journaled update writes the same content twice, and the article wants the count of five journal writes against three home writes laid out one by one.',
    ],

    avoidWhen: [
      'The article is about what happens after a crash. Nothing is interrupted here.',
      'The subject is metadata-only journaling as used by default in ext4. Data blocks go through the journal in this model.',
      'The point is batching many changes into one transaction or group commit. There is a single change.',
    ],

    contrastWith: [
      {
        concept: 'journaling',
        note: 'The write order is the rule itself; the consistency claim follows from it by asking what a crash at each point in that order would leave behind.',
      },
      {
        concept: 'replayAfterCrash',
        note: 'Writing the end mark before any home write is what later lets recovery decide by one test, whether the mark exists, to redo a transaction or drop it.',
      },
    ],
  },
};
