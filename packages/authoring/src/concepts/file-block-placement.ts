/**
 * fileBlockPlacement 개념 선언.
 *
 * canonical facet 은 `facet:fileBlockPlacement` — 열두 블록짜리 `diary.txt` 하나를 두 줄로 나란히 둔다.
 * 위 줄은 inode 색인(직접 칸 넷 · 단일 간접 · 이중 간접), 아래 줄은 FAT 사슬이다. 손잡이 "Block k"
 * (1 · 4 · 5 · 8 · 9 · 12, 처음 9)를 돌리면 두 줄은 늘 같은 블록에 닿고, 거친 칸 수만 inode 1·1·2·2·3·3 의 계단과
 * FAT 1·4·5·8·9·12 의 직선으로 갈린다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 다섯)
 *
 * 조각은 각각 한 장면이다 — inode 칸 차례가 파일 차례(`inodePointsBlocks`) · 칸이 넘쳐 번호 블록으로 내려감
 * (`indirectBlock`) · 표 칸에서 칸으로 건너감(`chainOfBlocks`) · 이름을 마디마다 풀어 inode 에 닿음(`pathResolution`) ·
 * 하드 링크와 심볼릭 링크(`hardVsSoftLink`). 이쪽은 두 배치 방식을 **k 번째 블록에 닿는 값**으로 견주는 것만 쥔다.
 * 그래서 definition 은 k-th block · k lookups · one to three · linked vs indexed 쪽 낱말을 쥐고, 조각들이 독점한
 * slot order · overflow · end marker · pathname · symbolic link 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `fileBlockPlacement.md` 가 밝힌 것):
 *  - 블록 16 · 직접 칸 4 · 번호 블록 하나에 번호 4 는 예로 정한 작은 수다. ext2 는 직접 칸 12, 4 KiB 블록에 번호 1024.
 *  - 세는 것은 디스크 읽기가 아니라 거친 칸 수다. FAT 표는 보통 메모리에 올라 있다. inode 는 이미 읽었다고 치고
 *    디렉터리 항목은 세지 않는다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이라 언어별로 다른 뜻을 보이지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const fileBlockPlacementConcept: FacetConceptSource = {
  id: 'fileBlockPlacement',
  label: 'File Block Placement (FAT Chain vs inode Index)',
  canonicalFacet: 'facet:fileBlockPlacement',

  surface: {
    definition:
      'Reaching the k-th block of a file takes k lookups under linked allocation (a FAT chain) but only one to three under indexed allocation, where an inode keeps the block numbers in direct and indirect slots.',
    exemplarKeywords: [
      'linked allocation vs indexed allocation',
      'file allocation methods',
      'FAT vs inode',
      'FAT32 vs ext2',
      'random access into a file',
      'seek to the middle of a file',
      'cost of reaching the nth block',
      'why FAT is slow for large files',
      'direct and indirect pointers',
      'file system layout comparison',
    ],
  },

  briefing: {
    observable: [
      'One file, `diary.txt`, twelve blocks long, is shown twice. The upper row is "Indexed (inode)": the directory entry reads "diary.txt → inode 21", and inode 21 has four direct slots, a single slot pointing to block 4 and a double slot pointing to block 12. The lower row is "Linked (FAT)": the directory entry reads "diary.txt → first block 9", and a table below holds each block\'s next number.',
      'Both rows record the same order, 9 → 2 → 14 → 5 → 11 → 0 → 7 → 13 → 3 → 10 → 6 → 15, so for any k they land on the same block. Each row has its own "Reads" counter.',
      'A round first walks the inode row, then the FAT row, one read per step. With k = 9 the inode row goes "inode double indirect slot → read pointer block 12", "Slot 1 of block 12 → read pointer block 8", "Slot 1 of block 8 → read data block 3" — 3 reads. The FAT row then goes "Read table entry 9 → next block 2", entry 2, 14, 5, 11, 0, 7, 13 and "Read data block 3" — 9 reads.',
      'Across the handle the inode counter steps 1 · 1 · 2 · 2 · 3 · 3 for k = 1 · 4 · 5 · 8 · 9 · 12, while the FAT counter equals k: 1 · 4 · 5 · 8 · 9 · 12. At k = 12 it is 3 against 12.',
      'Moving k inside a range (1 to 4, 5 to 8, 9 to 12) keeps the inode path the same depth and only shifts the chosen slot; crossing 4|5 or 8|9 adds or removes one pointer block. The FAT footprint trail grows or shrinks by one table entry per step of k.',
      'Reads count every table entry, pointer block and data block as one. They are passes through a structure, not disk reads: a FAT table usually sits in memory, the inode is taken as already read, and directory entries are not counted. Sixteen blocks, four direct slots and four numbers per pointer block are small example sizes; ext2 has twelve direct slots and 1024 numbers per 4 KiB block.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle, "Block k", with six positions 1 · 4 · 5 · 8 · 9 · 12, starting at 9. Readouts "inode reads" and "FAT reads" sit beside it. Each round plays the inode row, then the FAT row, and waits for the handle.',
        'The move that makes the idea land is stepping k across 4|5 and 8|9: the FAT count keeps climbing by one per block while the inode count jumps only at those two boundaries.',
        'The code panel, labelled "Finding the k-th block", starts empty with a "+ Add language" button; the chosen language shows the lookup and highlights the line of the current read. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why a FAT file system handles seeking into large files poorly while inode-based systems do not, and needs the two costs laid side by side for the same file and the same k.',
      'A reader is comparing contiguous, linked and indexed allocation and needs to see that the linked cost is linear in k while the indexed cost only rises at a few fixed boundaries.',
    ],

    avoidWhen: [
      'The article is about how a file grows or how free blocks are chosen. The file here is already laid out; no block is allocated.',
      'The subject is disk seek time or head movement. Nothing here is measured in milliseconds or cylinders.',
      'The point is contiguous allocation or extents. Both layouts here scatter the file across the disk.',
    ],

    contrastWith: [
      {
        concept: 'inodePointsBlocks',
        note: 'That the inode\'s slot order is the file\'s order is the premise; comparing it with a chain asks what that premise buys when the reader wants block k directly.',
      },
      {
        concept: 'indirectBlock',
        note: 'Adding a level of pointer blocks is how an inode reaches larger files; the comparison counts that extra level as the only place the indexed cost ever rises.',
      },
      {
        concept: 'chainOfBlocks',
        note: 'Following a FAT chain from the first block to the end is one traversal; the comparison turns its length into a cost that grows with k and sets it against a nearly flat one.',
      },
      {
        concept: 'traverseFromHead',
        note: 'A FAT chain is a linked list laid over disk blocks, so its linear reach is the same limitation as walking list nodes from the head; an index removes it the way an array does.',
      },
    ],
  },
};
