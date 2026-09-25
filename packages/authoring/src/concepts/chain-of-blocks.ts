/**
 * chainOfBlocks 개념 선언.
 *
 * canonical facet 은 `facet:chainOfBlocks` — 디렉터리 항목이 `photo` 의 첫 블록 4 를 주고, FAT 의 칸 4 → 9 → 2 → 13
 * → 7 → 11 을 건너가 FAT[11] 의 END 에서 멈춘다. 표에는 따라가지 않는 `memo`(6 → 10 → 3 → END)도 섞여 있다.
 * 일곱 걸음, 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `fileBlockPlacement` 는 FAT 사슬과 inode 색인을 k 로 견준다. 이쪽은 사슬 하나만 — 다음 번호가 블록 안이 아니라
 * 블록마다 한 칸씩 가진 **표**에 있고, 칸에서 칸으로 건너가야 다음을 안다는 장면이다. 그래서 definition 은 table entry ·
 * next-block number · end marker · first cluster 쪽 낱말을 쥐고, inode · index · k lookups 를 쓰지 않는다.
 *
 * 전제: 블록 · 칸 16 개는 예로 정한 값이다. 실제 FAT 는 칸 폭(FAT12 · 16 · 32 의 12 · 16 · 28 비트)이 클러스터 수를
 * 정하고 끝 표식 · 빈칸을 특수 값으로 적는다. 표는 보통 메모리에 있어 칸 읽기가 디스크 읽기가 아니다 — 칸 읽는 횟수만 센다.
 * 사슬을 읽기만 하고 새 블록을 잡지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const chainOfBlocksConcept: FacetConceptSource = {
  id: 'chainOfBlocks',
  label: 'FAT Chain (Next Block Stored in a Table)',
  canonicalFacet: 'facet:chainOfBlocks',

  surface: {
    definition:
      'In a FAT file system each table entry holds the number of the block that follows it, so a file is read by starting at the directory\'s first cluster and hopping entry to entry until an end marker.',
    exemplarKeywords: [
      'file allocation table',
      'FAT12 FAT16 FAT32',
      'cluster chain',
      'end-of-chain marker',
      'exFAT',
      'USB stick file system',
      'next cluster number',
      'linked allocation in a table',
      'following the chain',
    ],
  },

  briefing: {
    observable: [
      'At the top are two directory entries, each holding only a name and a first block: `photo` 4 and `memo` 6. Below them runs the FAT, sixteen entries numbered 0 to 15, and under each entry the data block with the same number.',
      'A marker comes down from `photo` to entry 4 and then hops along arcs: entry 4 holds 9, entry 9 holds 2, then 13, 7 and 11. Each hop leaves its arc behind, so the file is seen zigzagging left and right across the table.',
      'Each time the marker reaches an entry, the data block below it gets its piece number stamped. A caption reads, for example, "Piece 5 is block 7. FAT[7] holds the next number: 11." A counter "FAT cells read before this piece" rises from 0 to 5.',
      'At entry 11 the caption reads "Piece 6 is block 11. FAT[11] holds END: the chain stops." Six pieces were found in seven steps; the sixth could only be located after five table entries had been read.',
      'The chain of `memo` (6 → 10 → 3 → END) sits in the same table but is never followed, and entries 0 · 1 · 5 · 8 · 12 · 14 · 15 are empty. Looking at an entry alone does not say which file it belongs to.',
      'Sixteen blocks are an example size; in a real FAT the entry width (12, 16 or 28 bits in FAT12, FAT16 and FAT32) bounds the number of clusters, and end and free marks are special values. The table is usually held in memory, so only entry reads are counted, not disk reads.',
    ],

    screen: {
      affordances: [
        'The screen plays the seven steps by itself — the first number, then six hops — and stops at END.',
        'A Replay button and a playback strip sit below it. Dragging the strip back shows how far along the chain each piece was.',
        'Table values and file names are fixed, so an article can quote every hop exactly.',
      ],
    },

    useWhen: [
      'The article explains how FAT stores a file: the directory gives only the first cluster, and every next cluster number is in the table, not inside the data block.',
      'A reader wonders why reaching the middle of a FAT file means starting from its beginning, and the article needs the count of table entries read before each piece.',
    ],

    avoidWhen: [
      'The article compares FAT with inode-based allocation. Only the chain is shown here.',
      'The subject is allocating new clusters or fragmentation over time. The chain is only read; nothing is written.',
      'The point is a linked list in memory. The links here are table entries indexed by block number, not pointers stored in the nodes.',
    ],

    contrastWith: [
      {
        concept: 'fileBlockPlacement',
        note: 'Following the chain once shows how FAT reaches a block; turning that into a cost that grows with the block\'s position, and setting it against an inode\'s near-constant cost, is a comparison of two layouts.',
      },
      {
        concept: 'inodePointsBlocks',
        note: 'Both answer where a file\'s block order is written. FAT puts one next-number per block into a shared table; an inode keeps all of a file\'s numbers together in one place.',
      },
      {
        concept: 'traverseFromHead',
        note: 'Both reach an item only by following links from the start. In FAT the links are kept apart from the data, in a table indexed by block number, rather than inside each node.',
      },
    ],
  },
};
