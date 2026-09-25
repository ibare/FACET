/**
 * fixedSizeFrames 개념 선언.
 *
 * canonical facet 은 `facet:fixedSizeFrames` — 14 KiB 프로세스 `p` 가 4 KiB 씩 잘려 페이지 넷이 되고, 이미 찬 칸
 * 0 · 2 · 4 · 6 사이의 떨어진 빈 칸 1 · 3 · 5 · 7 로 하나씩 들어간다. 마지막 페이지는 2 KiB 뿐이라 칸의 2 KiB 가 빈다.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `paging`(완제품)은 TLB 칸 수의 효과를, 형제 `pageTableLookup` 은 주소의 앞쪽만 바뀌는 번역을 쥔다. 이쪽은
 * **올리는 쪽** — 같은 길이로 자르면 떨어진 빈 칸들로도 다 들어간다 — 이다. 번역 걸음이 화면에 없다.
 * definition 은 equal-length · any free frame · non-adjacent · last frame partly unused 를 쥐고, 주소 · 표 · TLB 를
 * 쓰지 않는다. `segmentation` 완제품의 "internal waste" 와 겹치지 않게 definition 에서는 그 낱말을 피하고
 * exemplarKeywords 로만 건다.
 *
 * 전제: 칸 여덟 · 칸 하나 4 KiB · 찬 칸 넷 · 14 KiB 는 예로 정한 값. 빈 칸은 번호가 가장 낮은 것부터 채운다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const fixedSizeFramesConcept: FacetConceptSource = {
  id: 'fixedSizeFrames',
  label: 'Pages Into Frames (Equal Cuts, Scattered Slots)',
  canonicalFacet: 'facet:fixedSizeFrames',

  surface: {
    definition:
      'Paging cuts a process into equal-length pages and drops each one into any free frame, so free frames that are not adjacent still take the whole process and only the last frame is left partly unused.',
    exemplarKeywords: [
      'pages and frames',
      'what is paging',
      'non-contiguous allocation',
      'loading a process into memory',
      'fixed-size partitions',
      'internal fragmentation',
      'last page partially filled',
      'page size 4 KB',
      'free frame list',
    ],
  },

  briefing: {
    observable: [
      'Two rows on one KiB scale: process `p`, 14 KiB, above; memory below, eight frames 0–7 of 4 KiB each. Frames 0 and 2 hold `q`, frames 4 and 6 hold `r`. The start reads "Process p: 14 KiB. Free frames: 4."',
      'The four free frames, 1, 3, 5 and 7, are not next to each other, so no stretch of free memory is longer than 4 KiB.',
      'The process is cut at 0, 4, 8 and 12 KiB: "Cut every 4 KiB. Pages: 4." Pages 0–2 are 4 KiB each; page 3 covers 12–14 KiB.',
      'Pages drop one per step into the lowest-numbered free frame: "Page 0 → free frame 1.", then 1 → 3, 2 → 5.',
      'The last step reads "Page 3 → frame 7. Used 2 KiB, unused 2 KiB." That leftover belongs to `p` and no other process can use it.',
      'No address translation happens on this screen; it shows only where the pages land. The sizes and occupied frames are chosen for illustration, and the lowest-numbered-first order is one choice among several an operating system might make.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself — start, cut, then one placement per page — and stops after page 3, six steps in all.',
        'A Replay button and a playback strip sit below it. Stopping on the cut step shows the four pieces lined up against the frames they will fit, before any has moved.',
        'The layout is fixed, so an article can name each page and the frame it lands in.',
      ],
    },

    useWhen: [
      'The article explains why paging lets a process load even though no single free region is large enough, and wants the pages to visibly land in frames that are separated by other processes.',
      'The reader needs a concrete case of internal fragmentation: a 14 KiB process whose last 4 KiB frame is only half used.',
    ],

    avoidWhen: [
      'The article is about translating addresses through a page table. No address is translated here.',
      'The subject is variable-size allocation, holes, or external fragmentation. Every frame is the same size and every page fits any frame.',
      'The point is demand paging, where pages are brought in only when touched. All four pages are placed up front.',
    ],

    contrastWith: [
      {
        concept: 'variableSizeSegments',
        note: 'Cutting at a fixed length ignores what the pieces mean and makes every piece fit every slot; cutting at logical boundaries keeps meaning together but gives each piece its own length to place.',
      },
      {
        concept: 'externalFragmentation',
        note: 'Equal-size frames remove the situation where free space exists but no hole is large enough; the price is space wasted inside the last frame instead of between blocks.',
      },
      {
        concept: 'pageTableLookup',
        note: 'Scattering pages across frames is what makes a lookup table necessary; translating each address through that table is the separate step that lets the program ignore where its pages landed.',
      },
      {
        concept: 'segmentation',
        note: 'Fixed-size placement always succeeds when enough frames are free, in exchange for waste inside frames; variable-size placement avoids that waste but can refuse a request while space remains, whatever hole-picking rule it uses.',
      },
    ],
  },
};
