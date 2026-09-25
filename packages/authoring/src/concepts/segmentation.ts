/**
 * segmentation 개념 선언.
 *
 * canonical facet 은 `facet:segmentation` — 32 KiB 메모리에 요청 열하나(A 7 · B 7 · C 4 · D 4 · E 5 들어옴, E · C ·
 * 셋째 하나 나감, F 4 · G 7 · H 8 들어옴)를 흘린다. 손잡이 둘 — 배치(처음 맞는 틈 · 꼭 맞는 틈 · 가장 큰 틈 · 고정 칸)
 * 와 셋째로 나감(A · B). 못 들어간 네 판 모두 빈 몫 합 10 KiB 가 요청 8 KiB 보다 크고, A 가 나가면 꼭 맞는 틈만,
 * B 가 나가면 처음 맞는 틈만 H 를 받는다. 고정 칸은 늘 받는 대신 안쪽 낭비 2 KiB 를 낸다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `variableSizeSegments` 는 뜻의 경계에서 잘려 제 길이로 놓이는 것, `externalFragmentation` 은 들고 나는 사이 틈이
 * 흩어져 큰 것이 못 들어가는 것(처음 맞는 틈 하나)을 쥔다. 이쪽은 **규칙을 바꿔도 거절은 자리만 옮긴다** 를 쥔다.
 * 그래서 definition 은 first-fit · best-fit · worst-fit · rule · flips · fixed frames 쪽 낱말을 쓰고, 조각들이 쥔
 * code/data/heap/stack · segment table · scattered · total free · largest hole · compaction 을 쓰지 않는다.
 *
 * 전제 (설명 글 `segmentation.md`): 메모리 크기와 요청 열은 예로 정한 값. 넣는 자리는 고른 틈의 앞 끝. 동률은 주소
 * 낮은 틈(이 데이터에서 걸리지 않는다). 옮겨 붙이기(압축)는 하지 않는다. 고정 칸은 4 KiB 프레임.
 * 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const segmentationConcept: FacetConceptSource = {
  id: 'segmentation',
  label: 'Segmentation and Placement Rules (First, Best, Worst Fit)',
  canonicalFacet: 'facet:segmentation',

  surface: {
    definition:
      'Switching the placement rule among first-fit, best-fit and worst-fit does not stop refusals caused by holes, only moves where they occur: one different departure flips which rule succeeds, and fixed-size frames swap holes for internal waste.',
    exemplarKeywords: [
      'first fit vs best fit vs worst fit',
      'dynamic memory allocation strategies',
      'which placement algorithm is best',
      'variable partition allocation',
      'segmentation vs paging',
      'contiguous memory allocation',
      'hole selection',
      'internal vs external fragmentation',
      'memory allocator fit policy',
    ],
  },

  briefing: {
    observable: [
      'A 32 KiB memory strip, one cell per KiB, with a request list beside it: "In: A · 7 KiB", "In: B · 7 KiB", … "Out: E", "Out: C", the third departure, then "In: F · 4 KiB", "In: G · 7 KiB", "In: H · 8 KiB". One request per step, twelve steps per round.',
      'Blocks land at the low end of the chosen hole ("Placed at 22–29 KiB"); a departing block leaves its cells free ("Freed: C"); a request with nowhere to go probes the holes, bounces back and stays above the strip ("No hole fits: 8 KiB").',
      'Bars below the strip stand side by side: Free total, Largest hole, Request, Internal waste. The caption between steps reads, for example, "Free total: 10 KiB · Largest hole: 4 KiB".',
      'Final outcomes for H (8 KiB). With A leaving third: first fit refuses (largest hole 4), best fit accepts, worst fit refuses (largest hole 6). With B leaving third: first fit accepts, best fit refuses (largest hole 6), worst fit refuses (largest hole 7). Every refusal happens with 10 KiB free in total.',
      'Under Fixed frames each block is cut into 4 KiB frames ("Placed in frames: 1, 4") and H is accepted in both columns with no holes left; the Internal waste bar ends at 2 KiB and reaches 5 KiB mid-round when E, 5 KiB, takes two frames. With A leaving third, G lands in frames 1 and 4, apart from each other.',
      'A faint outline under the strip, labelled "Last round", keeps the previous round\'s final layout.',
      'The memory size and the request list are chosen for illustration. Blocks are never moved to merge holes. Equal-length holes would go to the lower address, but no such tie arises in these eight rounds.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Placement" with First fit, Best fit, Worst fit and Fixed frames (starting at First fit), and "Third to leave" with A or B (starting at A). Each round plays all eleven requests, then waits.',
        'Four counters: "Free total (KiB)", "Largest hole (KiB)", "Rejected", "Internal waste (KiB)".',
        'The move that makes the idea land is flipping "Third to leave" while watching which placement rules accept H: the winner changes sides, and worst fit loses both times. Switching to Fixed frames cuts the blocks into pieces; switching back rejoins them, rising from the last round\'s outline into their new places.',
        'The code panel, labelled "Hole placer", starts empty with a "+ Add language" button; the chosen language shows the placement routine and highlights the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article compares first fit, best fit and worst fit and needs to show that none of them is safe: the same eleven requests, with one departure changed, reverse which rule gets the last block in.',
      'The reader is weighing segmentation against paging and needs both costs in one place — refusals despite free space on one side, wasted space inside frames on the other.',
    ],

    avoidWhen: [
      'The subject is how a program is divided into code, data, heap and stack segments, or what a segment table holds. Blocks here are anonymous letters.',
      'The article is about compaction or moving blocks to merge free space. Nothing is ever moved.',
      'The point is a user-space allocator such as malloc with free lists, size classes or coalescing headers. This is placement into one flat strip.',
      'The subject is address translation for segments or pages. No address is translated.',
    ],

    contrastWith: [
      {
        concept: 'externalFragmentation',
        note: 'The failure itself — free space adding up while no hole is large enough — is one phenomenon under one rule. The comparison asks whether a smarter rule prevents it and finds it only moves.',
      },
      {
        concept: 'variableSizeSegments',
        note: 'Dividing a program at its logical boundaries explains why blocks come in different lengths; what happens as such blocks come and go under different placement rules is the longer-term consequence.',
      },
      {
        concept: 'fixedSizeFrames',
        note: 'Equal cuts that land in any free frame are the alternative this comparison measures against: placement never fails for lack of a large enough hole, but the last frame of each block is partly wasted.',
      },
      {
        concept: 'allocateAndFree',
        note: 'When a program allocates and frees is a question about lifetimes; which free region an allocator picks for each request, and how that choice shapes the free space left behind, is the placement question.',
      },
    ],
  },
};
