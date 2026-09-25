/**
 * indirectBlock 개념 선언.
 *
 * canonical facet 은 `facet:indirectBlock` — 파일 `video` 가 블록을 하나씩 덧붙이며 자란다. 처음 넷(3 · 4 · 7 · 8)은
 * inode 의 직접 칸 넷에 적히고, 다섯째가 올 때 블록 10 을 잡아 데이터가 아니라 번호를 담는 블록으로 쓴다. 뒤의
 * 11 · 12 · 14 는 블록 10 의 칸에 적힌다. 아홉 걸음, 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `inodePointsBlocks` 는 칸 차례가 파일 차례라는 것, 완제품 `fileBlockPlacement` 는 k 번째 블록에 닿는 값의 견줌이다.
 * 이쪽은 **칸이 모자라는 순간** 하나 — 번호가 디스크 블록으로 내려가 적히고 inode 에는 그 블록 번호 하나만 남는다.
 * 그래서 definition 은 direct slots full · spill · block that holds numbers · maximum file size 쪽 낱말을 쥔다.
 *
 * 전제: 디스크 블록 20 · 직접 칸 4 · 블록 하나에 번호 4 는 예로 정한 값이다. ext2 는 직접 칸 12, 4 KiB 블록에
 * 번호 1024(1 KiB 면 256). 새 블록은 번호가 가장 작은 빈칸을 잡는다. 이중 · 삼중 간접은 그리지 않았다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const indirectBlockConcept: FacetConceptSource = {
  id: 'indirectBlock',
  label: 'Indirect Block (When Direct Slots Run Out)',
  canonicalFacet: 'facet:indirectBlock',

  surface: {
    definition:
      'Once an inode\'s direct slots are full, further block numbers spill into a disk block that holds numbers instead of data, raising the maximum file size at the cost of one more read.',
    exemplarKeywords: [
      'single indirect block',
      'double indirect',
      'triple indirect',
      'maximum file size ext2',
      'pointer block',
      'inode runs out of direct pointers',
      'multi-level index',
      'how large files are stored',
      'metadata overhead for big files',
    ],
  },

  briefing: {
    observable: [
      'An empty "inode of video" with four Direct slots and one Indirect slot stands above a disk of twenty blocks, 0 to 19. Some blocks belong to "Other files"; the legend also names "Data of video" and "Number block".',
      'The first four steps each take the lowest free block and write its number into the next direct slot: "Data 1 → block 3. Its number goes in direct slot 0.", then 4, 7, 8. A readout shows "Disk reads to reach data 1: 1".',
      'At the fifth block the screen stops to say "Direct slots are full. Block 10 becomes the indirect block: it will hold numbers." Block 10 is labelled "Block 10 — numbers, not data", the inode\'s Indirect slot now holds 10, and the readout shows "Data blocks the inode can reach: 4 → 8".',
      'The next three data blocks go to 11, 12 and 14, and each number is written into block 10, not the inode: "Data 5 → block 11. No room in the inode — its number goes in slot 0 of block 10." The reach readout now shows "Disk reads to reach data 5: 2". The last slot of block 10 stays empty.',
      'A running count ends at "Disk blocks used: 8 (data 7 + number blocks 1)": one of the eight blocks holds only numbers.',
      'Twenty blocks, four direct slots and four numbers per block are example sizes. ext2 has twelve direct slots, and a 4 KiB block holds 1024 four-byte numbers. Double and triple indirect slots, which add further levels, are not drawn.',
    ],

    screen: {
      affordances: [
        'The screen plays the nine steps by itself: the empty inode, four direct placements, the spill to block 10, and three placements into block 10.',
        'A Replay button and a playback strip sit below it. Dragging the strip to the spill step holds the moment the inode stops taking data numbers.',
        'Block numbers and counts are fixed, so an article can quote them exactly.',
      ],
    },

    useWhen: [
      'The article explains how a fixed-size inode can describe files of almost any size, and needs the moment the direct slots run out and a block of numbers takes over.',
      'A reader asks why the ext2 maximum file size is what it is, and the article wants the reach doubling from 4 to 8 blocks here before scaling up to 1024 numbers per block.',
    ],

    avoidWhen: [
      'The article compares FAT with inode-based allocation. Only the inode side is shown.',
      'The subject is extents or contiguous allocation. Every data block here gets its own number.',
      'The point is free-space management. Free blocks are simply taken lowest first; no bitmap or list is shown.',
    ],

    contrastWith: [
      {
        concept: 'inodePointsBlocks',
        note: 'While every number fits in the inode, the slots alone give the file\'s order. This begins where they stop fitting and a second layer holds the rest.',
      },
      {
        concept: 'fileBlockPlacement',
        note: 'The extra level costs one more read for the blocks behind it; weighing that cost against a chain that grows by one read per block is a comparison of two layouts, not the mechanism of the spill.',
      },
    ],
  },
};
