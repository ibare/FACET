/**
 * externalFragmentation 개념 선언.
 *
 * canonical facet 은 `facet:externalFragmentation` — 30 KiB 메모리에 A 6 · B 4 · C 7 · D 3 · E 5 · F 3 이 차례로 앉고,
 * B · D 가 떠나 틈 6~10 · 17~20 · 28~30 이 흩어진다. 8 KiB 짜리 G 가 틈마다 대어 보지만 들어가지 못한다 — 빈 몫
 * 합 9 KiB, 가장 큰 틈 4 KiB. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `segmentation`(완제품)은 규칙 넷을 견주어 거절이 자리만 옮긴다는 것을 쥔다. 이쪽은 규칙 하나(처음 맞는 틈)
 * 로 **현상 자체** — 합은 넉넉한데 어느 한 틈에도 안 들어간다 — 를 쥔다. 형제 `variableSizeSegments` 는 넣고
 * 끝나 틈이 흩어지지 않는다. definition 은 come and go · separate holes · total exceeds · no single hole · compaction
 * 을 독점하고, fit 규칙 이름 · code/data/heap/stack · segment table 을 쓰지 않는다.
 *
 * 전제: 값은 예로 정한 것. 크기는 정수 KiB. 넣기는 처음 맞는 틈의 앞 끝, 이웃한 틈은 하나로 센다.
 * 옮겨 붙이기(압축)는 하지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const externalFragmentationConcept: FacetConceptSource = {
  id: 'externalFragmentation',
  label: 'External Fragmentation (Enough in Total, No Gap Big Enough)',
  canonicalFacet: 'facet:externalFragmentation',

  surface: {
    definition:
      'After blocks of different sizes come and go, free memory is left in separate holes whose total exceeds a new request while no single hole is large enough, so the request fails unless blocks are moved together.',
    exemplarKeywords: [
      'external fragmentation',
      'free memory is fragmented',
      'enough free memory but allocation fails',
      'largest free block',
      'holes between allocated blocks',
      'compaction',
      'contiguous allocation problem',
      'memory fragmentation example',
    ],
  },

  briefing: {
    observable: [
      'A single strip labelled "Memory (KiB)", 0 to 30, with boundary addresses underneath and each gap\'s length written inside it. The start reads "Memory: 30 KiB, all free."',
      'Blocks sweep in from the left and settle in the first gap that fits: "A in: 6 KiB at 0–6.", then B 6–10, C 10–17, D 17–20, E 20–25, F 25–28, leaving 2 KiB at 28–30.',
      'B and D leave upward and their places become gaps: "B out: 6–10 is free again.", "D out: 17–20 is free again." Three gaps remain, 4, 3 and 2 KiB, separated by the blocks still in place.',
      'Two bars on the same scale sit below the strip: "Free in total", drawn as the gaps joined end to end with seams visible, and "Largest gap". Before G arrives they read 9 KiB and 4 KiB.',
      'G, 8 KiB, lowers into each gap in turn and backs out: "G wants 8 KiB: no gap is large enough." Each gap tried keeps a red outline, and G\'s length is laid as a dashed line over both bars — it fits within the total and overruns the largest gap.',
      'The values are chosen for illustration. Placement is first fit at the low end of the gap, and neighbouring free space counts as one gap. Blocks are never shifted to close the gaps; doing that would let G in, at the cost of stopping and moving every block that shifts.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one arrival or departure per step, and ends on the step where G is refused — ten steps including the start.',
        'A Replay button and a playback strip sit below it. Stepping from the last departure to the final step shows the two bars unchanged while G tries and fails each gap.',
        'The sequence is fixed, so an article can cite the gap boundaries and both totals exactly.',
      ],
    },

    useWhen: [
      'The reader does not see how an allocation can fail while plenty of memory is free, and the article needs the two numbers — 9 KiB free, 4 KiB largest — side by side with an 8 KiB request.',
      'The article motivates paging or compaction by first showing the failure they exist to remove.',
    ],

    avoidWhen: [
      'The article compares placement rules such as best fit or worst fit. Only one rule is used here.',
      'The subject is internal fragmentation, waste inside a fixed-size frame or block. Every block here takes exactly its own size.',
      'The point is a garbage collector or heap compactor in a language runtime. Nothing here is collected or moved.',
      'The subject is disk or file-system fragmentation. This strip is main memory.',
    ],

    contrastWith: [
      {
        concept: 'segmentation',
        note: 'The failure can arise under any single placement rule. Whether a different rule avoids it is the comparative question, and the answer is that it only moves where the failure happens.',
      },
      {
        concept: 'variableSizeSegments',
        note: 'Placing blocks of different sizes into gaps is where the problem starts, but while blocks only arrive nothing scatters; gaps separate only once some leave.',
      },
      {
        concept: 'fixedSizeFrames',
        note: 'Cutting every block into equal frames removes this failure, since any free frame fits any piece; the space lost moves inside the last frame instead of between blocks.',
      },
    ],
  },
};
