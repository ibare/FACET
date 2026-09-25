/**
 * pcbHoldsState 개념 선언.
 *
 * canonical facet 은 `facet:pcbHoldsState` — 프로세스 둘(12 편집기 · 15 음악 재생기), 메모리 칸 열 개, 열린 파일 줄.
 * 받는 일 여섯이 받은 프로세스의 표 목록에 한 줄씩 적히고, 12 가 끝나면 커널은 12 의 표 한 장만 따라가 칸 3 · 8 을
 * 돌려받고 `notes.txt` · `draft.txt` 를 닫은 뒤 표를 지운다. 15 의 둘은 건드리지 않는다. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `processState` 의 프로세스 카드는 같은 표의 **상태 칸**(준비 · 실행 · 대기, 남은 틱)이다. 이쪽은 표의
 * **받은 것들** 칸 — 적어 두었다가 끝날 때 그 목록만 따라가 거둔다 — 을 쥔다. 그래서 definition 은 resources ·
 * memory · open files · reclaim at exit · without scanning 을 독점하고, 상태 · 레지스터 값은 쓰지 않는다.
 *
 * 전제 (설명 글 `pcbHoldsState.md`): 프로세스 번호 · 칸 번호 · 파일 이름은 예로 정한 값. 끝난 표가 부모가 거둘 때까지
 * 남는 일(좀비)은 뺐다. 메모리는 칸 열 개로 줄였다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pcbHoldsStateConcept: FacetConceptSource = {
  id: 'pcbHoldsState',
  label: 'Process Control Block Records What a Process Holds',
  canonicalFacet: 'facet:pcbHoldsState',

  surface: {
    definition:
      'The kernel records each memory region and open file granted to a process in that process\'s control block, so when it exits the kernel reclaims exactly those by following its one record instead of scanning every resource.',
    exemplarKeywords: [
      'process control block',
      'PCB',
      'task_struct',
      'per-process file descriptor table',
      'resource cleanup on process exit',
      'kernel bookkeeping per process',
      'memory freed when a process terminates',
      'open files closed at exit',
      'resource leak',
    ],
  },

  briefing: {
    observable: [
      'Along the top are ten memory slots (0 to 9) and an Open files line; below are two process tables, "12 · Editor" and "15 · Music player", each with a Slots list and a Files list. At the start both tables are empty ("One table per process. Free slots: 10.").',
      'Six grants happen in turn, each captioned like "Process 12 takes slot 3. One line is written in its table.": 12 takes slot 3, 15 takes slot 5, 12 opens `notes.txt`, 12 takes slot 8, 15 opens `song.mp3`, 12 opens `draft.txt`. Each item is marked with its owner and a line drops into that owner\'s table.',
      'Then 12 ends. The kernel does not sweep the ten slots and three files; it follows table 12 alone — "slot 3 returned", "slot 8 returned", "notes.txt closed", "draft.txt closed" — in the order the lines were written, slots first, then files.',
      'The last step reads "Table 12 emptied and erased. Followed: 4. Left alone: 2." Table 15 still lists slot 5 and `song.mp3`; nine slots are free and one file stays open. Twelve steps in all.',
      'Process numbers, slot numbers and file names are example values; the table is erased as soon as the process ends (the brief period before a parent collects it is left out), and memory is reduced to ten slots. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the grants and the cleanup by itself and stops once table 12 is erased.',
        'A Replay button and a playback strip sit below it. Holding the step where 12 ends shows the kernel reading one table while the other table\'s lines stay untouched.',
      ],
    },

    useWhen: [
      'The article explains what a process control block is for and needs a concrete reason: without a per-process list, the kernel could not know what to take back when a process exits.',
      'A reader wonders how an operating system avoids leaking memory or file handles when a program ends without freeing them; the table being followed line by line shows the mechanism.',
    ],

    avoidWhen: [
      'The article is about the register values or program counter saved in the control block during a switch. Only granted memory and open files are recorded here.',
      'The subject is page tables or how memory is mapped. Memory is ten numbered slots with owners, not pages or addresses.',
      'The point is process states and how they change. No state field appears.',
    ],

    contrastWith: [
      {
        concept: 'processState',
        note: 'The same per-process record also carries a state and remaining work that change as the process runs; the resources-held side matters only at the moment of cleanup.',
      },
      {
        concept: 'saveAndRestore',
        note: 'Saved registers are the part of the record that lets an interrupted process resume; the list of granted resources is the part that lets a finished one be cleaned up completely.',
      },
    ],
  },
};
