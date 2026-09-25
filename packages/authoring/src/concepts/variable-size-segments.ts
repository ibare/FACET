/**
 * variableSizeSegments 개념 선언.
 *
 * canonical facet 은 `facet:variableSizeSegments` — 14 KiB 프로그램이 뜻의 경계에서 코드 5 · 데이터 3 · 힙 4 · 스택 2
 * KiB 로 갈라지고, 각자 제 길이 그대로 32 KiB 메모리의 처음 맞는 틈 앞 끝으로 옮겨지며 세그먼트 표에 한 줄(시작 ·
 * 길이)씩 적힌다. 스택은 모자란 1 KiB 틈을 지나쳐 30~32 로 간다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `segmentation`(완제품)은 틈 고르는 규칙을 바꿔도 거절이 자리만 옮긴다는 것을, 형제 `externalFragmentation` 은
 * 들고 나는 사이 틈이 흩어져 큰 것이 못 들어가는 것을 쥔다. 이쪽은 **무엇을 기준으로 자르는가** — 뜻의 경계,
 * 그래서 길이가 제각각이고 표가 덩어리마다 한 줄 — 하나다. 넣고 끝나며, 나가는 것도 못 들어가는 것도 없다.
 * definition 은 logical boundaries · code/data/heap/stack · own length · segment-table row(start, length) 를 독점하고
 * refused · holes 합 · fit rule 이름들을 쓰지 않는다.
 *
 * 전제: 크기와 찬 자리는 예로 정한 값. 넣는 자리는 처음 맞는 틈의 앞 끝.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const variableSizeSegmentsConcept: FacetConceptSource = {
  id: 'variableSizeSegments',
  label: 'Segments Cut by Meaning (Code, Data, Heap, Stack)',
  canonicalFacet: 'facet:variableSizeSegments',

  surface: {
    definition:
      'Segmentation divides a program at logical boundaries such as code, data, heap and stack, so each segment keeps its own length and gets one segment-table row recording where it starts and how long it is.',
    exemplarKeywords: [
      'what is segmentation',
      'segment table base and limit',
      'code segment data segment stack segment',
      'logical units of a program',
      'variable-size segments',
      'segment base and length',
      'segmentation memory management',
      'text data bss heap stack regions',
    ],
  },

  briefing: {
    observable: [
      'Three layers on one scale: the program, "Program: 14 KiB", on top; "Memory: 32 KiB" in the middle; a "Segment table" with columns Segment, Start, Length at the bottom.',
      'Memory already holds the OS at 0–4 KiB and three other blocks marked "in use" at 9, 15 and 27 KiB, leaving four gaps: 4–9 (5 KiB), 12–15 (3), 22–27 (5) and 30–32 (2). The start reads "Not cut yet. Free gaps in memory: 4".',
      'The program splits into four blocks of different lengths: code 5 KiB, data 3, heap 4, stack 2 — "Cut at meaning boundaries — segments: 4".',
      'Each block moves, at its own length, to the lowest gap it fits and sits at the gap\'s low end: "code, 5 KiB → first gap that fits, start 4", then data at 12, heap at 22. A row is added to the table each time.',
      'The stack passes over the 1 KiB left after the heap, too short for 2 KiB, and lands at 30: "Too short, passed over — gaps: 1". The table ends code 4 · 5 KiB, data 12 · 3 KiB, heap 22 · 4 KiB, stack 30 · 2 KiB, and one 1 KiB gap remains at 26–27.',
      'The sizes and occupied regions are chosen for illustration. Placement uses the lowest gap that is long enough; a best-fitting rule would place blocks differently. Nothing leaves and nothing is refused.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself — start, cut, then one placement per segment — and stops after the stack is placed, six steps in all.',
        'A Replay button and a playback strip sit below it. Stopping on the cut step shows the four blocks at their real lengths above the gaps they are about to fill.',
        'The layout is fixed, so an article can quote each segment\'s start and length from the table.',
      ],
    },

    useWhen: [
      'The article introduces segmentation and needs the reader to see that the pieces follow the program\'s structure, so they come out in different lengths, unlike equal pages.',
      'A reader wants to know what a segment table holds, and the article needs rows of start and length filling in one per segment as each is placed.',
    ],

    avoidWhen: [
      'The article is about fragmentation, holes left behind, or requests that cannot be placed. Here nothing leaves and every segment fits.',
      'The subject is comparing placement rules. A single rule, lowest gap that fits, is used throughout.',
      'The point is segment-based address translation, limit checks or protection faults. No address is translated.',
      'The subject is stack versus heap lifetimes inside a running program. The segments here are only placed, not used.',
    ],

    contrastWith: [
      {
        concept: 'fixedSizeFrames',
        note: 'Pages are cut at a fixed length regardless of content, so any piece fits any slot. Segments are cut where meaning changes, so each piece has its own length and needs a gap long enough for it.',
      },
      {
        concept: 'externalFragmentation',
        note: 'Placing blocks of different lengths leaves gaps of different lengths. Once blocks also leave, those gaps scatter until a large request fits nowhere; that later failure is a separate claim.',
      },
      {
        concept: 'segmentation',
        note: 'Why blocks have different lengths is settled by how the program is divided; which hole each should go into, and whether any rule for choosing avoids eventual refusals, is the placement question.',
      },
      {
        concept: 'stackVsHeap',
        note: 'Stack and heap as regions of a process are what segmentation places in memory; what survives a returning function, and why, is a language-level question about lifetimes within those regions.',
      },
    ],
  },
};
