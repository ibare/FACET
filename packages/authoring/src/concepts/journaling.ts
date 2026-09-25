/**
 * journaling 개념 선언.
 *
 * canonical facet 은 `facet:journaling` — 블록 셋(bitmap · inode · data)을 함께 바꾸는 한 변경을 두 줄로 나란히 둔다.
 * 위 줄은 저널 없이 제자리에 셋(쓰기 3), 아래 줄은 저널에 BEGIN · 셋 · END 를 적고 제자리에 셋(쓰기 8). 손잡이
 * "Writes before crash"(0~8, 처음 2)가 끊는 때를 정하고, 두 줄은 같은 자리에서 끊긴다. 다시 켠 뒤 저널 없는 줄은
 * 1 · 2 에서만 어긋나고, 저널 줄은 4 까지 옛것 · 5 부터 새것으로 한꺼번에 넘어간다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * 조각 둘은 각각 한 장면이다 — 저널에 먼저 적고 끝 표식 뒤에 옮기는 쓰기 차례(`writeIntentFirst`) · 다시 켠 뒤 저널을
 * 훑어 다시 쓰거나 버리는 복구(`replayAfterCrash`). 이쪽은 그 둘을 한 판에 잇고 **끊는 때를 옮기며 저널 있음 · 없음을
 * 견주는 것**을 맡는다. 그래서 definition 은 crash point · all-old or all-new · torn · without a journal · extra writes 쪽
 * 낱말을 쥐고, 조각들이 독점한 commit record 차례 · scan · discard · idempotent 를 쓰지 않는다.
 *
 * 전제 (설명 글 `journaling.md` 가 밝힌 것):
 *  - 데이터 블록까지 저널에 적는다(ext3 · ext4 의 `data=journal`). 흔한 기본값 `data=ordered` 는 메타데이터만 적는다.
 *  - 블록 상태는 옛것 · 새것 둘. 쓰기는 통째로 적히거나 안 적히며, 반쯤 적힌 쓰기는 없다.
 *  - 저널 비우기는 걸음이 아니다. 저널 없는 줄은 fsck 를 돌리지 않은 상태다 — "어긋남" 은 고칠 수 없다는 뜻이 아니다.
 *  - 코드 패널은 저널 줄만 따라간다. IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const journalingConcept: FacetConceptSource = {
  id: 'journaling',
  label: 'Journaling (Crash Consistency With and Without a Journal)',
  canonicalFacet: 'facet:journaling',

  surface: {
    definition:
      'An update touching several blocks can be torn by a crash between its writes; journaling makes it come back all-old or all-new wherever the crash falls, at the cost of extra writes.',
    exemplarKeywords: [
      'crash consistency',
      'journaling file system',
      'power failure during a write',
      'torn update',
      'inconsistent file system after crash',
      'fsck',
      'ext3 ext4 journal',
      'data=journal vs data=ordered',
      'atomic multi-block update',
      'write amplification of journaling',
    ],
  },

  briefing: {
    observable: [
      'Two rows share one time axis of eight write slots, "write 1" to "write 8". The "No journal" row writes `bitmap`, `inode`, `data` straight "in place". The "Journal" row (marked "code panel follows") writes `BEGIN`, `bitmap`, `inode`, `data`, `END` "into the journal", then the same three "in place". Each row ends in an "after restart" set of three blocks.',
      'A "crash" line stands at the handle\'s value. Each step advances both rows by one write, e.g. "Write 1 · journal row: BEGIN → journal · no-journal row: bitmap → in place". Writes beyond the line never happen.',
      'At the crash the journal row scans its journal: "restart, scan the journal: no END → drop it" or, once the line is past `END`, it writes the three blocks in place again in journal order, even blocks already new. The no-journal row has nothing to scan.',
      'The round ends with a verdict for each row. With 2 writes before the crash: "no-journal row: torn · journal row: intact · old". Across the handle the no-journal row is torn only at 1 and 2, intact · old at 0 and intact · new from 3; the journal row is intact · old up to 4 and intact · new from 5, flipping all three blocks at once when the line crosses `END`.',
      'At 6 or 7 the journal row\'s home blocks are mixed at the moment of the crash; the rewrite after restart brings them to new. Readouts under the controls count "No-journal writes", "Journal writes" and "Blocks written again": a complete update costs 3 writes without the journal and 8 with it.',
      'The model journals data blocks too (ext3/ext4 `data=journal`; the common default `data=ordered` journals only metadata). Blocks are either old or new, and a write lands whole or not at all. The no-journal row is shown without running `fsck`, so "torn" means the three blocks are not from one moment, not that they can never be repaired.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle, "Writes before crash", with nine positions 0 to 8, starting at 2. Each round plays up to the crash, the restart and the verdict, then waits for the handle.',
        'The move that makes the idea land is sliding the crash line from 1 to 8: the no-journal verdict goes torn and then settles, while the journal verdict never tears and flips from old to new in one jump between 4 and 5.',
        'The code panel, labelled "Recover after a crash", starts empty with a "+ Add language" button and follows the journal row only. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article argues that journaling exists because a multi-block update can be cut in the middle, and needs every possible crash point shown with and without a journal.',
      'A reader asks what journaling costs, and the article wants the price in writes (3 against 8) next to what it buys: no crash point leaves the blocks torn.',
    ],

    avoidWhen: [
      'The article is about copy-on-write file systems such as ZFS or Btrfs, or log-structured file systems. The model here writes in place after the journal.',
      'The subject is database write-ahead logs with undo, or several concurrent transactions. There is one change and redo only.',
      'The point is the performance of `data=ordered` or `data=writeback` modes. Only full data journaling is modelled.',
    ],

    contrastWith: [
      {
        concept: 'writeIntentFirst',
        note: 'The write order, journal first and home locations only after the end mark, is the rule; varying where a crash interrupts that order is what shows the rule makes every crash point safe.',
      },
      {
        concept: 'replayAfterCrash',
        note: 'Recovery decides what to redo and what to drop for one crashed journal; the crash-consistency claim is about the outcome across all crash points, set against having no journal.',
      },
      {
        concept: 'fileBlockPlacement',
        note: 'The bitmap and inode that a crash can leave out of step are the very structures that record where a file\'s blocks live, which is why leaving them out of step corrupts the file rather than just delaying it.',
      },
    ],
  },
};
