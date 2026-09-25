/**
 * inodePointsBlocks 개념 선언.
 *
 * canonical facet 은 `facet:inodePointsBlocks` — 파일 `kernel` 의 inode 에 직접 칸 여섯이 11 · 3 · 14 · 6 · 9 · 1 을
 * 쥐고 있다. 칸을 차례로 짚을 때마다 그 블록의 글자가 빠져나와 이어 붙어 KERNEL 이 된다. 디스크 위에서는 앞뒤로
 * 건너뛰는데 모인 글은 흐트러지지 않는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `fileBlockPlacement` 는 k 번째 블록에 닿는 값을 두 방식으로 견준다. 이쪽은 값을 세지 않는다 — 주장은
 * "흩어진 블록의 차례를 쥔 것은 디스크 자리가 아니라 inode 의 칸 차례다" 하나다. 그래서 definition 은
 * scattered · slot order · which blocks belong 쪽 낱말을 쥐고, k-th · lookups · indirect · overflow 를 쓰지 않는다.
 *
 * 전제: 디스크 블록 16 · 직접 칸 6 · 블록 내용을 글자 하나로 줄인 것은 예로 정한 값이다. 간접 칸은 그리지 않았다.
 * 파일 이름은 inode 가 아니라 디렉터리 항목에 있다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const inodePointsBlocksConcept: FacetConceptSource = {
  id: 'inodePointsBlocks',
  label: 'inode Slots Hold a File\'s Block Order',
  canonicalFacet: 'facet:inodePointsBlocks',

  surface: {
    definition:
      'An inode records which scattered disk blocks belong to a file and in what order: reading its slots one by one reassembles the content, whatever the blocks\' positions on disk.',
    exemplarKeywords: [
      'what is an inode',
      'inode block pointers',
      'direct blocks',
      'non-contiguous file storage',
      'file data scattered across the disk',
      'how does the file system know which blocks are a file',
      'index node',
      'file metadata structure',
      'ext2 ext4 inode',
    ],
  },

  briefing: {
    observable: [
      'A row of sixteen disk blocks, 0 to 15, each holding one letter, is coloured by owner: blocks of the file, blocks of "Other file", and "Free" blocks. Beside it stands the "inode" of `kernel` with six slots holding 11 · 3 · 14 · 6 · 9 · 1.',
      'Each step reads one slot: "Slot 0 → block 11 · K", then "Slot 1 → block 3 · E", and so on. The letter leaves its block and joins the "File contents" line, and a "Slots read" counter climbs from 0/6 to 6/6.',
      'On the disk the reading jumps 11 → 3 → 14 → 6 → 9 → 1, back and forth, yet the assembled line grows K, KE, KER, KERN, KERNE, KERNEL without ever going out of order.',
      'Blocks 2 · 4 · 7 · 8 · 12 · 13 belong to another file and 0 · 5 · 10 · 15 are free; nothing on a block itself says which file it belongs to or where it falls in that file.',
      'Sixteen blocks, six direct slots and one letter per block are example values. Real blocks are usually 4 KiB and an ext2 inode has twelve direct slots plus indirect slots, which are not drawn here. The file name is kept in the directory entry, not in the inode.',
    ],

    screen: {
      affordances: [
        'The screen plays the six reads by itself and stops at KERNEL.',
        'A Replay button and a playback strip sit below it. Dragging the strip back to a middle step shows a half-assembled word next to the disk jumps that produced it.',
        'The inode, the disk and the word are fixed, so an article can quote every slot number and letter exactly.',
      ],
    },

    useWhen: [
      'The article introduces the inode and needs to show what its block slots are for: a file\'s pieces are scattered, and the slot order alone says how they go back together.',
      'A reader assumes a file sits in consecutive blocks, and the article wants the counterexample where reading the same six blocks in disk order would give LENEKR instead of KERNEL.',
    ],

    avoidWhen: [
      'The article is about files too large for the direct slots or about indirect blocks. Only six direct slots are drawn.',
      'The subject is how many reads it takes to reach a given block. Each slot here is read in turn; no position is jumped to.',
      'The point is file names, directories or permissions. The screen shows block numbers and contents only.',
    ],

    contrastWith: [
      {
        concept: 'fileBlockPlacement',
        note: 'Keeping block numbers together in an index is what lets indexed allocation reach any block in a few steps; the cost comparison with a chain rests on this one fact.',
      },
      {
        concept: 'indirectBlock',
        note: 'Slot order as file order assumes every number fits in the inode. When they no longer do, the rest spill into a separate block of numbers, which is a different claim.',
      },
      {
        concept: 'chainOfBlocks',
        note: 'Both answer where a file\'s order is written. The inode keeps all numbers in one place; FAT spreads them across a table, one next-number per block.',
      },
      {
        concept: 'pathResolution',
        note: 'Finding which inode a name refers to comes first; this starts once the inode is in hand and asks how it leads to the data.',
      },
    ],
  },
};
